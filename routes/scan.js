const express = require('express');
const router  = express.Router();
const { scannerImage } = require('../controllers/scanController');
const { authentifier } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(authentifier);

// POST /api/scan → upload image et retour des infos extraites
router.post('/', upload.single('image'), scannerImage);

module.exports = router;
