const express  = require('express');
const router   = express.Router();
const { enregistrerEntree, enregistrerSortie, listerVisites, visitesEnCours } = require('../controllers/visiteController');
const { authentifier } = require('../middleware/auth');

router.use(authentifier);

router.get('/',            listerVisites);
router.get('/en-cours',    visitesEnCours);
router.post('/entree',     enregistrerEntree);
router.post('/sortie/:id', enregistrerSortie);

module.exports = router;