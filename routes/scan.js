const express = require('express');
const router = express.Router();
const { scannerImage } = require('../controllers/scanController');
const upload = require('../middleware/upload');

// upload.any() permet d'accepter n'importe quel nom de champ ('image', 'file', 'recto', 'document')
router.post('/', upload.any(), scannerImage);

module.exports = router;