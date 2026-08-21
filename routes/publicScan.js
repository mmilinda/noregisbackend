const express = require('express');
const router = express.Router();
const { traiterPublicScan } = require('../controllers/publicScanController');
const upload = require('../middleware/upload');

// upload.any() permet d'accepter les envois d'images (recto/verso) sous n'importe quel nom de champ
router.post('/', upload.any(), traiterPublicScan);

module.exports = router;
