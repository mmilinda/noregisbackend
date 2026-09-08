const express = require('express');
const router = express.Router();
const {
  creerVisiteur,
  rechercherParNIN,
  listerVisiteurs,
  getVisiteur,
  modifierVisiteur,
  supprimerVisiteur
} = require('../controllers/visiteurController');
const { authentifier } = require('../middleware/auth');

router.use(authentifier);

router.get('/recherche/nin', rechercherParNIN);
router.get('/recherche/telephone', rechercherParNIN);
router.get('/', listerVisiteurs);
router.post('/', creerVisiteur);
router.get('/:id', getVisiteur);
router.put('/:id', modifierVisiteur);
router.delete('/:id', supprimerVisiteur);

module.exports = router;