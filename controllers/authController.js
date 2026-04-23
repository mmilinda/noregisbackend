const jwt           = require('jsonwebtoken');
const { Utilisateur } = require('../models');

// ================================
// CONNEXION
// ================================
const login = async (req, res) => {
  try {
    const { email, motDePasse } = req.body;

    if (!email || !motDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Email et mot de passe requis.',
      });
    }

    // Chercher l'utilisateur
    const utilisateur = await Utilisateur.findOne({ where: { email } });
    if (!utilisateur) {
      return res.status(401).json({ success: false, message: 'Identifiants incorrects.' });
    }

    // Vérifier le mot de passe
    const motDePasseValide = await utilisateur.verifierMotDePasse(motDePasse);
    if (!motDePasseValide) {
      return res.status(401).json({ success: false, message: 'Identifiants incorrects.' });
    }

    if (!utilisateur.isActif) {
      return res.status(403).json({ success: false, message: 'Compte désactivé.' });
    }

    // Générer le token JWT
    const token = jwt.sign(
      { id: utilisateur.id, role: utilisateur.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      success: true,
      message: 'Connexion réussie.',
      token,
      utilisateur: {
        id:    utilisateur.id,
        nom:   utilisateur.nom,
        email: utilisateur.email,
        role:  utilisateur.role,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================
// INSCRIPTION
// ================================
const register = async (req, res) => {
  try {
    const { nom, email, motDePasse, role } = req.body;

    // Vérifier si l'email existe déjà
    const existeDeja = await Utilisateur.findOne({ where: { email } });
    if (existeDeja) {
      return res.status(409).json({ success: false, message: 'Email déjà utilisé.' });
    }

    const utilisateur = await Utilisateur.create({ nom, email, motDePasse, role });

    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès.',
      utilisateur: {
        id:    utilisateur.id,
        nom:   utilisateur.nom,
        email: utilisateur.email,
        role:  utilisateur.role,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================
// MON PROFIL
// ================================
const monProfil = async (req, res) => {
  res.json({
    success: true,
    utilisateur: {
      id:    req.utilisateur.id,
      nom:   req.utilisateur.nom,
      email: req.utilisateur.email,
      role:  req.utilisateur.role,
    },
  });
};

module.exports = { login, register, monProfil };
