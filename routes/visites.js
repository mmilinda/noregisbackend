const express = require('express');
const router = express.Router();
const {
  enregistrerEntree,
  enregistrerSortie,
  listerVisites,
  visitesEnCours,
  supprimerVisite               // 👈 import de la nouvelle fonction
} = require('../controllers/visiteController');
const { authentifier } = require('../middleware/auth');

router.use(authentifier);

router.get('/', listerVisites);
router.get('/en-cours', visitesEnCours);
router.post('/entree', enregistrerEntree);
router.post('/sortie/:id', enregistrerSortie);
router.delete('/:id', supprimerVisite);   // 👈 route DELETE pour supprimer une visite

module.exports = router;