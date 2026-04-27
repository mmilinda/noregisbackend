const { Visiteur, Visite, Document } = require('../models');

const creerVisiteur = async (req, res) => {
  try {
    const { nom, prenom, dateNaissance, numeroPiece, typePiece } = req.body;
    const existeDeja = await Visiteur.findOne({ numeroPiece });
    if (existeDeja) {
      return res.status(200).json({ success: true, message: 'Visiteur déjà enregistré.', visiteur: existeDeja, estNouveau: false });
    }
    const visiteur = await Visiteur.create({ nom, prenom, dateNaissance, numeroPiece, typePiece });
    res.status(201).json({ success: true, message: 'Visiteur créé.', visiteur, estNouveau: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const listerVisiteurs = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;
    const [total, visiteurs] = await Promise.all([
      Visiteur.countDocuments(),
      Visiteur.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    ]);
    res.json({ success: true, total, page, pages: Math.ceil(total / limit), visiteurs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getVisiteur = async (req, res) => {
  try {
    const visiteur = await Visiteur.findById(req.params.id);
    if (!visiteur) return res.status(404).json({ success: false, message: 'Visiteur introuvable.' });
    const [visites, documents] = await Promise.all([
      Visite.find({ visiteurId: visiteur._id }).sort({ heureEntree: -1 }),
      Document.find({ visiteurId: visiteur._id }),
    ]);
    res.json({ success: true, visiteur: { ...visiteur.toObject(), visites, documents } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const modifierVisiteur = async (req, res) => {
  try {
    const visiteur = await Visiteur.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!visiteur) return res.status(404).json({ success: false, message: 'Visiteur introuvable.' });
    res.json({ success: true, message: 'Visiteur mis à jour.', visiteur });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { creerVisiteur, listerVisiteurs, getVisiteur, modifierVisiteur };