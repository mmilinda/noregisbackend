const express  = require('express');
const router   = express.Router();
const { login, register, monProfil } = require('../controllers/authController');
const { authentifier } = require('../middleware/auth');

router.post('/login',    login);
router.post('/register', register);
router.get('/profil',    authentifier, monProfil);

module.exports = router;