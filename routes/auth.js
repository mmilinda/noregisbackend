const express = require('express');
const router  = express.Router();
const { login, register, monProfil } = require('../controllers/authController');
const { authentifier } = require('../middleware/auth');

// POST /api/auth/login    → connexion
router.post('/login', login);

// POST /api/auth/register → créer un agent
router.post('/register', register);

// GET  /api/auth/me       → mon profil (protégé)
router.get('/me', authentifier, monProfil);

module.exports = router;
