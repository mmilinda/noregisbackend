const express = require('express');
const router = express.Router();
const { verifierFiabiliteDocument, obtenirReglesPays } = require('../controllers/verifyDocumentController');
const upload = require('../middleware/upload');

router.post('/', upload.any(), verifierFiabiliteDocument);
router.get('/pays', obtenirReglesPays);

module.exports = router;
