const { Visite, Visiteur } = require('../models');

const enregistrerEntree = async (req, res) => {
  try {
    const { visiteurId, personneVisitee, service, motif } = req.body;
    const visiteur = await Visiteur.findById(visiteurId);
    if (!visiteur) return res.status(404).json({ success: false, message: 'Visiteur introuvable.' });
    const visiteEnCours = await Visite.findOne({ visiteurId, statut: 'EN_COURS' });
    if (visiteEnCours) {
      return res.status(409).json({ success: false, message: "Ce visiteur est déjà à l'intérieur.", visiteEnCours });
    }
    const visite = await Visite.create({ visiteurId, personneVisitee, service, motif, heureEntree: new Date(), statut: 'EN_COURS' });
    res.status(201).json({ success: true, message: `Entrée enregistrée à ${new Date().toLocaleTimeString('fr-SN')}`, visite: { ...visite.toObject(), visiteur } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const enregistrerSortie = async (req, res) => {
  try {
    const visite = await Visite.findById(req.params.id).populate('visiteurId');
    if (!visite) return res.status(404).json({ success: false, message: 'Visite introuvable.' });
    if (visite.statut === 'TERMINE') return res.status(400).json({ success: false, message: 'Visite déjà terminée.' });
    visite.heureSortie = new Date();
    visite.statut      = 'TERMINE';
    await visite.save();
    const dureeMinutes = Math.round((new Date() - new Date(visite.heureEntree)) / 60000);
    res.json({ success: true, message: `Sortie enregistrée. Durée : ${dureeMinutes} min.`, visite });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const listerVisites = async (req, res) => {
  try {
    const { statut, date } = req.query;
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const filtre = {};
    if (statut) filtre.statut = statut;
    if (date) {
      const debut = new Date(date);
      const fin   = new Date(date);
      fin.setHours(23, 59, 59, 999);
      filtre.heureEntree = { $gte: debut, $lte: fin };
    }
    const [total, visites] = await Promise.all([
      Visite.countDocuments(filtre),
      Visite.find(filtre).populate('visiteurId').sort({ heureEntree: -1 }).skip((page - 1) * limit).limit(limit),
    ]);
    res.json({ success: true, total, page, pages: Math.ceil(total / limit), visites });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const visitesEnCours = async (req, res) => {
  try {
    const visites = await Visite.find({ statut: 'EN_COURS' }).populate('visiteurId').sort({ heureEntree: -1 });
    res.json({ success: true, total: visites.length, visites });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { enregistrerEntree, enregistrerSortie, listerVisites, visitesEnCours };