const jwt         = require('jsonwebtoken');
const Utilisateur = require('../models/Utilisateur');
const Entreprise  = require('../models/Entreprise');

const PROFILE_FIELDS = ['nom', 'prenom', 'telephone', 'departement', 'poste', 'niveauAccreditation', 'dateArrivee'];

const helperGenererReponseAuth = (utilisateur, message = 'Connexion réussie.') => {
  const token = jwt.sign(
    { id: utilisateur._id, role: utilisateur.role, entrepriseId: utilisateur.entrepriseId?._id || utilisateur.entrepriseId || null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
  );

  const entObj = utilisateur.entrepriseId && typeof utilisateur.entrepriseId === 'object'
    ? { id: utilisateur.entrepriseId._id, nom: utilisateur.entrepriseId.nom, code: utilisateur.entrepriseId.code }
    : utilisateur.entrepriseId;

  return {
    success: true,
    message,
    token,
    utilisateur: {
      id: utilisateur._id,
      nom: utilisateur.nom,
      prenom: utilisateur.prenom,
      email: utilisateur.email,
      role: utilisateur.role,
      entrepriseId: entObj,
      statutCompte: utilisateur.statutCompte || 'ACTIF',
      isActif: utilisateur.isActif,
      telephone: utilisateur.telephone,
      departement: utilisateur.departement,
      poste: utilisateur.poste,
      niveauAccreditation: utilisateur.niveauAccreditation,
      dateArrivee: utilisateur.dateArrivee,
      createdAt: utilisateur.createdAt,
    },
  };
};

const login = async (req, res) => {
  try {
    const { email, motDePasse } = req.body;
    if (!email || !motDePasse) {
      return res.status(400).json({ success: false, message: 'Email et mot de passe requis.' });
    }
    const utilisateur = await Utilisateur.findOne({ email }).populate('entrepriseId');
    if (!utilisateur) {
      return res.status(401).json({ success: false, message: 'Identifiants incorrects.' });
    }

    if (utilisateur.statutCompte !== 'ACTIF' || !utilisateur.isActif) {
      const msg = utilisateur.statutCompte === 'SUSPENDU'
        ? 'Votre compte a été suspendu.'
        : 'Votre compte est désactivé.';
      return res.status(403).json({ success: false, message: msg });
    }

    if (utilisateur.entrepriseId && typeof utilisateur.entrepriseId === 'object' && utilisateur.entrepriseId.statut !== 'ACTIF') {
      const msg = utilisateur.entrepriseId.statut === 'SUSPENDU'
        ? 'Votre entreprise a été suspendue.'
        : 'Votre entreprise est désactivée.';
      return res.status(403).json({ success: false, message: msg });
    }

    const motDePasseValide = await utilisateur.verifierMotDePasse(motDePasse);
    if (!motDePasseValide) {
      return res.status(401).json({ success: false, message: 'Identifiants incorrects.' });
    }

    if (utilisateur.is2FAEnabled) {
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      utilisateur.otpCode = otpCode;
      utilisateur.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await utilisateur.save();

      return res.json({
        success: true,
        require2FA: true,
        userId: utilisateur._id,
        email: utilisateur.email,
        message: 'Un code de vérification à 6 chiffres a été généré.',
        otpPreview: otpCode,
      });
    }

    res.json(helperGenererReponseAuth(utilisateur));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const verifier2FA = async (req, res) => {
  try {
    const { userId, code } = req.body;
    if (!userId || !code) {
      return res.status(400).json({ success: false, message: 'Identifiant utilisateur et code requis.' });
    }

    const utilisateur = await Utilisateur.findById(userId).populate('entrepriseId');
    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    }

    if (!utilisateur.otpCode || !utilisateur.otpExpiresAt) {
      return res.status(400).json({ success: false, message: 'Aucun code de vérification en attente.' });
    }

    if (new Date() > new Date(utilisateur.otpExpiresAt)) {
      return res.status(400).json({ success: false, message: 'Le code de vérification a expiré.' });
    }

    if (utilisateur.otpCode !== String(code).trim()) {
      return res.status(400).json({ success: false, message: 'Code de vérification incorrect.' });
    }

    utilisateur.otpCode = null;
    utilisateur.otpExpiresAt = null;
    await utilisateur.save();

    res.json(helperGenererReponseAuth(utilisateur, 'Authentification 2FA réussie.'));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const renvoyer2FA = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Identifiant utilisateur requis.' });
    }

    const utilisateur = await Utilisateur.findById(userId);
    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    utilisateur.otpCode = otpCode;
    utilisateur.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await utilisateur.save();

    res.json({
      success: true,
      message: 'Un nouveau code de vérification a été généré.',
      otpPreview: otpCode,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const register = async (req, res) => {
  try {
    const {
      nom, prenom, email, motDePasse, role, entrepriseId,
      telephone, departement, poste, niveauAccreditation, dateArrivee
    } = req.body;

    if (!nom || !email || !motDePasse) {
      return res.status(400).json({ success: false, message: 'Nom, email et mot de passe requis.' });
    }

    const createur = req.utilisateur;
    let targetRole = role || 'AGENT';
    let targetEntrepriseId = entrepriseId || null;

    if (createur) {
      if (createur.role === 'ADMIN') {
        targetRole = 'AGENT'; // Un Admin de boîte ne peut créer que des Agents
        targetEntrepriseId = createur.entrepriseId?._id || createur.entrepriseId;
      } else if (createur.role === 'SUPER_ADMIN') {
        if (!['ADMIN', 'AGENT', 'SUPER_ADMIN'].includes(targetRole)) {
          return res.status(400).json({ success: false, message: 'Rôle invalide.' });
        }
      } else {
        return res.status(403).json({ success: false, message: 'Seuls les Administrateurs peuvent créer des comptes.' });
      }
    }

    const existeDeja = await Utilisateur.findOne({ email: String(email).toLowerCase().trim() });
    if (existeDeja) {
      return res.status(409).json({ success: false, message: 'Cet adresse e-mail est déjà utilisée.' });
    }

    const utilisateur = new Utilisateur({
      nom: String(nom).trim(),
      prenom: prenom ? String(prenom).trim() : '',
      email: String(email).toLowerCase().trim(),
      motDePasse,
      role: targetRole,
      entrepriseId: targetEntrepriseId,
      statutCompte: 'ACTIF',
      telephone: telephone || '',
      departement: departement || '',
      poste: poste || '',
      niveauAccreditation: niveauAccreditation || '',
      dateArrivee: dateArrivee ? new Date(dateArrivee) : null,
    });

    await utilisateur.save();

    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès.',
      utilisateur: {
        id: utilisateur._id,
        nom: utilisateur.nom,
        prenom: utilisateur.prenom,
        email: utilisateur.email,
        role: utilisateur.role,
        entrepriseId: utilisateur.entrepriseId,
        statutCompte: utilisateur.statutCompte,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const monProfil = async (req, res) => {
  const u = req.utilisateur;
  res.json({
    success: true,
    utilisateur: {
      id: u._id,
      nom: u.nom,
      prenom: u.prenom,
      email: u.email,
      role: u.role,
      entrepriseId: u.entrepriseId,
      statutCompte: u.statutCompte,
      telephone: u.telephone,
      departement: u.departement,
      poste: u.poste,
      niveauAccreditation: u.niveauAccreditation,
      dateArrivee: u.dateArrivee,
      createdAt: u.createdAt,
    },
  });
};

const mettreAJourProfil = async (req, res) => {
  try {
    const targetId = req.params.id || req.utilisateur._id;

    if (String(req.utilisateur._id) !== String(targetId) && req.utilisateur.role !== 'SUPER_ADMIN' && req.utilisateur.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Accès refusé.' });
    }

    const updates = {};
    PROFILE_FIELDS.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = field === 'dateArrivee' ? (req.body[field] ? new Date(req.body[field]) : null) : req.body[field];
      }
    });

    if (req.utilisateur.role === 'SUPER_ADMIN' && req.body.role) {
      updates.role = req.body.role;
    }

    const utilisateur = await Utilisateur.findByIdAndUpdate(
      targetId,
      { $set: updates },
      { new: true, runValidators: true, select: '-motDePasse' }
    );

    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    }

    res.json({ success: true, message: 'Profil mis à jour.', utilisateur });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const listerUtilisateurs = async (req, res) => {
  try {
    const demandeur = req.utilisateur;
    let filtre = {};

    if (demandeur.role === 'SUPER_ADMIN') {
      if (req.query.entrepriseId) filtre.entrepriseId = req.query.entrepriseId;
      if (req.query.role) filtre.role = req.query.role;
    } else if (demandeur.role === 'ADMIN') {
      const entId = demandeur.entrepriseId?._id || demandeur.entrepriseId;
      filtre = {
        entrepriseId: entId,
        role: 'AGENT',
      };
    } else {
      return res.status(403).json({ success: false, message: 'Accès refusé.' });
    }

    const utilisateurs = await Utilisateur.find(filtre, '-motDePasse')
      .populate('entrepriseId', 'nom code statut')
      .sort({ createdAt: -1 });

    res.json({ success: true, utilisateurs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const toggleActif = async (req, res) => {
  try {
    const { id } = req.params;
    const { statutCompte } = req.body;
    const demandeur = req.utilisateur;

    const cible = await Utilisateur.findById(id);
    if (!cible) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    }

    if (String(demandeur._id) === String(cible._id)) {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez pas modifier le statut de votre propre compte.' });
    }

    if (demandeur.role === 'ADMIN') {
      const entDemandeur = demandeur.entrepriseId?._id || demandeur.entrepriseId;
      const entCible = cible.entrepriseId?._id || cible.entrepriseId;
      if (String(entDemandeur) !== String(entCible) || cible.role !== 'AGENT') {
        return res.status(403).json({ success: false, message: 'Un administrateur de boîte ne peut modifier que le statut de ses propres agents.' });
      }
    } else if (demandeur.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Accès refusé.' });
    }

    if (statutCompte && ['ACTIF', 'SUSPENDU', 'DESACTIVE'].includes(statutCompte)) {
      cible.statutCompte = statutCompte;
    } else {
      cible.statutCompte = cible.statutCompte === 'ACTIF' ? 'SUSPENDU' : 'ACTIF';
    }

    cible.isActif = cible.statutCompte === 'ACTIF';
    await cible.save();

    res.json({
      success: true,
      message: `Statut du compte ${cible.nom} ${cible.prenom} mis à jour : ${cible.statutCompte}.`,
      utilisateur: cible,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const genererQrAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const agent = await Utilisateur.findById(id);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent introuvable.' });
    }

    const scanPath = `/scan/${agent._id}`;

    res.json({
      success: true,
      message: 'Lien de scan généré.',
      qrPath: scanPath,
      agent: {
        id: agent._id,
        nom: agent.nom,
        prenom: agent.prenom,
        email: agent.email,
      },
    });
  } catch (err) {
    console.error('Erreur génération QR :', err);
    res.status(500).json({ success: false, message: 'Impossible de générer le QR code.' });
  }
};

module.exports = { login, verifier2FA, renvoyer2FA, register, monProfil, mettreAJourProfil, listerUtilisateurs, toggleActif, genererQrAgent };
