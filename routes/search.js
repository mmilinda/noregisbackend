const express        = require('express');
const router         = express.Router();
const { rechercher } = require('../controllers/searchController');
const { authentifier } = require('../middleware/auth');

router.use(authentifier);
router.get('/', rechercher);

module.exports = router;