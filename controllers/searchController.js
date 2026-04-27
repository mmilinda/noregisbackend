const { Visiteur, Visite } = require('../models');

const rechercher = async (req, res) => {
  try {
    const { query, statut, dateDebut, dateFin } = req.query;
    if (!query && !statut && !dateDebut) {
      return res.status(400).json({ success: false, message: 'Paramètre de recherche requis.' });
    }
    const filtreVisiteur = {};
    if (query) {
      filtreVisiteur.$or = [
        { nom:         { $regex: query, $options: 'i' } },
        { prenom:      { $regex: query, $options: 'i' } },
        { numeroPiece: { $regex: query, $options: 'i' } },
      ];
    }
    const filtreVisite = {};
    if (statut) filtreVisite.statut = statut;
    if (dateDebut) {
      const fin = dateFin ? new Date(dateFin + 'T23:59:59') : new Date(dateDebut);
      if (!dateFin) fin.setHours(23, 59, 59);
      filtreVisite.heureEntree = { $gte: new Date(dateDebut), $lte: fin };
    }
    const visiteurs = await Visiteur.find(filtreVisiteur).limit(50);
    const resultats = await Promise.all(
      visiteurs.map(async (v) => {
        const visites = await Visite.find({ visiteurId: v._id, ...filtreVisite }).sort({ heureEntree: -1 }).limit(5);
        return { ...v.toObject(), visites };
      })
    );
    res.json({ success: true, total: resultats.length, resultats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { rechercher };