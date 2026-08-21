const { Document } = require('../models');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const {
  extraireInfosDepuisVeryfi,
  extraireInfosAvecOpenAI,
  extraireInfosAvecGemini,
} = require('./extraction');

const VERYFI_CLIENT_ID     = process.env.VERYFI_CLIENT_ID;
const VERYFI_CLIENT_SECRET = process.env.VERYFI_CLIENT_SECRET;
const VERYFI_USERNAME      = process.env.VERYFI_USERNAME;
const VERYFI_API_KEY       = process.env.VERYFI_API_KEY;
const VERYFI_API_URL       = 'https://api.veryfi.com/api/v8/partner/documents';

const scannerImage = async (req, res) => {
  let geminiErrorMessage = null;
  let openaiErrorMessage = null;
  let cheminFichierTemporaire = null;

  try {
    let cheminFichier = null;
    let nomFichier = null;
    let typeMime = 'image/jpeg';
    let tailleFichier = 0;

    // 1. Récupération du fichier via multipart (req.file ou req.files)
    const fichierRecu = req.file || (req.files && req.files.length > 0 ? req.files[0] : null);

    if (fichierRecu) {
      cheminFichier = fichierRecu.path;
      nomFichier = fichierRecu.filename;
      typeMime = fichierRecu.mimetype;
      tailleFichier = fichierRecu.size;
    } else {
      // 2. Repli : Récupération de l'image au format Base64 dans req.body (ex: req.body.image, req.body.recto, req.body.base64)
      const rawBase64 = req.body.image || req.body.recto || req.body.base64 || req.body.file;

      if (rawBase64 && typeof rawBase64 === 'string') {
        const base64Clean = rawBase64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Clean, 'base64');
        const uploadDir = process.env.UPLOAD_DIR || 'uploads';

        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        nomFichier = `scan_b64_${Date.now()}.png`;
        cheminFichier = path.join(uploadDir, nomFichier);
        fs.writeFileSync(cheminFichier, buffer);
        cheminFichierTemporaire = cheminFichier;
        tailleFichier = buffer.length;
        typeMime = 'image/png';
      }
    }

    if (!cheminFichier || !fs.existsSync(cheminFichier)) {
      return res.status(400).json({
        success: false,
        message: 'Aucune image reçue. Envoyez le fichier dans le champ "image", "recto" ou en Base64.',
      });
    }

    let document = null;
    // Enregistrement MongoDB non-bloquant
    try {
      if (Document) {
        document = await Document.create({
          nomFichier,
          cheminFichier,
          typeMime,
          tailleFichier,
        });
      }
    } catch (dbErr) {
      console.warn('⚠️ MongoDB non disponible ou erreur Document.create (non bloquant) :', dbErr.message);
    }

    let infosExtraites = null;
    let modeExtraction = 'GEMINI_VISION';
    let texteRaw = '';

    // Priorité 1 : Google Gemini Vision (Gratuit, Rapide, Précis)
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (geminiKey) {
      try {
        console.log('🤖 Extraction des données via Google Gemini Vision...');
        infosExtraites = await extraireInfosAvecGemini(cheminFichier);
        modeExtraction = 'GEMINI_VISION';
        console.log('✅ Extraction Google Gemini Vision réussie :', infosExtraites);
      } catch (geminiErr) {
        geminiErrorMessage = geminiErr.message;
        console.error('⚠️ Échec de l\'extraction Gemini Vision :', geminiErr.message);
      }
    } else {
      console.warn('⚠️ GEMINI_API_KEY absente du process.env (Vérifiez le fichier .env et redémarrez le serveur)');
    }

    // Priorité 2 : OpenAI Vision (si disponible)
    if (!infosExtraites && process.env.OPENAI_API_KEY) {
      try {
        console.log('🤖 Extraction des données via OpenAI Vision...');
        infosExtraites = await extraireInfosAvecOpenAI(cheminFichier);
        modeExtraction = 'OPENAI_VISION';
        console.log('✅ Extraction OpenAI Vision réussie :', infosExtraites);
      } catch (openaiErr) {
        openaiErrorMessage = openaiErr.message;
        console.error('⚠️ Échec de l\'extraction OpenAI Vision :', openaiErr.message);
      }
    }

    // Priorité 3 : Repli sur Veryfi si disponible
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
      let detailMessage = 'L\'extraction a échoué. Aucun service d\'OCR n\'a pu traiter la pièce d\'identité.';
      if (geminiErrorMessage) {
        detailMessage = `Échec Google Gemini Vision : ${geminiErrorMessage}`;
      } else if (openaiErrorMessage) {
        detailMessage = `Échec OpenAI Vision : ${openaiErrorMessage}`;
      }

      return res.status(500).json({
        success: false,
        message: detailMessage,
      });
    }

    const io = req.app.get('io');
    if (io) io.emit('ocr:donnees', { infosExtraites, nomFichier });

    return res.json({
      success: true,
      message: `Scan terminé avec succès via ${modeExtraction}.`,
      document: document
        ? { id: document._id, nomFichier: document.nomFichier }
        : { nomFichier },
      infosExtraites,
      texteRaw,
    });
  } catch (err) {
    console.error('Erreur globale scan :', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { scannerImage };