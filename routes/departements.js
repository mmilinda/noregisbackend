const express = require('express');
const router  = express.Router();
const { authentifier, estAdminOuSuperAdmin } = require('../middleware/auth');
const {
  listerDepartements,
  creerDepartement,
  modifierDepartement,
  supprimerDepartement,
} = require('../controllers/departementController');

router.use(authentifier);

router.get('/', listerDepartements);
router.post('/', estAdminOuSuperAdmin, creerDepartement);
router.put('/:id', estAdminOuSuperAdmin, modifierDepartement);
router.delete('/:id', estAdminOuSuperAdmin, supprimerDepartement);

module.exports = router;
