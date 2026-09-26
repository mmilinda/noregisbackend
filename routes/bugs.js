const express = require('express');
const router = express.Router();
const { authentifier, estAdminOuSuperAdmin } = require('../middleware/auth');
const {
  creerBug,
  listerBugs,
  repondreBug,
  transmettreSuperAdmin,
} = require('../controllers/bugController');

router.use(authentifier);

router.get('/', listerBugs);
router.post('/', creerBug);
router.put('/:id/repondre', estAdminOuSuperAdmin, repondreBug);
router.patch('/:id/transmettre', estAdminOuSuperAdmin, transmettreSuperAdmin);

module.exports = router;
