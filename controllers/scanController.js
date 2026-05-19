const { Document } = require('../models');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// ── Configuration Veryfi ─────────────────────────────────────────────
const VERYFI_CLIENT_ID     = process.env.VERYFI_CLIENT_ID;
const VERYFI_CLIENT_SECRET = process.env.VERYFI_CLIENT_SECRET;
const VERYFI_USERNAME      = process.env.VERYFI_USERNAME;
const VERYFI_API_KEY       = process.env.VERYFI_API_KEY;

const VERYFI_API_URL = 'https://api.veryfi.com/api/v8/partner/documents';

// ── Scanner avec Veryfi ─────────────────────────────────────────────
const scannerImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucune image reçue.' });
    }

    const cheminFichier = req.file.path;

    // Sauvegarde en base (métadonnées)
    const document = await Document.create({
      nomFichier:    req.file.filename,
      cheminFichier,
      typeMime:      req.file.mimetype,
      tailleFichier: req.file.size,
    });

    // ── Appel à l'API Veryfi ───────────────────────────────────────
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

    // Extraction des champs depuis la réponse Veryfi
    const infosExtraites = extraireInfosDepuisVeryfi(data);

    // Émission Socket.io si disponible
    const io = req.app.get('io');
    if (io) {
      io.emit('ocr:donnees', { infosExtraites, nomFichier: document.nomFichier });
    }

    // Suppression éventuelle du fichier temporaire (optionnel)
    // fs.unlinkSync(cheminFichier);

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

/* ── Adaptation des résultats Veryfi vers le format attendu ─────────── */
const extraireInfosDepuisVeryfi = (data) => {
  const ocrText = data.ocr_text || '';
  const lignes = ocrText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const infos = {
    nom: null, prenom: null, dateNaissance: null, numeroPiece: null,
    typePiece: 'CNI', sexe: null, taille: null, lieuNaissance: null,
    dateDelivrance: null, dateExpiration: null, centreEnregistrement: null,
    adresseDomicile: null,
  };

  // Type de pièce
  const upper = ocrText.toUpperCase();
  if (upper.includes('CARTE D\'IDENTITE CEDEAO') || upper.includes('ECOWAS IDENTITY CARD')) {
    infos.typePiece = 'CARTE_IDENTITE_CEDEAO';
  } else if (upper.includes('PASSEPORT')) {
    infos.typePiece = 'PASSEPORT';
  } else if (upper.includes('PERMIS')) {
    infos.typePiece = 'PERMIS';
  } else if (upper.includes('CARTE DE SEJOUR')) {
    infos.typePiece = 'CARTE_SEJOUR';
  } else if (upper.includes('CARTE CONSULAIRE')) {
    infos.typePiece = 'CARTE_CONSULAIRE';
  }

  // Numéro de pièce (recherche du long nombre)
  let match = ocrText.match(/N°\s*de\s*la\s*carte\s*d['']identité\s*\n\s*([\d\s]+)/i);
  if (match) {
    infos.numeroPiece = match[1].replace(/\s/g, '');
  } else {
    match = ocrText.match(/\b(\d{15,})\b/);
    if (match) infos.numeroPiece = match[1];
  }

  // Parcours ligne par ligne
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i].toLowerCase();
    
    // Prénom
    if (ligne === 'prénom' || ligne === 'prenom') {
      if (i + 1 < lignes.length) infos.prenom = lignes[i + 1];
    }
    // Nom
    else if (ligne === 'nom') {
      if (i + 1 < lignes.length) infos.nom = lignes[i + 1];
    }
    // Lieu de naissance
    else if (ligne.includes('lieu de naissance') || ligne.includes('lito de naissance')) {
      if (i + 1 < lignes.length) infos.lieuNaissance = lignes[i + 1];
    }
    // Centre d'enregistrement
    else if (ligne.includes('centre') && (ligne.includes('enregistrement') || ligne.includes('fenregistrement'))) {
      if (i + 1 < lignes.length) infos.centreEnregistrement = lignes[i + 1];
    }
    // Adresse
    else if (ligne.includes('adresse') && (ligne.includes('domicile') || ligne.includes('domible'))) {
      if (i + 1 < lignes.length) infos.adresseDomicile = lignes[i + 1];
    }
  }

  // Date naissance, sexe, taille (ligne avec trois valeurs)
  match = ocrText.match(/(\d{2}\/\d{2}\/\d{4})\s+([MF])\s+(\d{2,3})\s*cm/i);
  if (match) {
    const [j, m, a] = match[1].split('/');
    infos.dateNaissance = `${a}-${m}-${j}`;
    infos.sexe = match[2];
    infos.taille = parseInt(match[3], 10);
  } else {
    // fallback : date seule
    match = ocrText.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (match) {
      const [j, m, a] = match[1].split('/');
      infos.dateNaissance = `${a}-${m}-${j}`;
    }
  }

  // Dates délivrance / expiration (deux dates sur la même ligne)
  match = ocrText.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/);
  if (match) {
    const [j1, m1, a1] = match[1].split('/');
    const [j2, m2, a2] = match[2].split('/');
    infos.dateDelivrance = `${a1}-${m1}-${j1}`;
    infos.dateExpiration = `${a2}-${m2}-${j2}`;
  }

  // Nettoyage des champs texte
  const nettoyer = (str) => {
    if (!str) return null;
    return str.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').replace(/\s+/g, ' ').trim();
  };
  infos.nom = nettoyer(infos.nom);
  infos.prenom = nettoyer(infos.prenom);
  infos.lieuNaissance = nettoyer(infos.lieuNaissance);
  infos.centreEnregistrement = nettoyer(infos.centreEnregistrement);
  infos.adresseDomicile = nettoyer(infos.adresseDomicile);

  return infos;
};
/* ── UTILITAIRES (conservés) ─────────────────────────────────────────── */
const nettoyer = (str) => {
  if (!str) return null;
  return str
    .replace(/["""«»]/g, '')
    .replace(/,/g, ' ')
    .replace(/[^a-zA-ZÀ-ÿ\-\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
};

const extraireDate = (texte) => {
  const d1 = texte.match(/\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/);
  if (d1) {
    const j = +d1[1], m = +d1[2], a = +d1[3];
    if (j >= 1 && j <= 31 && m >= 1 && m <= 12 && a >= 1900 && a <= 2100)
      return `${d1[3]}-${d1[2]}-${d1[1]}`;
  }
  const all = texte.replace(/[^0-9]/g, ' ').match(/\b\d{8}\b/g);
  if (all) {
    const valid = all.find(v => {
      const j = +v.slice(0,2), m = +v.slice(2,4), a = +v.slice(4,8);
      return j >= 1 && j <= 31 && m >= 1 && m <= 12 && a >= 1900 && a <= 2100;
    });
    if (valid) return `${valid.slice(4,8)}-${valid.slice(2,4)}-${valid.slice(0,2)}`;
  }
  return null;
};

const BLACKLIST = new Set([
  'REPUBLIQUE','FRANCAISE','FRANÇAISE','SENEGAL','SÉNÉGAL','CARTE','NATIONALE',
  'IDENTITE','IDENTITÉ','DOCUMENT','PASSEPORT','NOM','SEXE','NATIONALITE',
  'NATIONALITÉ','CEDEAO','ECOWAS','IDENTITY','CARD','BILHETE','IDENTIDADE',
  'OWAS','TAILLE','LIEU','NAISSANCE','DELIVRANCE','EXPIRATION','CENTRE',
  'ENREGISTREMENT','DOMICILE','ADRESSE','DATE','PRENOM','PRENOMS','COMMUNE',
  'BIRTH','SURNAME','GIVEN','FORENAME','NAMES','TYPE','PIECE','NUMERO','NUMÉRO',
  'SENEGALAN','SÉNÉGALAISE',
]);

const isValidNom = (s) => {
  if (!s) return false;
  const up = s.toUpperCase().trim();
  if (BLACKLIST.has(up)) return false;
  if (up.length < 2 || up.length > 25) return false;
  if (/\d/.test(up)) return false;
  return true;
};

const extraireChamp = (lignes, labelRegex, labelsAIgnorerRegex = null) => {
  // ... (fonction inchangée, conservée pour compatibilité)
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    if (!labelRegex.test(ligne)) continue;
    const apresLabel = ligne
      .replace(labelRegex, '')
      .replace(/^\s*[:\-]?\s*/, '')
      .trim();
    if (apresLabel.length >= 2 && !/^\d+$/.test(apresLabel)) {
      const mots = apresLabel.match(/\b[A-ZÀ-Ÿa-zà-ÿ]{2,}\b/g) || [];
      const valides = mots.filter(m => isValidNom(m));
      if (valides.length > 0) return valides.join(' ');
    }
    for (let j = 1; j <= 4; j++) {
      const l = (lignes[i + j] || '').trim();
      if (!l) continue;
      if (labelsAIgnorerRegex && labelsAIgnorerRegex.test(l)) continue;
      if (/^\d+$/.test(l) || l.length < 2) continue;
      const mots = l.match(/\b[A-ZÀ-Ÿa-zà-ÿ]{2,}\b/g) || [];
      const valides = mots.filter(m => isValidNom(m));
      if (valides.length > 0) return valides.join(' ');
    }
  }
  return null;
};

module.exports = { scannerImage };