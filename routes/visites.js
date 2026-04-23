const express = require('express');
const router  = express.Router();
const { enregistrerEntree, enregistrerSortie, listerVisites, visitesEnCours } = require('../controllers/visiteController');
const { authentifier } = require('../middleware/auth');

router.use(authentifier);

// GET  /api/visites              → historique complet
router.get('/', listerVisites);

// GET  /api/visites/en-cours     → visiteurs actuellement présents
router.get('/en-cours', visitesEnCours);

// POST /api/visites/entree       → enregistrer une entrée
router.post('/entree', enregistrerEntree);

// POST /api/visites/sortie/:id   → enregistrer une sortie
router.post('/sortie/:id', enregistrerSortie);

module.exports = router;
