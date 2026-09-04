const { Document } = require('../models');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const {
  extraireInfosDepuisVeryfi,
  extraireInfosAvecGemini,
} = require('./extraction');
const { evaluerFiabiliteDocument } = require('../services/fiabiliteService');

const VERYFI_CLIENT_ID     = process.env.VERYFI_CLIENT_ID;
const VERYFI_CLIENT_SECRET = process.env.VERYFI_CLIENT_SECRET;
const VERYFI_USERNAME      = process.env.VERYFI_USERNAME;
const VERYFI_API_KEY       = process.env.VERYFI_API_KEY;
const VERYFI_API_URL       = 'https://api.veryfi.com/api/v8/partner/documents';

const scannerImage = async (req, res) => {
  let geminiErrorMessage = null;

  try {
    let sourceImage = null;
    let nomFichier = `scan_${Date.now()}.png`;
    let typeMime = 'image/jpeg';
    let tailleFichier = 0;

    // 1. Récupération du fichier depuis Multer (memoryStorage sur Vercel, diskStorage en local)
    const fichierRecu = req.file || (req.files && req.files.length > 0 ? req.files[0] : null);

    if (fichierRecu) {
      nomFichier = fichierRecu.originalname || fichierRecu.filename || nomFichier;
      typeMime = fichierRecu.mimetype || typeMime;
      tailleFichier = fichierRecu.size || 0;

      // Si stockage en mémoire (Buffer sur Vercel)
      if (fichierRecu.buffer) {
        sourceImage = fichierRecu.buffer;
      } else if (fichierRecu.path) {
        sourceImage = fichierRecu.path;
      }
    } else {
      // 2. Repli : Image transmise en Base64 dans req.body (ex: req.body.image, req.body.recto, req.body.base64)
      const rawBase64 = req.body.image || req.body.recto || req.body.base64 || req.body.file;

      if (rawBase64 && typeof rawBase64 === 'string') {
        sourceImage = rawBase64;
        nomFichier = `scan_b64_${Date.now()}.png`;
        typeMime = 'image/png';
      }
    }

    if (!sourceImage) {
      return res.status(400).json({
        success: false,
        message: 'Aucune image reçue. Transmettez le fichier dans le champ "image", "recto" ou en Base64.',
      });
    }

    let document = null;
    // Enregistrement MongoDB non-bloquant
    try {
      if (Document) {
        document = await Document.create({
          nomFichier,
          cheminFichier: typeof sourceImage === 'string' && fs.existsSync(sourceImage) ? sourceImage : 'virtual://buffer',
          typeMime,
          tailleFichier,
        });
      }
    } catch (dbErr) {
      console.warn('⚠️ MongoDB non disponible ou erreur Document.create (non bloquant) :', dbErr.message);
    }

    let infosExtraites = null;
    let modeExtraction = 'GEMINI_VISION';

    // Priorité 1 : Google Gemini Vision (Serverless Compatible)
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (geminiKey) {
      try {
        console.log('🤖 Extraction des données via Google Gemini Vision...');
        infosExtraites = await extraireInfosAvecGemini(sourceImage, typeMime);
        modeExtraction = 'GEMINI_VISION';
        console.log('✅ Extraction Google Gemini Vision réussie :', infosExtraites);
      } catch (geminiErr) {
        geminiErrorMessage = geminiErr.message;
        console.error('⚠️ Échec de l\'extraction Gemini Vision :', geminiErr.message);
      }
    } else {
      console.warn('⚠️ GEMINI_API_KEY absente du process.env (Vérifiez les variables d\'environnement Vercel)');
    }

    // Priorité 2 : Veryfi (si configuré)
    if (!infosExtraites && VERYFI_API_KEY && VERYFI_USERNAME) {
      try {
        console.log('📡 Extraction via Veryfi...');
        const form = new FormData();
        if (Buffer.isBuffer(sourceImage)) {
          form.append('file', sourceImage, { filename: nomFichier, contentType: typeMime });
        } else if (typeof sourceImage === 'string' && fs.existsSync(sourceImage)) {
          form.append('file', fs.createReadStream(sourceImage));
        }

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
      } catch (veryfiErr) {
        console.error('❌ Erreur Veryfi :', veryfiErr.response?.data || veryfiErr.message);
      }
    }

    if (!infosExtraites) {
      let detailMessage = 'L\'extraction a échoué. Aucun service d\'OCR n\'a pu traiter la pièce d\'identité.';
      if (geminiErrorMessage) {
        detailMessage = `Échec Google Gemini Vision : ${geminiErrorMessage}`;
      }

      return res.status(500).json({
        success: false,
        message: detailMessage,
      });
    }

    const fiabilite = evaluerFiabiliteDocument(infosExtraites);

    const io = req.app.get('io');
    if (io) io.emit('ocr:donnees', { infosExtraites, fiabilite, nomFichier });

    return res.json({
      success: true,
      message: `Scan terminé avec succès via ${modeExtraction}.`,
      document: document
        ? { id: document._id, nomFichier: document.nomFichier }
        : { nomFichier },
      infosExtraites,
      fiabilite,
    });
  } catch (err) {
    console.error('Erreur globale scan :', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { scannerImage };