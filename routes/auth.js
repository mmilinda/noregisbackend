const express  = require('express');
const router   = express.Router();
const { login, register, monProfil, mettreAJourProfil, listerUtilisateurs, toggleActif, genererQrAgent } = require('../controllers/authController');
const { authentifier, estAdmin } = require('../middleware/auth');

router.post('/login',    login);
router.post('/register', register);
router.get('/profil',    authentifier, monProfil);
router.put('/profil',    authentifier, mettreAJourProfil);           // Mise à jour de son propre profil
router.get('/users',     authentifier, estAdmin, listerUtilisateurs);
router.put('/users/:id', authentifier, estAdmin, mettreAJourProfil); // Admin met à jour le profil d'un agent
router.put('/users/:id/toggle', authentifier, estAdmin, toggleActif);
router.post('/users/:id/qr-code', authentifier, estAdmin, genererQrAgent);

module.exports = router;
