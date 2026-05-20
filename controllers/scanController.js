const { Document } = require('../models');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const VERYFI_CLIENT_ID     = process.env.VERYFI_CLIENT_ID;
const VERYFI_CLIENT_SECRET = process.env.VERYFI_CLIENT_SECRET;
const VERYFI_USERNAME      = process.env.VERYFI_USERNAME;
const VERYFI_API_KEY       = process.env.VERYFI_API_KEY;
const VERYFI_API_URL       = 'https://api.veryfi.com/api/v8/partner/documents';

const scannerImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucune image reçue.' });

    const cheminFichier = req.file.path;
    const document = await Document.create({
      nomFichier:    req.file.filename,
      cheminFichier,
      typeMime:      req.file.mimetype,
      tailleFichier: req.file.size,
    });

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
    console.log('✅ Veryfi response:', data);
    const infosExtraites = extraireInfosDepuisVeryfi(data);

    const io = req.app.get('io');
    if (io) io.emit('ocr:donnees', { infosExtraites, nomFichier: document.nomFichier });

    return res.json({
      success: true,
      message: 'Scan terminé via Veryfi.',
      document: { id: document._id, nomFichier: document.nomFichier },
      infosExtraites,
      texteRaw: data.ocr_text || '',
    });
  } catch (err) {
    console.error('Veryfi error:', err.response?.data || err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

const extraireInfosDepuisVeryfi = (data) => {
  const ocrText = data.ocr_text || '';
  const lignes = ocrText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const infos = {
    nom: null, prenom: null, dateNaissance: null, numeroPiece: null,
    typePiece: 'CNI', sexe: null, taille: null, lieuNaissance: null,
    dateDelivrance: null, dateExpiration: null, centreEnregistrement: null,
    adresseDomicile: null,
  };

  // ─── Parcours ligne par ligne pour extraire les champs simples ───
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i].toLowerCase();

    // Prénom (label exact "prénom" ou "prenom")
    if (ligne === 'prénom' || ligne === 'prenom') {
      if (i + 1 < lignes.length) infos.prenom = lignes[i + 1];
    }
    // Nom
    else if (ligne === 'nom') {
      if (i + 1 < lignes.length) infos.nom = lignes[i + 1];
    }
    // Lieu de naissance (gère "lieu de naissance" ou "lito de naissance")
    else if (ligne.includes('lieu de naissance') || ligne.includes('lito de naissance')) {
      if (i + 1 < lignes.length) infos.lieuNaissance = lignes[i + 1];
    }
    // Centre d'enregistrement (gère "centre d'enregistrement" ou "centre fenregistrement")
    else if (ligne.includes('centre') && (ligne.includes('enregistrement') || ligne.includes('fenregistrement'))) {
      if (i + 1 < lignes.length) infos.centreEnregistrement = lignes[i + 1];
    }
    // Adresse du domicile
    else if (ligne.includes('adresse') && (ligne.includes('domicile') || ligne.includes('domible'))) {
      if (i + 1 < lignes.length) infos.adresseDomicile = lignes[i + 1];
    }
  }

  // ─── Numéro de pièce ───
  let match = ocrText.match(/N°\s*de\s*la\s*carte\s*d['']identité\s*\n\s*([\d\s]+)/i);
  if (match) {
    infos.numeroPiece = match[1].replace(/\s/g, '');
  } else {
    match = ocrText.match(/\b(\d{15,})\b/);
    if (match) infos.numeroPiece = match[1];
  }

  // ─── Date de naissance, sexe, taille (ligne unique) ───
  match = ocrText.match(/(\d{2}\/\d{2}\/\d{4})\s+([MF])\s+(\d{2,3})\s*cm/i);
  if (match) {
    const [j, m, a] = match[1].split('/');
    infos.dateNaissance = `${a}-${m}-${j}`;
    infos.sexe = match[2];
    infos.taille = parseInt(match[3], 10);
  } else {
    match = ocrText.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (match) {
      const [j, m, a] = match[1].split('/');
      infos.dateNaissance = `${a}-${m}-${j}`;
    }
  }

  // ─── Dates de délivrance et d'expiration ───
  match = ocrText.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/);
  if (match) {
    const [j1, m1, a1] = match[1].split('/');
    const [j2, m2, a2] = match[2].split('/');
    infos.dateDelivrance = `${a1}-${m1}-${j1}`;
    infos.dateExpiration = `${a2}-${m2}-${j2}`;
  }

  // ─── Type de pièce ───
  const upper = ocrText.toUpperCase();
  if (upper.includes("CARTE D'IDENTITE CEDEAO") || upper.includes('ECOWAS IDENTITY CARD'))
    infos.typePiece = 'CARTE_IDENTITE_CEDEAO';
  else if (upper.includes('PASSEPORT')) infos.typePiece = 'PASSEPORT';
  else if (upper.includes('PERMIS')) infos.typePiece = 'PERMIS';
  else if (upper.includes('CARTE DE SEJOUR')) infos.typePiece = 'CARTE_SEJOUR';
  else if (upper.includes('CARTE CONSULAIRE')) infos.typePiece = 'CARTE_CONSULAIRE';

  // ─── Nettoyage final (supprime caractères spéciaux, espaces multiples) ───
  const nettoyer = (str) => str ? str.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').replace(/\s+/g, ' ').trim() : null;
  infos.nom = nettoyer(infos.nom);
  infos.prenom = nettoyer(infos.prenom);
  infos.lieuNaissance = nettoyer(infos.lieuNaissance);
  infos.centreEnregistrement = nettoyer(infos.centreEnregistrement);
  infos.adresseDomicile = nettoyer(infos.adresseDomicile);

  return infos;
};

module.exports = { scannerImage };