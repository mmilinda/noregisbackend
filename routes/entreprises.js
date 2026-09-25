const express = require('express');
const router  = express.Router();
const { authentifier, estSuperAdmin } = require('../middleware/auth');
const {
  creerEntreprise,
  listerEntreprises,
  modifierEntreprise,
  changerStatutEntreprise,
} = require('../controllers/entrepriseController');

router.use(authentifier, estSuperAdmin);

router.post('/', creerEntreprise);
router.get('/', listerEntreprises);
router.put('/:id', modifierEntreprise);
router.patch('/:id/statut', changerStatutEntreprise);

module.exports = router;
