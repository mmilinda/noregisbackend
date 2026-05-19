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
  const infos = {
    nom: null,
    prenom: null,
    dateNaissance: null,
    numeroPiece: null,
    typePiece: 'CNI',
    sexe: null,
    taille: null,
    lieuNaissance: null,
    dateDelivrance: null,
    dateExpiration: null,
    centreEnregistrement: null,
    adresseDomicile: null,
  };

  // ── Type de pièce (détection spécifique CEDEAO) ─────────────────
  if (ocrText.toUpperCase().includes('CARTE D\'IDENTITE CEDEAO') ||
      ocrText.toUpperCase().includes('ECOWAS IDENTITY CARD')) {
    infos.typePiece = 'CARTE_IDENTITE_CEDEAO';
  } else if (ocrText.toUpperCase().includes('PASSEPORT')) {
    infos.typePiece = 'PASSEPORT';
  } else if (ocrText.toUpperCase().includes('PERMIS DE CONDUIRE')) {
    infos.typePiece = 'PERMIS';
  } else if (ocrText.toUpperCase().includes('CARTE DE SEJOUR')) {
    infos.typePiece = 'CARTE_SEJOUR';
  } else if (ocrText.toUpperCase().includes('CARTE CONSULAIRE')) {
    infos.typePiece = 'CARTE_CONSULAIRE';
  } else if (ocrText.toUpperCase().includes('CARTE NATIONALE') ||
             ocrText.toUpperCase().includes('CNI')) {
    infos.typePiece = 'CNI';
  }

  // ── Numéro de pièce ──────────────────────────────────────────────
  let match = ocrText.match(/N°\s*de\s*la\s*carte\s*d['']identité\s*:?\s*([A-Z0-9]+)/i);
  if (!match) match = ocrText.match(/N[°º]\s*:?\s*([A-Z0-9]{8,})/i);
  if (!match && data.document_reference_number) match = [null, data.document_reference_number];
  if (match) infos.numeroPiece = match[1].trim();

  // ── Nom ──────────────────────────────────────────────────────────
  match = ocrText.match(/Nom\s*:?\s*([A-Z\s]+)(?:\n|Prénom|$)/i);
  if (match) infos.nom = nettoyer(match[1].trim());

  // ── Prénom ───────────────────────────────────────────────────────
  match = ocrText.match(/Pr[ée]nom\s*:?\s*([A-Za-z\s]+)(?:\n|Date|$)/i);
  if (match) infos.prenom = nettoyer(match[1].trim());

  // ── Date de naissance ────────────────────────────────────────────
  match = ocrText.match(/Date de naissance\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (match) {
    const [j, m, a] = match[1].split('/');
    infos.dateNaissance = `${a}-${m}-${j}`;
  } else {
    infos.dateNaissance = extraireDate(ocrText);
  }

  // ── Sexe ─────────────────────────────────────────────────────────
  match = ocrText.match(/Sexe\s*:?\s*([MF])/i);
  if (match) infos.sexe = match[1].toUpperCase();

  // ── Taille (en cm) ───────────────────────────────────────────────
  match = ocrText.match(/Taille\s*:?\s*(\d{2,3})\s*cm/i);
  if (match) infos.taille = parseInt(match[1], 10);

  // ── Lieu de naissance ────────────────────────────────────────────
  match = ocrText.match(/Lieu de naissance\s*:?\s*([A-Z\s]+)(?:\n|$)/i);
  if (match) infos.lieuNaissance = nettoyer(match[1].trim());

  // ── Date de délivrance ───────────────────────────────────────────
  match = ocrText.match(/Date de délivrance\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (match) {
    const [j, m, a] = match[1].split('/');
    infos.dateDelivrance = `${a}-${m}-${j}`;
  }

  // ── Date d'expiration ────────────────────────────────────────────
  match = ocrText.match(/Date d['']expiration\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (match) {
    const [j, m, a] = match[1].split('/');
    infos.dateExpiration = `${a}-${m}-${j}`;
  }

  // ── Centre d'enregistrement ──────────────────────────────────────
  match = ocrText.match(/Centre d['']enregistrement\s*:?\s*([A-Z\s\/]+)(?:\n|$)/i);
  if (match) infos.centreEnregistrement = nettoyer(match[1].trim());

  // ── Adresse du domicile ──────────────────────────────────────────
  match = ocrText.match(/Adresse du domicile\s*:?\s*([A-Z\s]+)(?:\n|$)/i);
  if (match) infos.adresseDomicile = nettoyer(match[1].trim());

  // Nettoyage final
  if (infos.nom) infos.nom = nettoyer(infos.nom);
  if (infos.prenom) infos.prenom = nettoyer(infos.prenom);
  if (infos.lieuNaissance) infos.lieuNaissance = nettoyer(infos.lieuNaissance);
  if (infos.centreEnregistrement) infos.centreEnregistrement = nettoyer(infos.centreEnregistrement);
  if (infos.adresseDomicile) infos.adresseDomicile = nettoyer(infos.adresseDomicile);
  if (infos.numeroPiece) infos.numeroPiece = infos.numeroPiece.replace(/\s/g, '');

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