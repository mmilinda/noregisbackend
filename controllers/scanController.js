const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { Document } = require('../models');

// Configuration Mindee
const MINDEE_API_KEY = process.env.MINDEE_API_KEY;
const MINDEE_API_URL = 'https://api.mindee.net/v2/products/mindee/international_id/v2/predict';

const scannerImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucune image reçue.' });
    }

    const cheminFichier = req.file.path;

    // Sauvegarde en base
    const document = await Document.create({
      nomFichier:    req.file.filename,
      cheminFichier,
      typeMime:      req.file.mimetype,
      tailleFichier: req.file.size,
    });

    // 👉 Appel à l'API Mindee (remplace Tesseract)
    const infosExtraites = await extraireAvecMindee(cheminFichier);

    console.log('📄 Infos extraites par Mindee:\n', infosExtraites);

    // Envoi temps réel via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('ocr:donnees', {
        infosExtraites,
        nomFichier: document.nomFichier,
      });
    }

    return res.json({
      success: true,
      message: 'Scan terminé.',
      document: { id: document._id, nomFichier: document.nomFichier },
      infosExtraites,
    });

  } catch (err) {
    console.error('Erreur:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// 👉 Fonction d'appel à l'API Mindee
const extraireAvecMindee = async (cheminFichier) => {
  try {
    const formData = new FormData();
    formData.append('document', fs.createReadStream(cheminFichier));

    const response = await axios.post(MINDEE_API_URL, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Token ${MINDEE_API_KEY}`,
      },
      timeout: 30000,
    });

    const prediction = response.data.document.inference.prediction;

    // Formatage du résultat
    return {
      nom: prediction.last_name?.value || prediction.surnames?.[0]?.value || null,
      prenom: prediction.first_name?.value || prediction.given_names?.[0]?.value || null,
      numeroPiece: prediction.document_number?.value || null,
      dateNaissance: prediction.birth_date?.value || null,
      dateExpiration: prediction.expiry_date?.value || null,
      sexe: getSexe(prediction.sex?.value),
      nationalite: prediction.nationality?.value || null,
      typePiece: getTypeDocument(prediction.document_type?.value),
      paysEmission: prediction.country_of_issue?.value || null,
      adresse: prediction.address?.value || null,
      mrz: prediction.mrz_line?.value || null,
      confiance: {
        nom: prediction.last_name?.confidence || 0,
        prenom: prediction.first_name?.confidence || 0,
        numero: prediction.document_number?.confidence || 0,
      }
    };

  } catch (error) {
    console.error('Erreur Mindee:', error.response?.data || error.message);
    // En cas d'échec, retourne un objet vide
    return {
      nom: null,
      prenom: null,
      numeroPiece: null,
      dateNaissance: null,
      dateExpiration: null,
      sexe: null,
      nationalite: null,
      typePiece: 'INCONNU',
      paysEmission: null,
      adresse: null,
      mrz: null,
      confiance: { nom: 0, prenom: 0, numero: 0 }
    };
  }
};

// Fonction utilitaire pour le type de document
const getTypeDocument = (type) => {
  const types = {
    'ID_CARD': 'CNI',
    'PASSPORT': 'PASSEPORT',
    'DRIVER_LICENSE': 'PERMIS DE CONDUIRE',
    'RESIDENCE_PERMIT': 'CARTE DE SÉJOUR',
  };
  return types[type] || type || 'CNI';
};

// Fonction utilitaire pour le sexe
const getSexe = (sexe) => {
  if (sexe === 'M') return 'Masculin';
  if (sexe === 'F') return 'Féminin';
  return null;
};

module.exports = { scannerImage };