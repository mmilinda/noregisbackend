const jwt         = require('jsonwebtoken');
const Utilisateur = require('../models/Utilisateur');

// Champs de profil éditables (sauf mot de passe et role qui ont leurs propres endpoints)
const PROFILE_FIELDS = ['nom', 'prenom', 'telephone', 'departement', 'poste', 'niveauAccreditation', 'dateArrivee'];

const login = async (req, res) => {
  try {
    const { email, motDePasse } = req.body;
    if (!email || !motDePasse) {
      return res.status(400).json({ success: false, message: 'Email et mot de passe requis.' });
    }
    const utilisateur = await Utilisateur.findOne({ email });
    if (!utilisateur) {
      return res.status(401).json({ success: false, message: 'Identifiants incorrects.' });
    }
    if (!utilisateur.isActif) {
      return res.status(403).json({ success: false, message: 'Compte désactivé.' });
    }
    const motDePasseValide = await utilisateur.verifierMotDePasse(motDePasse);
    if (!motDePasseValide) {
      return res.status(401).json({ success: false, message: 'Identifiants incorrects.' });
    }
    const token = jwt.sign(
      { id: utilisateur._id, role: utilisateur.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );
    res.json({
      success: true,
      message: 'Connexion réussie.',
      token,
      utilisateur: {
        id: utilisateur._id,
        nom: utilisateur.nom,
        prenom: utilisateur.prenom,
        email: utilisateur.email,
        role: utilisateur.role,
        telephone: utilisateur.telephone,
        departement: utilisateur.departement,
        poste: utilisateur.poste,
        niveauAccreditation: utilisateur.niveauAccreditation,
        dateArrivee: utilisateur.dateArrivee,
        createdAt: utilisateur.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const register = async (req, res) => {
  try {
    const { nom, prenom, email, motDePasse, role, telephone, departement, poste, niveauAccreditation, dateArrivee } = req.body;
    if (!nom || !email || !motDePasse) {
      return res.status(400).json({ success: false, message: 'Nom, email et mot de passe requis.' });
    }
    const existeDeja = await Utilisateur.findOne({ email });
    if (existeDeja) {
      return res.status(409).json({ success: false, message: 'Email déjà utilisé.' });
    }
    const utilisateur = new Utilisateur({
      nom, prenom, email, motDePasse, role,
      telephone, departement, poste, niveauAccreditation,
      dateArrivee: dateArrivee ? new Date(dateArrivee) : null,
    });
    await utilisateur.save();
    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès.',
      utilisateur: { id: utilisateur._id, nom: utilisateur.nom, prenom: utilisateur.prenom, email: utilisateur.email, role: utilisateur.role },
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
      id: u._id, nom: u.nom, prenom: u.prenom, email: u.email, role: u.role,
      telephone: u.telephone, departement: u.departement, poste: u.poste,
      niveauAccreditation: u.niveauAccreditation, dateArrivee: u.dateArrivee,
      createdAt: u.createdAt,
    },
  });
};

// Met à jour son propre profil OU celui d'un autre (admin seulement pour les autres)
const mettreAJourProfil = async (req, res) => {
  try {
    const targetId = req.params.id || req.utilisateur._id;

    // Un AGENT ne peut modifier que son propre profil
    if (String(req.utilisateur._id) !== String(targetId) && req.utilisateur.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Accès refusé.' });
    }

    const updates = {};
    PROFILE_FIELDS.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = field === 'dateArrivee' ? (req.body[field] ? new Date(req.body[field]) : null) : req.body[field];
      }
    });

    // L'admin peut aussi changer le rôle
    if (req.utilisateur.role === 'ADMIN' && req.body.role && ['AGENT', 'ADMIN'].includes(req.body.role)) {
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
    const utilisateurs = await Utilisateur.find({}, '-motDePasse').sort({ createdAt: -1 });
    res.json({ success: true, utilisateurs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const toggleActif = async (req, res) => {
  try {
    const { id } = req.params;
    const utilisateur = await Utilisateur.findById(id);
    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur introuvable.' });
    }
    if (String(req.utilisateur._id) === String(utilisateur._id)) {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez pas désactiver votre propre compte.' });
    }
    utilisateur.isActif = !utilisateur.isActif;
    await utilisateur.save();
    res.json({ success: true, message: `Statut mis à jour : ${utilisateur.isActif ? 'Actif' : 'Inactif'}.`, utilisateur });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { login, register, monProfil, mettreAJourProfil, listerUtilisateurs, toggleActif };