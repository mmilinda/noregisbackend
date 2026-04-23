const express = require('express');
const router  = express.Router();
const { rechercher } = require('../controllers/searchController');
const { authentifier } = require('../middleware/auth');

router.use(authentifier);

// GET /api/search?query=Diallo&statut=EN_COURS&dateDebut=2024-01-01
router.get('/', rechercher);

module.exports = router;
