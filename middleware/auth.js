const jwt         = require('jsonwebtoken');
const Utilisateur = require('../models/Utilisateur');

const authentifier = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token manquant.' });
    }
    const token       = authHeader.split(' ')[1];
    const decoded     = jwt.verify(token, process.env.JWT_SECRET);
    const utilisateur = await Utilisateur.findById(decoded.id);
    if (!utilisateur || !utilisateur.isActif) {
      return res.status(401).json({ success: false, message: 'Compte introuvable ou désactivé.' });
    }
    req.utilisateur = utilisateur;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token invalide ou expiré.' });
  }
};

const estAdmin = (req, res, next) => {
  if (req.utilisateur.role !== 'ADMIN') {
    return res.status(403).json({ success: false, message: 'Accès refusé.' });
  }
  next();
};

module.exports = { authentifier, estAdmin };