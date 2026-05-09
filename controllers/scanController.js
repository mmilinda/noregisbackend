const vision = require('@google-cloud/vision');
const { Document } = require('../models');

const visionClient = new vision.ImageAnnotatorClient({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON),
});

const scannerImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucune image reçue.' });
    }

    const cheminFichier = req.file.path;

    const document = await Document.create({
      nomFichier:    req.file.filename,
      cheminFichier,
      typeMime:      req.file.mimetype,
      tailleFichier: req.file.size,
    });

    const [result] = await visionClient.textDetection(cheminFichier);
    const text = result.fullTextAnnotation?.text || '';

    console.log('📄 OCR RAW:\n', text);

    const infosExtraites = extraireInfosPiece(text);

    const io = req.app.get('io');
    if (io) {
      io.emit('ocr:donnees', { infosExtraites, nomFichier: document.nomFichier });
    }

    return res.json({
      success: true,
      message: 'Scan terminé.',
      document: { id: document._id, nomFichier: document.nomFichier },
      infosExtraites,
      texteRaw: text,
    });

  } catch (err) {
    console.error('Scan error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ── Utilitaires ────────────────────────────────────────────────────────── */

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

/* ── Blacklist ──────────────────────────────────────────────────────────── */

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

/* ── Extraction label → valeur ──────────────────────────────────────────── */

const extraireChamp = (lignes, labelRegex, labelsAIgnorerRegex = null) => {
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    const match = ligne.match(labelRegex);
    if (!match) continue;

    const apresLabel = ligne
      .slice(match.index + match[0].length)
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

/* ── Extraction principale ──────────────────────────────────────────────── */

const extraireInfosPiece = (texte) => {
  const infos = {
    nom: null, prenom: null, numeroPiece: null,
    typePiece: 'CNI', dateNaissance: null,
  };

  const texteClean = texte
    .replace(/\|/g, 'I')
    .replace(/[\u2018\u2019]/g, "'");

  const lignes = texteClean.split('\n').map(l => l.trim()).filter(Boolean);
  const upper  = texteClean.toUpperCase();

  // ── Type de pièce ─────────────────────────────────────────────────────────
  if (upper.includes('PASSEPORT'))               infos.typePiece = 'PASSEPORT';
  else if (upper.includes('PERMIS DE CONDUIRE')) infos.typePiece = 'PERMIS';
  else if (upper.includes("CARTE D'IDENTITE")
        || upper.includes('CARTE NATIONALE')
        || upper.includes('CEDEAO')
        || upper.includes('ECOWAS')
        || upper.includes('IDENTITY CARD')
        || upper.includes('CNI'))                infos.typePiece = 'CNI';
  else if (upper.includes('SEJOUR'))             infos.typePiece = 'CARTE_SEJOUR';

  // ── Date de naissance ─────────────────────────────────────────────────────
  for (let i = 0; i < lignes.length; i++) {
    if (/date\s*de\s*naiss|date\s*of\s*birth/i.test(lignes[i])) {
      const meme = lignes[i].match(/\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/);
      if (meme) { infos.dateNaissance = `${meme[3]}-${meme[2]}-${meme[1]}`; break; }
      for (let j = 1; j <= 3; j++) {
        const d = extraireDate(lignes[i + j] || '');
        if (d) { infos.dateNaissance = d; break; }
      }
      if (infos.dateNaissance) break;
    }
  }
  if (!infos.dateNaissance) infos.dateNaissance = extraireDate(texteClean);

  const LABELS_REGEX = /^(Pr[ée]noms?|Nom|Date|Sexe|Taille|Lieu|N[°º]|Carte|Birth|Surname|Given|Forename)\b/i;

  // ── PRÉNOM ────────────────────────────────────────────────────────────────
  const prenomBrut = extraireChamp(
    lignes,
    /Pr[ée]noms?\s*[:\-]?|Given\s*names?\s*[:\-]?|Forenames?\s*[:\-]?/i,
    LABELS_REGEX
  );
  if (prenomBrut) infos.prenom = nettoyer(prenomBrut);

  // ── NOM ───────────────────────────────────────────────────────────────────
  const nomBrut = extraireChamp(
    lignes,
    /\bNom\b\s*[:\-]?|\bSurname\b\s*[:\-]?|\bLast\s*name\b\s*[:\-]?/i,
    LABELS_REGEX
  );
  if (nomBrut) infos.nom = nettoyer(nomBrut);

  // Fallback nom
  if (!infos.nom && infos.prenom) {
    const prenomUpper = infos.prenom.toUpperCase();
    const pos = upper.indexOf(prenomUpper);
    if (pos !== -1) {
      const apres = texteClean.slice(pos + infos.prenom.length);
      const candidats = apres.match(/\b[A-ZÀ-Ÿ]{2,}\b/g) || [];
      const val = candidats.find(c => isValidNom(c) && c !== prenomUpper);
      if (val) infos.nom = nettoyer(val);
    }
  }

  // ── Numéro de pièce ───────────────────────────────────────────────────────
  for (let i = 0; i < lignes.length; i++) {
    if (/N[°º\.]\s*de\s*la\s*carte|carte\s*d.identit/i.test(lignes[i])) {
      const meme = lignes[i].match(/[\d][\d\s]{5,}/);
      if (meme) { infos.numeroPiece = meme[0].replace(/\s+/g, ''); break; }
      for (let j = 1; j <= 4; j++) {
        const m = (lignes[i + j] || '').match(/[\d][\d\s]{5,}/);
        if (m) {
          const code = m[0].replace(/\s+/g, '');
          if (code.length >= 6) { infos.numeroPiece = code; break; }
        }
      }
      if (infos.numeroPiece) break;
    }
  }

  if (!infos.numeroPiece) {
    for (let i = 0; i < lignes.length; i++) {
      if (/N[°º]\s*DU\s*DOCUMENT|Document\s*No/i.test(lignes[i])) {
        for (let j = 0; j <= 4; j++) {
          const m = (lignes[i + j] || '').match(/\b([A-Z0-9]{6,15})\b/g);
          const code = (m || []).find(c => /[A-Z]/.test(c) && /[0-9]/.test(c));
          if (code) { infos.numeroPiece = code; break; }
        }
        if (infos.numeroPiece) break;
      }
    }
  }

  if (!infos.numeroPiece) {
    const m = texteClean.match(/\b([A-Z][A-Z0-9]{5,14})\b/g);
    if (m) infos.numeroPiece = m.find(c => /[A-Z]/.test(c) && /[0-9]/.test(c)) || null;
  }

  // ── MRZ fallback ──────────────────────────────────────────────────────────
  if (!infos.nom || !infos.prenom) {
    const mrzLines = lignes.filter(l => /^[A-Z<]{20,}/.test(l));
    if (mrzLines.length > 0) {
      const parts = mrzLines[0].replace(/</g, ' ').split(/\s+/).filter(Boolean);
      if (!infos.nom    && isValidNom(parts[0])) infos.nom    = nettoyer(parts[0]);
      if (!infos.prenom && isValidNom(parts[1])) infos.prenom = nettoyer(parts[1]);
    }
  }

  return infos;
};

module.exports = { scannerImage };