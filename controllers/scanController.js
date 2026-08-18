const { Document } = require('../models');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const { extraireInfosDepuisVeryfi, extraireInfosAvecOpenAI } = require('./extraction');

const VERYFI_CLIENT_ID     = process.env.VERYFI_CLIENT_ID;
const VERYFI_CLIENT_SECRET = process.env.VERYFI_CLIENT_SECRET;
const VERYFI_USERNAME      = process.env.VERYFI_USERNAME;
const VERYFI_API_KEY       = process.env.VERYFI_API_KEY;
const VERYFI_API_URL       = 'https://api.veryfi.com/api/v8/partner/documents';

const scannerImage = async (req, res) => {
  let openaiErrorMessage = null;

  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucune image reçue.' });

    const cheminFichier = req.file.path;
    let document = null;

    // Tentative d'enregistrement du document en BDD (non bloquant si MongoDB est déconnecté)
    try {
      if (Document) {
        document = await Document.create({
          nomFichier:    req.file.filename,
          cheminFichier,
          typeMime:      req.file.mimetype,
          tailleFichier: req.file.size,
        });
      }
    } catch (dbErr) {
      console.warn('⚠️ MongoDB non disponible ou erreur Document.create (non bloquant) :', dbErr.message);
    }

    let infosExtraites = null;
    let modeExtraction = 'OPENAI_VISION';
    let texteRaw = '';

    // 1. Priorité à OpenAI Vision
    if (process.env.OPENAI_API_KEY) {
      try {
        console.log('🤖 Extraction des données via OpenAI Vision...');
        infosExtraites = await extraireInfosAvecOpenAI(cheminFichier);
        console.log('✅ Extraction OpenAI Vision réussie :', infosExtraites);
      } catch (openaiErr) {
        openaiErrorMessage = openaiErr.message;
        console.error('⚠️ Échec de l\'extraction OpenAI Vision :', openaiErr.message);
      }
    }

    // 2. Repli sur Veryfi si disponible
    if (!infosExtraites && VERYFI_API_KEY && VERYFI_USERNAME) {
      try {
        console.log('📡 Extraction via Veryfi...');
        const form = new FormData();
        form.append('file', fs.createReadStream(cheminFichier));
        const response = await axios.post(VERYFI_API_URL, form, {
          headers: {
            ...form.getHeaders(),
            'CLIENT-ID': VERYFI_CLIENT_ID,
            'AUTHORIZATION': `apikey ${VERYFI_USERNAME}:${VERYFI_API_KEY}`,
          },
        });
        const data = response.data;
        infosExtraites = extraireInfosDepuisVeryfi(data);
        modeExtraction = 'VERYFI';
        texteRaw = data.ocr_text || '';
      } catch (veryfiErr) {
        console.error('❌ Erreur Veryfi :', veryfiErr.response?.data || veryfiErr.message);
      }
    }

    if (!infosExtraites) {
      const detailMessage = openaiErrorMessage
        ? `Échec de l'extraction OCR OpenAI : ${openaiErrorMessage}`
        : 'L\'extraction a échoué. Aucun service d\'OCR (OpenAI ou Veryfi) n\'a pu traiter la pièce d\'identité.';
      return res.status(500).json({
        success: false,
        message: detailMessage,
      });
    }

    const io = req.app.get('io');
    if (io) io.emit('ocr:donnees', { infosExtraites, nomFichier: req.file.filename });

    return res.json({
      success: true,
      message: `Scan terminé avec succès via ${modeExtraction}.`,
      document: document
        ? { id: document._id, nomFichier: document.nomFichier }
        : { nomFichier: req.file.filename },
      infosExtraites,
      texteRaw,
    });
  } catch (err) {
    console.error('Erreur globale scan :', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { scannerImage };