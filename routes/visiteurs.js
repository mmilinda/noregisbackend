const express = require('express');
const router = express.Router();
const {
  creerVisiteur,
  rechercherParTelephone,
  listerVisiteurs,
  getVisiteur,
  modifierVisiteur,
  supprimerVisiteur
} = require('../controllers/visiteurController');
const { authentifier } = require('../middleware/auth');

router.use(authentifier);

router.get('/recherche/telephone', rechercherParTelephone);
router.get('/', listerVisiteurs);
router.post('/', creerVisiteur);
router.get('/:id', getVisiteur);
router.put('/:id', modifierVisiteur);
router.delete('/:id', supprimerVisiteur);

module.exports = router;