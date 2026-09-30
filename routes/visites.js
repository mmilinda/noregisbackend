const express = require('express');
const router = express.Router();
const {
  enregistrerEntree,
  enregistrerSortie,
  listerVisites,
  visitesEnCours,
  supprimerVisite,
  creerRendezVous,
  listerRendezVous,
  validerEntreeRendezVous,
  annulerRendezVous,
} = require('../controllers/visiteController');
const { rechercherParNIN } = require('../controllers/visiteurController');
const { authentifier, estAdmin } = require('../middleware/auth');

router.use(authentifier);

router.get('/', listerVisites);
router.get('/en-cours', visitesEnCours);
router.get('/rendez-vous', listerRendezVous);
router.get('/recherche/nin', rechercherParNIN);
router.post('/entree', enregistrerEntree);
router.post('/rendez-vous', creerRendezVous);
router.post('/sortie/:id', enregistrerSortie);
router.put('/:id/valider-rendez-vous', validerEntreeRendezVous);
router.patch('/:id/annuler-rendez-vous', annulerRendezVous);
router.delete('/:id', estAdmin, supprimerVisite);

module.exports = router;