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

    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        message: 'Fichier invalide (image requise).',
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
        tessedit_pageseg_mode: 6
      }
    );

    console.log('📄 OCR RAW:\n', text);

    const infosExtraites = extraireInfosPiece(text);

    res.json({
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
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// ================================
// NETTOYAGE
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
// EXTRACTION
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
    .replace(/[|]/g, 'I')
    .replace(/0/g, 'O')
    .replace(/[\u2018\u2019]/g, "'");

  const lignes = texteClean.split('\n').map(l => l.trim()).filter(Boolean);
  const tUpper = texteClean.toUpperCase();

  // ================================
  // TYPE PIECE
  // ================================
  if (tUpper.includes('PASSEPORT')) infos.typePiece = 'PASSEPORT';
  else if (tUpper.includes('PERMIS')) infos.typePiece = 'PERMIS';
  else if (tUpper.includes('CARTE NATIONALE') || tUpper.includes('CNI')) infos.typePiece = 'CNI';

  // ================================
  // 🔥 NOM (SCORING INTELLIGENT)
  // ================================
  const blacklist = [
    'REPUBLIQUE','FRANCAISE','CARTE','NATIONALE',
    'IDENTITE','DOCUMENT','PASSEPORT','NOM','SEXE',
    'SURNAME','GIVEN'
  ];

  const candidats = texteClean.match(/\b[A-ZÉÈÀÙÂÊÎÔÛÇ]{3,}\b/g) || [];

  let meilleurNom = null;
  let scoreMax = 0;

  candidats.forEach(n => {
    if (blacklist.includes(n)) return;

    let score = 0;

    // bonus longueur
    score += n.length;

    // bonus proximité mot NOM
    if (texteClean.includes('NOM') && texteClean.indexOf(n) < texteClean.indexOf('NOM') + 150) {
      score += 5;
    }

    // bonus si ressemble à un vrai nom (pas trop court)
    if (n.length >= 4) score += 2;

    if (score > scoreMax) {
      scoreMax = score;
      meilleurNom = n;
    }
  });

  if (meilleurNom) {
    infos.nom = nettoyer(meilleurNom);
  }

  // ================================
  // 🔥 PRÉNOM (STRICT APRES LABEL)
  // ================================
  let prenomTrouve = null;

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

        const match = l.match(
          /[A-ZÀ-ÿ][a-zà-ÿ]+(?:[\s\-][A-ZÀ-ÿ][a-zà-ÿ]+)*/g
        );

        if (match && match.join(' ').length > 3) {
          prenomTrouve = match.join(' ');
          break;
        }
      }
    }

    if (prenomTrouve) break;
  }

  if (prenomTrouve) {
    infos.prenom = nettoyer(prenomTrouve);
  }

  // ================================
  // NUMERO PIECE
  // ================================
  for (let i = 0; i < lignes.length; i++) {
    if (/N[°º]\s*DU\s*DOCUMENT|Document\s*No/i.test(lignes[i])) {
      for (let j = 0; j <= 4; j++) {
        const ligne = lignes[i + j] || '';
        const m = ligne.match(/\b([A-Z0-9]{6,15})\b/g);

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
      if (infos.numeroPiece) break;
    }
  }

  if (!infos.numeroPiece) {
    const m = texteClean.match(/\b([A-Z][A-Z0-9]{6,14})\b/g);

    if (m) {
      const code = m.find(c =>
        /[A-Z]/.test(c) &&
        /[0-9]/.test(c) &&
        !blacklist.includes(c)
      );

      if (code) infos.numeroPiece = code;
    }
  }

  // ================================
  // DATE NAISSANCE
  // ================================
  const d1 = texteClean.match(/\b(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})\b/);

  if (d1) {
    infos.dateNaissance = `${d1[3]}-${d1[2]}-${d1[1]}`;
  }

  if (!infos.dateNaissance) {
    const d2 = texteClean.match(/\b(\d{2})(\d{2})(\d{4})\b/);

    if (d2) {
      const [, j, m, a] = d2;
      if (j <= 31 && m <= 12) {
        infos.dateNaissance = `${a}-${m}-${j}`;
      }
    }
  }

  // ================================
  // FALLBACK MRZ
  // ================================
  if (!infos.nom || !infos.prenom) {
    const mrz = texteClean.match(/[A-Z<]{25,}/g);

    if (mrz) {
      const parts = mrz[0]
        .replace(/</g, ' ')
        .trim()
        .split(/\s{2,}/)
        .filter(Boolean);

      if (!infos.nom && parts[0]) infos.nom = nettoyer(parts[0]);
      if (!infos.prenom && parts[1]) infos.prenom = nettoyer(parts[1]);
    }
  }

  // ================================
  // VALIDATION MINIMALE
  // ================================
  if (infos.nom && infos.nom.length < 3) infos.nom = null;
  if (infos.prenom && infos.prenom.length < 2) infos.prenom = null;

  return infos;
};

module.exports = { scannerImage };