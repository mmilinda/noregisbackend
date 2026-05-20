const express = require('express');
const router  = express.Router();
const {
  soumettreDemande,
  listerDemandes,
  approuverDemande,
  rejeterDemande,
  maDemande,
} = require('../controllers/demandeController');
const { authentifier, estAdmin } = require('../middleware/auth');

// Agent
router.post('/',              authentifier, soumettreDemande);        // Soumettre une demande
router.get('/ma-demande',     authentifier, maDemande);               // Vérifier sa propre demande

// Admin
router.get('/',               authentifier, estAdmin, listerDemandes);            // Lister toutes les demandes
router.put('/:id/approuver',  authentifier, estAdmin, approuverDemande);          // Approuver
router.put('/:id/rejeter',    authentifier, estAdmin, rejeterDemande);            // Rejeter

module.exports = router;
