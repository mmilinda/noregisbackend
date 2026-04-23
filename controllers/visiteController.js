const { Visite, Visiteur } = require('../models');
const { Op } = require('sequelize');

// ================================
// ENREGISTRER UNE ENTRÉE
// ================================
const enregistrerEntree = async (req, res) => {
  try {
    const { visiteurId, personneVisitee, service, motif } = req.body;

    // Vérifier que le visiteur existe
    const visiteur = await Visiteur.findByPk(visiteurId);
    if (!visiteur) {
      return res.status(404).json({ success: false, message: 'Visiteur introuvable.' });
    }

    // Vérifier qu'il n'a pas déjà une visite en cours (anti-doublon)
    const visiteEnCours = await Visite.findOne({
      where: { visiteurId, statut: 'EN_COURS' },
    });

    if (visiteEnCours) {
      return res.status(409).json({
        success: false,
        message: 'Ce visiteur est déjà à l\'intérieur. Enregistrez sa sortie d\'abord.',
        visiteEnCours,
      });
    }

    // Créer la visite — heureEntree = automatique (NOW)
    const visite = await Visite.create({
      visiteurId,
      personneVisitee,
      service,
      motif,
      heureEntree: new Date(),
      statut: 'EN_COURS',
    });

    res.status(201).json({
      success: true,
      message: `Entrée enregistrée à ${new Date().toLocaleTimeString('fr-SN')}`,
      visite: { ...visite.toJSON(), visiteur },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================
// ENREGISTRER UNE SORTIE
// ================================
const enregistrerSortie = async (req, res) => {
  try {
    const { id } = req.params;

    const visite = await Visite.findByPk(id, {
      include: [{ model: Visiteur, as: 'visiteur' }],
    });

    if (!visite) {
      return res.status(404).json({ success: false, message: 'Visite introuvable.' });
    }

    if (visite.statut === 'TERMINE') {
      return res.status(400).json({ success: false, message: 'Cette visite est déjà terminée.' });
    }

    // Mettre à jour heure de sortie + statut
    await visite.update({
      heureSortie: new Date(),
      statut: 'TERMINE',
    });

    const dureeMinutes = Math.round(
      (new Date() - new Date(visite.heureEntree)) / 60000
    );

    res.json({
      success: true,
      message: `Sortie enregistrée. Durée de visite : ${dureeMinutes} min.`,
      visite,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================
// LISTE DE TOUTES LES VISITES
// ================================
const listerVisites = async (req, res) => {
  try {
    const { statut, date, page = 1, limit = 20 } = req.query;
    const where = {};

    if (statut) where.statut = statut;

    if (date) {
      const debut = new Date(date);
      const fin   = new Date(date);
      fin.setHours(23, 59, 59, 999);
      where.heureEntree = { [Op.between]: [debut, fin] };
    }

    const { count, rows } = await Visite.findAndCountAll({
      where,
      include: [{ model: Visiteur, as: 'visiteur' }],
      order:   [['heureEntree', 'DESC']],
      limit:   parseInt(limit),
      offset:  (page - 1) * limit,
    });

    res.json({
      success: true,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limit),
      visites: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================
// VISITES EN COURS (tableau de bord)
// ================================
const visitesEnCours = async (req, res) => {
  try {
    const visites = await Visite.findAll({
      where: { statut: 'EN_COURS' },
      include: [{ model: Visiteur, as: 'visiteur' }],
      order: [['heureEntree', 'DESC']],
    });

    res.json({ success: true, total: visites.length, visites });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { enregistrerEntree, enregistrerSortie, listerVisites, visitesEnCours };
