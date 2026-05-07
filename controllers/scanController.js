const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const sharp = require('sharp');
const { Document } = require('../models');

const MINDEE_API_KEY = process.env.MINDEE_API_KEY;
const MINDEE_API_URL = 'https://api.mindee.net/v2/products/mindee/international_id/v2/predict';

async function preparerImage(imagePath) {
  const outPath = imagePath + '_prepared.jpg';
  try {
    await sharp(imagePath)
      .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
      .normalize()
      .jpeg({ quality: 85 })
      .toFile(outPath);
    return outPath;
  } catch (err) {
    console.error('Sharp error:', err);
    return imagePath;
  }
}

const extraireAvecMindee = async (fichierPath, fileInfos) => {
  try {
    console.log('--- Mindee request ---');
    console.log('File size:', fs.statSync(fichierPath).size);
    console.log('MIME:', fileInfos.mimetype);

    const form = new FormData();
    form.append('document', fs.createReadStream(fichierPath));

    const response = await axios.post(MINDEE_API_URL, form, {
      headers: { ...form.getHeaders(), Authorization: `Token ${MINDEE_API_KEY}` },
      timeout: 30000,
    });

    const p = response.data.document.inference.prediction;
    return {
      nom: p.last_name?.value || p.surnames?.[0]?.value || null,
      prenom: p.first_name?.value || p.given_names?.[0]?.value || null,
      numeroPiece: p.document_number?.value || null,
      dateNaissance: p.birth_date?.value || null,
      dateExpiration: p.expiry_date?.value || null,
      sexe: p.sex?.value === 'M' ? 'Masculin' : (p.sex?.value === 'F' ? 'Féminin' : null),
      nationalite: p.nationality?.value || null,
      typePiece: getTypeDocument(p.document_type?.value),
      paysEmission: p.country_of_issue?.value || null,
      adresse: p.address?.value || null,
      mrz: p.mrz_line?.value || null,
      confiance: {
        nom: p.last_name?.confidence || 0,
        prenom: p.first_name?.confidence || 0,
        numero: p.document_number?.confidence || 0,
      },
    };
  } catch (err) {
    console.error('Mindee error:', err.response?.data || err.message);
    return {
      nom: null, prenom: null, numeroPiece: null, dateNaissance: null,
      dateExpiration: null, sexe: null, nationalite: null, typePiece: 'INCONNU',
      paysEmission: null, adresse: null, mrz: null,
      confiance: { nom: 0, prenom: 0, numero: 0 },
    };
  }
};

const scannerImage = async (req, res) => {
  let originalPath = null, preparedPath = null;
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucune image' });

    originalPath = req.file.path;
    preparedPath = await preparerImage(originalPath);

    const document = await Document.create({
      nomFichier: req.file.filename,
      cheminFichier: preparedPath,
      typeMime: req.file.mimetype,
      tailleFichier: fs.statSync(preparedPath).size,
    });

    const infos = await extraireAvecMindee(preparedPath, req.file);

    const io = req.app.get('io');
    if (io) io.emit('ocr:donnees', { infosExtraites: infos, nomFichier: document.nomFichier });

    res.json({ success: true, message: 'Scan terminé', document: { id: document._id, nomFichier: document.nomFichier }, infosExtraites: infos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    try {
      if (originalPath && fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
      if (preparedPath && preparedPath !== originalPath && fs.existsSync(preparedPath)) fs.unlinkSync(preparedPath);
    } catch (e) { console.error('Cleanup error', e); }
  }
};

function getTypeDocument(type) {
  const map = { ID_CARD: 'CNI', PASSPORT: 'PASSEPORT', DRIVER_LICENSE: 'PERMIS', RESIDENCE_PERMIT: 'CARTE_SEJOUR' };
  return map[type] || type || 'CNI';
}

module.exports = { scannerImage };