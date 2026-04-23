const { Visiteur, Visite } = require('../models');
const { Op } = require('sequelize');

// ================================
// RECHERCHE GLOBALE
// ================================
const rechercher = async (req, res) => {
  try {
    const { query, statut, dateDebut, dateFin } = req.query;

    if (!query && !statut && !dateDebut) {
      return res.status(400).json({
        success: false,
        message: 'Paramètre de recherche requis (query, statut ou dateDebut).',
      });
    }

    const whereVisiteur = {};
    const whereVisite   = {};

    // Recherche texte : nom, prénom, numéro de pièce
    if (query) {
      whereVisiteur[Op.or] = [
        { nom:          { [Op.like]: `%${query}%` } },
        { prenom:       { [Op.like]: `%${query}%` } },
        { numeroPiece:  { [Op.like]: `%${query}%` } },
      ];
    }

    // Filtre par statut de visite
    if (statut) whereVisite.statut = statut;

    // Filtre par plage de dates
    if (dateDebut && dateFin) {
      whereVisite.heureEntree = {
        [Op.between]: [new Date(dateDebut), new Date(dateFin + 'T23:59:59')],
      };
    } else if (dateDebut) {
      const fin = new Date(dateDebut);
      fin.setHours(23, 59, 59);
      whereVisite.heureEntree = { [Op.between]: [new Date(dateDebut), fin] };
    }

    const visiteurs = await Visiteur.findAll({
      where: whereVisiteur,
      include: [{
        model: Visite,
        as: 'visites',
        where: Object.keys(whereVisite).length ? whereVisite : undefined,
        required: Object.keys(whereVisite).length > 0,
        order: [['heureEntree', 'DESC']],
        limit: 5,
      }],
      limit: 50,
    });

    res.json({
      success: true,
      total: visiteurs.length,
      resultats: visiteurs,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { rechercher };
