const jwt         = require('jsonwebtoken');
const Utilisateur = require('../models/Utilisateur');
const Entreprise  = require('../models/Entreprise');

const authentifier = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token manquant.' });
    }
    const token       = authHeader.split(' ')[1];
    const decoded     = jwt.verify(token, process.env.JWT_SECRET);
    const utilisateur = await Utilisateur.findById(decoded.id).populate('entrepriseId');

    if (!utilisateur) {
      return res.status(401).json({ success: false, message: 'Compte introuvable.' });
    }

    if (utilisateur.statutCompte !== 'ACTIF' || !utilisateur.isActif) {
      const msg = utilisateur.statutCompte === 'SUSPENDU'
        ? 'Votre compte a été suspendu par l\'administrateur.'
        : 'Votre compte est désactivé.';
      return res.status(403).json({ success: false, message: msg });
    }

    // Si l'utilisateur appartient à une entreprise, vérifier l'état de l'entreprise
    if (utilisateur.entrepriseId && typeof utilisateur.entrepriseId === 'object') {
      const ent = utilisateur.entrepriseId;
      if (ent.statut !== 'ACTIF') {
        const msg = ent.statut === 'SUSPENDU'
          ? 'Votre entreprise a été suspendue.'
          : 'Votre entreprise est désactivée.';
        return res.status(403).json({ success: false, message: msg });
      }
    }

    req.utilisateur = utilisateur;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token invalide ou expiré.' });
  }
};

const estSuperAdmin = (req, res, next) => {
  if (req.utilisateur.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, message: 'Accès réservé au SuperAdmin.' });
  }
  next();
};

const estAdmin = (req, res, next) => {
  if (req.utilisateur.role !== 'ADMIN' && req.utilisateur.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, message: 'Accès refusé. Rôle administrateur requis.' });
  }
  next();
};

const estAdminOuSuperAdmin = (req, res, next) => {
  if (req.utilisateur.role !== 'ADMIN' && req.utilisateur.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, message: 'Accès refusé.' });
  }
  next();
};

module.exports = { authentifier, estAdmin, estSuperAdmin, estAdminOuSuperAdmin };