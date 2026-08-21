const express = require('express');
const router = express.Router();
const { scannerImage } = require('../controllers/scanController');
const { authentifier } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(authentifier);
// upload.any() permet d'accepter n'importe quel nom de champ ('image', 'file', 'recto', 'document')
router.post('/', upload.any(), scannerImage);

module.exports = router;