const fs      = require('fs');
const axios   = require('axios');
const FormData = require('form-data');
const { Document } = require('../models');

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

    // 2. Préparer le formulaire multipart pour Mindee
    const form = new FormData();
    form.append('document', fs.createReadStream(cheminFichier), {
      filename:    req.file.filename,
      contentType: req.file.mimetype,
    });

    // 3. Appel direct à l'API Mindee (International ID v2)
    const { data } = await axios.post(
      'https://api.mindee.net/v1/products/mindee/international_id/v2/predict',
      form,
      {
        headers: {
          'Authorization': `Token ${process.env.MNDEE_API_KEY}`,
          ...form.getHeaders(),
        },
      }
    );

    const pred = data.document.inference.prediction;
    console.log('📄 Mindee RAW:', JSON.stringify(pred, null, 2));

    // 4. Mapper vers votre format
    const infosExtraites = {
      nom:            pred.surnames?.[0]?.value     || null,
      prenom:         pred.given_names?.[0]?.value  || null,
      numeroPiece:    pred.document_number?.value   || null,
      typePiece:      detecterType(pred.document_type?.value),
      dateNaissance:  pred.birth_date?.value        || null,
      nationalite:    pred.nationality?.value       || null,
      dateExpiration: pred.expiry_date?.value       || null,
      pays:           pred.country_of_issue?.value  || null,
    };

    // 5. Socket.io temps réel
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
    console.error('❌ Scan error:', err?.response?.data || err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const detecterType = (type) => {
  if (!type) return 'CNI';
  const t = type.toUpperCase();
  if (t.includes('PASSPORT'))  return 'PASSEPORT';
  if (t.includes('DRIVER'))    return 'PERMIS';
  if (t.includes('RESIDENCE')) return 'CARTE_SEJOUR';
  return 'CNI';
};

module.exports = { scannerImage };