const fs     = require('fs');
const mindee = require('mindee');
const { Document } = require('../models');

const mindeeClient = new mindee.Client({ apiKey: process.env.MINDEE_API_KEY });

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

    // 2. Appel Mindee — International ID (CNI, passeport, permis, tous pays)
    const inputSource = mindeeClient.docFromPath(cheminFichier);
    const apiResponse = await mindeeClient.parse(
      mindee.product.InternationalIdV2,
      inputSource
    );

    const pred = apiResponse.document.inference.prediction;
    console.log('📄 Mindee RAW:', JSON.stringify(pred, null, 2));

    // 3. Mapper vers votre format
    const infosExtraites = {
      nom:           pred.surnames?.[0]?.value      || null,
      prenom:        pred.givenNames?.[0]?.value    || null,
      numeroPiece:   pred.documentNumber?.value     || null,
      typePiece:     detecterType(pred.documentType?.value),
      dateNaissance: pred.birthDate?.value          || null,
      nationalite:   pred.nationality?.value        || null,
      dateExpiration: pred.expiryDate?.value        || null,
      pays:          pred.countryOfIssue?.value     || null,
    };

    // 4. Socket.io temps réel
    const io = req.app.get('io');
    if (io) {
      io.emit('ocr:donnees', { infosExtraites, nomFichier: document.nomFichier });
    }

    return res.json({
      success: true,
      message: 'Scan terminé.',
      document: { id: document._id, nomFichier: document.nomFichier },
      infosExtraites,
    });

  } catch (err) {
    console.error('❌ Mindee error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Helpers ──────────────────────────────────────────────────────
const detecterType = (type) => {
  if (!type) return 'CNI';
  const t = type.toUpperCase();
  if (t.includes('PASSPORT'))   return 'PASSEPORT';
  if (t.includes('DRIVER'))     return 'PERMIS';
  if (t.includes('RESIDENCE'))  return 'CARTE_SEJOUR';
  return 'CNI';
};

module.exports = { scannerImage };