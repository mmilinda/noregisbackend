const Tesseract = require('tesseract.js');
const { Document } = require('../models');

const scannerImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Aucune image reçue.',
      });
    }

    const cheminFichier = req.file.path;

    const document = await Document.create({
      nomFichier: req.file.filename,
      cheminFichier,
      typeMime: req.file.mimetype,
      tailleFichier: req.file.size,
    });

    const { data: { text } } = await Tesseract.recognize(
      cheminFichier,
      'fra+eng',
      {
        logger: () => {},
        tessedit_pageseg_mode: 6,
      }
    );

    console.log('📄 OCR RAW:\n', text);

    const infosExtraites = extraireInfosPiece(text);

    return res.json({
      success: true,
      message: 'Scan terminé.',
      document: {
        id: document._id,
        nomFichier: document.nomFichier,
      },
      infosExtraites,
      texteRaw: text,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================================
// NETTOYAGE TEXTE
// ================================

const nettoyer = (str) => {
  if (!str) return null;

  return str
    .replace(/["""«»]/g, '')
    .replace(/,/g, ' ')
    .replace(/[^a-zA-ZÀ-ÿ\-\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
};

// ================================
// EXTRACTION PRINCIPALE
// ================================

const extraireInfosPiece = (texte) => {
  const infos = {
    nom: null,
    prenom: null,
    numeroPiece: null,
    typePiece: 'CNI',
    dateNaissance: null,
  };

  // 🔥 NORMALISATION OCR
  const texteClean = texte
    .replace(/\|/g, '')
    .replace(/0/g, 'O')
    .replace(/[\u2018\u2019]/g, "'");

  const lignes = texteClean.split('\n').map(l => l.trim()).filter(Boolean);
  const upper = texteClean.toUpperCase();

  // ================================
  // TYPE DE PIÈCE
  // ================================
  if (upper.includes('PASSEPORT')) infos.typePiece = 'PASSEPORT';
  else if (upper.includes('PERMIS')) infos.typePiece = 'PERMIS';
  else if (upper.includes('CARTE NATIONALE') || upper.includes('CNI')) infos.typePiece = 'CNI';

  // ================================
  // 🔥 NOM
  // ================================

  const blacklist = new Set([
    'REPUBLIQUE',
    'FRANCAISE',
    'CARTE',
    'NATIONALE',
    'IDENTITE',
    'DOCUMENT',
    'PASSEPORT',
    'NOM',
    'SEXE',
    'NATIONALITE'
  ]);

  let nom = null;

  const ligneNom = lignes.find(l =>
    /\b([A-ZÉÈÀÙÂÊÎÔÛÇ]{3,})\.\s?[A-Z]?/.test(l)
  );

  if (ligneNom) {
    const m = ligneNom.match(/\b([A-ZÉÈÀÙÂÊÎÔÛÇ]{3,})/);
    if (m && !blacklist.has(m[1])) nom = m[1];
  }

  if (!nom) {
    const candidats = texteClean.match(/\b[A-ZÉÈÀÙÂÊÎÔÛÇ]{3,}\b/g) || [];

    let best = null;
    let scoreMax = -999;

    candidats.forEach(c => {
      if (blacklist.has(c)) return;

      let score = 0;

      if (c.length >= 4 && c.length <= 12) score += 5;

      const pos = texteClean.indexOf(c);
      const posNom = texteClean.indexOf('NOM');

      if (posNom !== -1 && pos > posNom && pos < posNom + 200) {
        score += 5;
      }

      if (score > scoreMax) {
        scoreMax = score;
        best = c;
      }
    });

    nom = best;
  }

  if (nom) infos.nom = nettoyer(nom);

  // ================================
  // 🔥 PRÉNOM
  // ================================

  let prenom = null;

  for (let i = 0; i < lignes.length; i++) {
    if (/Pr[ée]noms?|Given/i.test(lignes[i])) {

      for (let j = 1; j <= 3; j++) {
        let l = lignes[i + j];
        if (!l) continue;

        l = l
          .replace(/^[^A-ZÀ-ÿ]+/, '')
          .replace(/[0-9]/g, '')
          .replace(/[-–—]+/g, ' ')
          .replace(/,/g, ' ')
          .trim();

        const m = l.match(
          /[A-ZÀ-ÿ][a-zà-ÿ]+(?:[\s\-][A-ZÀ-ÿ][a-zà-ÿ]+)*/g
        );

        if (m && m.join(' ').length > 3) {
          prenom = m.join(' ');
          break;
        }
      }
    }

    if (prenom) break;
  }

  if (prenom) infos.prenom = nettoyer(prenom);

  // ================================
  // 🔥 NUMERO DOCUMENT
  // ================================

  for (let i = 0; i < lignes.length; i++) {
    if (/N[°º]\s*DU\s*DOCUMENT|Document\s*No/i.test(lignes[i])) {

      for (let j = 0; j <= 4; j++) {
        const l = lignes[i + j] || '';
        const m = l.match(/\b([A-Z0-9]{6,15})\b/g);

        if (m) {
          const code = m.find(c =>
            /[A-Z]/.test(c) && /[0-9]/.test(c)
          );

          if (code) {
            infos.numeroPiece = code;
            break;
          }
        }
      }
    }
  }

  if (!infos.numeroPiece) {
    const m = texteClean.match(/\b([A-Z][A-Z0-9]{6,14})\b/g);

    if (m) {
      infos.numeroPiece = m.find(c =>
        /[A-Z]/.test(c) && /[0-9]/.test(c)
      );
    }
  }

  // ================================
  // 🔥 DATE DE NAISSANCE (FIX FINAL)
  // ================================

  const clean = texteClean
    .replace(/\|/g, '')
    .replace(/\./g, '')
    .replace(/[^0-9A-Z]/g, ' ');

  // format classique
  const d1 = clean.match(/\b(\d{2})[\/\- ](\d{2})[\/\- ](\d{4})\b/);

  if (d1) {
    infos.dateNaissance = `${d1[3]}-${d1[2]}-${d1[1]}`;
  }

  // format collé OCR
  if (!infos.dateNaissance) {
    const all = clean.match(/\b\d{8}\b/g);

    if (all) {
      const valid = all.find(v => {
        const j = +v.slice(0, 2);
        const m = +v.slice(2, 4);
        const a = +v.slice(4, 8);

        return j <= 31 && m <= 12 && a >= 1900 && a <= 2100;
      });

      if (valid) {
        infos.dateNaissance =
          `${valid.slice(4, 8)}-${valid.slice(2, 4)}-${valid.slice(0, 2)}`;
      }
    }
  }

  // ================================
  // MRZ fallback
  // ================================

  if (!infos.nom || !infos.prenom) {
    const mrz = texteClean.match(/[A-Z<]{25,}/g);

    if (mrz) {
      const parts = mrz[0]
        .replace(/</g, ' ')
        .split(/\s+/)
        .filter(Boolean);

      if (!infos.nom) infos.nom = nettoyer(parts[0]);
      if (!infos.prenom) infos.prenom = nettoyer(parts[1]);
    }
  }

  return infos;
};

module.exports = { scannerImage };