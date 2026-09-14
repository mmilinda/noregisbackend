const express = require('express');
const router = express.Router();
const {
  enregistrerEntree,
  enregistrerSortie,
  listerVisites,
  visitesEnCours,
  supprimerVisite
} = require('../controllers/visiteController');
const { authentifier, estAdmin } = require('../middleware/auth');

router.use(authentifier);

router.get('/', listerVisites);
router.get('/en-cours', visitesEnCours);
router.post('/entree', enregistrerEntree);
router.post('/sortie/:id', enregistrerSortie);
router.delete('/:id', estAdmin, supprimerVisite);

module.exports = router;