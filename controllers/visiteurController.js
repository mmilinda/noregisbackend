const { Visiteur, Visite, Document } = require('../models');
const { Op } = require('sequelize');

// ================================
// CRÉER UN VISITEUR
// ================================
const creerVisiteur = async (req, res) => {
  try {
    const { nom, prenom, dateNaissance, numeroPiece, typePiece } = req.body;

    // Vérifier si le numéro de pièce existe déjà
    const existeDeja = await Visiteur.findOne({ where: { numeroPiece } });
    if (existeDeja) {
      // On retourne l'existant au lieu d'en créer un doublon
      return res.status(200).json({
        success: true,
        message: 'Visiteur déjà enregistré. Données existantes retournées.',
        visiteur: existeDeja,
        estNouveau: false,
      });
    }

    const visiteur = await Visiteur.create({ nom, prenom, dateNaissance, numeroPiece, typePiece });

    res.status(201).json({
      success: true,
      message: 'Visiteur créé avec succès.',
      visiteur,
      estNouveau: true,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================
// LISTE DES VISITEURS
// ================================
const listerVisiteurs = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows } = await Visiteur.findAndCountAll({
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']],
    });

    res.json({
      success: true,
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limit),
      visiteurs: rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================
// UN VISITEUR PAR ID
// ================================
const getVisiteur = async (req, res) => {
  try {
    const visiteur = await Visiteur.findByPk(req.params.id, {
      include: [
        { model: Visite,   as: 'visites',   order: [['heureEntree', 'DESC']] },
        { model: Document, as: 'documents' },
      ],
    });

    if (!visiteur) {
      return res.status(404).json({ success: false, message: 'Visiteur introuvable.' });
    }

    res.json({ success: true, visiteur });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================
// MODIFIER UN VISITEUR
// ================================
const modifierVisiteur = async (req, res) => {
  try {
    const visiteur = await Visiteur.findByPk(req.params.id);
    if (!visiteur) {
      return res.status(404).json({ success: false, message: 'Visiteur introuvable.' });
    }

    await visiteur.update(req.body);
    res.json({ success: true, message: 'Visiteur mis à jour.', visiteur });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { creerVisiteur, listerVisiteurs, getVisiteur, modifierVisiteur };
