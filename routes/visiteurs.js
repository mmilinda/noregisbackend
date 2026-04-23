const express = require('express');
const router  = express.Router();
const { creerVisiteur, listerVisiteurs, getVisiteur, modifierVisiteur } = require('../controllers/visiteurController');
const { authentifier } = require('../middleware/auth');

// Toutes les routes visiteurs nécessitent d'être connecté
router.use(authentifier);

// GET  /api/visiteurs       → liste des visiteurs
router.get('/', listerVisiteurs);

// POST /api/visiteurs       → créer un visiteur
router.post('/', creerVisiteur);

// GET  /api/visiteurs/:id   → un visiteur par ID
router.get('/:id', getVisiteur);

// PUT  /api/visiteurs/:id   → modifier un visiteur
router.put('/:id', modifierVisiteur);

module.exports = router;
