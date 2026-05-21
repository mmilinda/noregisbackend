const express = require('express');
const router = express.Router();
const { traiterPublicScan } = require('../controllers/publicScanController');

router.post('/', traiterPublicScan);

module.exports = router;
