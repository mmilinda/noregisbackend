const express  = require('express');
const router   = express.Router();
const { creerVisiteur, listerVisiteurs, getVisiteur, modifierVisiteur } = require('../controllers/visiteurController');
const { authentifier } = require('../middleware/auth');

router.use(authentifier);

router.get('/',    listerVisiteurs);
router.post('/',   creerVisiteur);
router.get('/:id', getVisiteur);
router.put('/:id', modifierVisiteur);

module.exports = router;