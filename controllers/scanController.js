const fs      = require('fs');
const axios   = require('axios');
const { Document } = require('../models');

// ── Auth Microblink ──────────────────────────────────────────────
const MICROBLINK_API_KEY    = process.env.MICROBLINK_API_KEY;
const MICROBLINK_API_SECRET = process.env.MICROBLINK_API_SECRET;

const getMicroblinkToken = () => {
  const raw = `${MICROBLINK_API_KEY}:${MICROBLINK_API_SECRET}`;
  return 'Bearer ' + Buffer.from(raw).toString('base64');
};

// ── Contrôleur principal ─────────────────────────────────────────
const scannerImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucune image reçue.' });
    }

    const cheminFichier = req.file.path;

    // 1. Sauvegarder en base
    const document = await Document.create({
      nomFichier:    req.file.filename,
      cheminFichier,
      typeMime:      req.file.mimetype,
      tailleFichier: req.file.size,
    });

    // 2. Lire l'image en base64
    const imageBase64 = fs.readFileSync(cheminFichier, { encoding: 'base64' });
    const imageSource = `data:${req.file.mimetype};base64,${imageBase64}`;

    // 3. Appel API Microblink (BlinkID = CNI, passeport, permis...)
    const { data: microblinkResult } = await axios.post(
      'https://api.microblink.com/v1/recognizers/blinkid',
      {
        imageSource,
        returnFullDocumentImage: false,
        returnFaceImage:         false,
        allowUnverifiedMrzResults: true,
      },
      {
        headers: {
          'Authorization': getMicroblinkToken(),
          'Content-Type':  'application/json',
          'Accept':        'application/json',
        },
      }
    );

    const r = microblinkResult?.result;
    console.log('📄 Microblink RAW:', JSON.stringify(r, null, 2));

    // 4. Mapper vers votre format existant
    const infosExtraites = {
      nom:           r?.lastName   || null,
      prenom:        r?.firstName  || null,
      numeroPiece:   r?.documentNumber || null,
      typePiece:     detecterType(r?.documentType),
      dateNaissance: formatDate(r?.dateOfBirth),
    };

    // 5. Socket.io temps réel
    const io = req.app.get('io');
    if (io) {
      io.emit('ocr:donnees', { infosExtraites, nomFichier: document.nomFichier });
    }

    return res.json({
      success: true,
      message: 'Scan terminé.',
      document:      { id: document._id, nomFichier: document.nomFichier },
      infosExtraites,
      texteRaw:      r,  // résultat complet Microblink si besoin
    });

  } catch (err) {
    console.error('❌ Microblink error:', err?.response?.data || err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Helpers ──────────────────────────────────────────────────────
const detecterType = (type) => {
  if (!type) return 'CNI';
  const t = type.toUpperCase();
  if (t.includes('PASSPORT'))       return 'PASSEPORT';
  if (t.includes('DRIVER'))         return 'PERMIS';
  if (t.includes('RESIDENCE'))      return 'CARTE_SEJOUR';
  return 'CNI';
};

const formatDate = (d) => {
  if (!d || !d.year) return null;
  const j = String(d.day).padStart(2, '0');
  const m = String(d.month).padStart(2, '0');
  return `${d.year}-${m}-${j}`;
};

module.exports = { scannerImage };