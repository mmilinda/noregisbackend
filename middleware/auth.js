const jwt = require('jsonwebtoken');
const { Utilisateur } = require('../models');

// ================================
// VÉRIFICATION DU TOKEN JWT
// ================================
const authentifier = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token manquant. Veuillez vous connecter.',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const utilisateur = await Utilisateur.findByPk(decoded.id);
    if (!utilisateur || !utilisateur.isActif) {
      return res.status(401).json({
        success: false,
        message: 'Compte introuvable ou désactivé.',
      });
    }

    req.utilisateur = utilisateur;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Token invalide ou expiré.',
    });
  }
};

// ================================
// VÉRIFICATION DU RÔLE ADMIN
// ================================
const estAdmin = (req, res, next) => {
  if (req.utilisateur.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Accès refusé. Réservé aux administrateurs.',
    });
  }
  next();
};

module.exports = { authentifier, estAdmin };
