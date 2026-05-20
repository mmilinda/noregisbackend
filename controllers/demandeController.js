const DemandeModification = require('../models/DemandeModification');
const Utilisateur         = require('../models/Utilisateur');

// Champs éditables via demande
const CHAMPS_EDITABLES = ['nom', 'prenom', 'telephone', 'departement', 'poste', 'niveauAccreditation', 'dateArrivee'];

// POST /api/demandes — Agent soumet une demande
const soumettreDemande = async (req, res) => {
  try {
    const { modifications, motif } = req.body;

    if (!modifications || typeof modifications !== 'object' || Object.keys(modifications).length === 0) {
      return res.status(400).json({ success: false, message: 'Au moins un champ à modifier est requis.' });
    }

    // Filtrer uniquement les champs autorisés
    const modifsFiltrees = {};
    CHAMPS_EDITABLES.forEach(key => {
      if (modifications[key] !== undefined && modifications[key] !== '') {
        modifsFiltrees[key] = modifications[key];
      }
    });

    if (Object.keys(modifsFiltrees).length === 0) {
      return res.status(400).json({ success: false, message: 'Aucun champ valide à modifier.' });
    }

    // Empêcher une double demande en attente pour le même agent
    const dejaEnAttente = await DemandeModification.findOne({
      utilisateur: req.utilisateur._id,
      statut: 'en_attente',
    });
    if (dejaEnAttente) {
      return res.status(409).json({
        success: false,
        message: 'Vous avez déjà une demande en attente. Attendez qu\'elle soit traitée avant d\'en soumettre une nouvelle.',
      });
    }

    const demande = new DemandeModification({
      utilisateur: req.utilisateur._id,
      modifications: modifsFiltrees,
      motif: motif || '',
    });

    await demande.save();
    res.status(201).json({ success: true, message: 'Demande soumise avec succès. L\'administrateur la traitera prochainement.', demande });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/demandes — Admin liste toutes les demandes (filtrables par statut)
const listerDemandes = async (req, res) => {
  try {
    const { statut = 'en_attente' } = req.query;
    const filter = statut === 'all' ? {} : { statut };

    const demandes = await DemandeModification
      .find(filter)
      .populate('utilisateur', '-motDePasse')
      .populate('traiteePar', 'nom prenom')
      .sort({ createdAt: -1 });

    res.json({ success: true, demandes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/demandes/:id/approuver — Admin approuve et applique les changements
const approuverDemande = async (req, res) => {
  try {
    const demande = await DemandeModification.findById(req.params.id).populate('utilisateur');
    if (!demande) {
      return res.status(404).json({ success: false, message: 'Demande introuvable.' });
    }
    if (demande.statut !== 'en_attente') {
      return res.status(400).json({ success: false, message: 'Cette demande a déjà été traitée.' });
    }

    // Appliquer les modifications sur l'utilisateur
    const updates = {};
    CHAMPS_EDITABLES.forEach(key => {
      if (demande.modifications[key] !== undefined) {
        updates[key] = key === 'dateArrivee'
          ? (demande.modifications[key] ? new Date(demande.modifications[key]) : null)
          : demande.modifications[key];
      }
    });

    await Utilisateur.findByIdAndUpdate(demande.utilisateur._id, { $set: updates });

    demande.statut = 'approuve';
    demande.traiteePar = req.utilisateur._id;
    await demande.save();

    res.json({ success: true, message: 'Demande approuvée et profil mis à jour.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/demandes/:id/rejeter — Admin rejette avec motif optionnel
const rejeterDemande = async (req, res) => {
  try {
    const demande = await DemandeModification.findById(req.params.id);
    if (!demande) {
      return res.status(404).json({ success: false, message: 'Demande introuvable.' });
    }
    if (demande.statut !== 'en_attente') {
      return res.status(400).json({ success: false, message: 'Cette demande a déjà été traitée.' });
    }

    demande.statut = 'rejete';
    demande.traiteePar = req.utilisateur._id;
    demande.motifRejet = req.body.motif || '';
    await demande.save();

    res.json({ success: true, message: 'Demande rejetée.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/demandes/ma-demande — Agent vérifie l'état de sa propre demande en attente
const maDemande = async (req, res) => {
  try {
    const demande = await DemandeModification.findOne({
      utilisateur: req.utilisateur._id,
      statut: 'en_attente',
    });
    res.json({ success: true, demande });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { soumettreDemande, listerDemandes, approuverDemande, rejeterDemande, maDemande };
