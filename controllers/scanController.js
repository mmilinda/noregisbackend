const Tesseract  = require('tesseract.js');
const { Document } = require('../models');

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

    const { data: { text } } = await Tesseract.recognize(
      cheminFichier,
      'fra+eng',
      { logger: () => {}, tessedit_pageseg_mode: 6 }
    );

    console.log('📄 OCR RAW:\n', text);

    const infosExtraites = extraireInfosPiece(text);

    // ── Envoi temps réel → formulaire frontend via Socket.io ──
    const io = req.app.get('io');
    if (io) {
      io.emit('ocr:donnees', {
        infosExtraites,
        nomFichier: document.nomFichier,
      });
    }

    return res.json({
      success: true,
      message: 'Scan terminé.',
      document: { id: document._id, nomFichier: document.nomFichier },
      infosExtraites,
      texteRaw: text,
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

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
  const chiffres = texte.replace(/[^0-9]/g, ' ');
  const all = chiffres.match(/\b\d{8}\b/g);
  if (all) {
    const valid = all.find(v => {
      const j = +v.slice(0,2), m = +v.slice(2,4), a = +v.slice(4,8);
      return j >= 1 && j <= 31 && m >= 1 && m <= 12 && a >= 1900 && a <= 2100;
    });
    if (valid) return `${valid.slice(4,8)}-${valid.slice(2,4)}-${valid.slice(0,2)}`;
  }
  return null;
};

const valeurApresLabel = (lignes, regex, maxLignes = 3) => {
  for (let i = 0; i < lignes.length; i++) {
    if (regex.test(lignes[i])) {
      for (let j = 1; j <= maxLignes; j++) {
        const l = (lignes[i + j] || '').trim();
        if (l && l.length > 1) return l;
      }
    }
  }
  return null;
};

const extraireInfosPiece = (texte) => {
  const infos = { nom: null, prenom: null, numeroPiece: null, typePiece: 'CNI', dateNaissance: null };
  const lignes = texte.split('\n').map(l => l.trim()).filter(Boolean);
  const upper  = texte.toUpperCase();

  if (upper.includes('PASSEPORT')) infos.typePiece = 'PASSEPORT';
  else if (upper.includes('PERMIS DE CONDUIRE')) infos.typePiece = 'PERMIS';
  else if (upper.includes("CARTE D'IDENTITE") || upper.includes('CARTE NATIONALE') || upper.includes('CEDEAO') || upper.includes('CNI')) infos.typePiece = 'CNI';
  else if (upper.includes('SEJOUR')) infos.typePiece = 'CARTE_SEJOUR';

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
  if (!infos.dateNaissance) infos.dateNaissance = extraireDate(texte);

  const texteClean  = texte.replace(/\|/g, 'I').replace(/[\u2018\u2019]/g, "'");
  const lignesClean = texteClean.split('\n').map(l => l.trim()).filter(Boolean);

  const blacklist = new Set(['REPUBLIQUE','FRANCAISE','FRANÇAISE','SENEGAL','SÉNÉGAL','CARTE','NATIONALE','IDENTITE','IDENTITÉ','DOCUMENT','PASSEPORT','NOM','SEXE','NATIONALITE','NATIONALITÉ','CEDEAO','ECOWAS','IDENTITY','CARD']);

  const nomLabel = valeurApresLabel(lignesClean, /^(Nom|Surname|Last\s*name)\s*[:\-]?\s*$/i);
  if (nomLabel) {
    const c = nomLabel.match(/\b[A-ZÉÈÀÙÂÊÎÔÛÇÑ]{2,}\b/);
    if (c && !blacklist.has(c[0])) infos.nom = nettoyer(c[0]);
  }
  if (!infos.nom) {
    for (const l of lignesClean) {
      const m = l.match(/^Nom\s*[:\-]?\s*([A-ZÉÈÀÙÂÊÎÔÛÇ]{2,})/i);
      if (m && !blacklist.has(m[1].toUpperCase())) { infos.nom = nettoyer(m[1]); break; }
    }
  }
  if (!infos.nom) {
    const candidats = texteClean.match(/\b[A-ZÉÈÀÙÂÊÎÔÛÇ]{3,}\b/g) || [];
    let best = null, scoreMax = -999;
    candidats.forEach(c => {
      if (blacklist.has(c.toUpperCase())) return;
      let score = 0;
      if (c.length >= 3 && c.length <= 15) score += 5;
      const pos    = texteClean.indexOf(c);
      const posNom = texteClean.search(/\bNom\b/i);
      if (posNom !== -1 && pos > posNom && pos < posNom + 100) score += 10;
      if (score > scoreMax) { scoreMax = score; best = c; }
    });
    if (best) infos.nom = nettoyer(best);
  }

  const prenomLabel = valeurApresLabel(lignesClean, /^(Pr[ée]noms?|Given\s*names?|Forename)\s*[:\-]?\s*$/i);
  if (prenomLabel) infos.prenom = nettoyer(prenomLabel);
  if (!infos.prenom) {
    for (const l of lignesClean) {
      const m = l.match(/Pr[ée]noms?\s*[:\-]?\s*(.+)/i);
      if (m) { infos.prenom = nettoyer(m[1]); break; }
    }
  }
  if (!infos.prenom) {
    for (let i = 0; i < lignesClean.length; i++) {
      if (/Pr[ée]noms?|Given/i.test(lignesClean[i])) {
        for (let j = 1; j <= 3; j++) {
          let l = lignesClean[i + j];
          if (!l) continue;
          l = l.replace(/^[^A-ZÀ-ÿ]+/,'').replace(/[0-9]/g,'').replace(/[-–—]+/g,' ').replace(/,/g,' ').trim();
          const m = l.match(/[A-ZÀ-ÿ][a-zà-ÿ]+(?:[\s\-][A-ZÀ-ÿ][a-zà-ÿ]+)*/g);
          if (m && m.join(' ').length > 2) { infos.prenom = nettoyer(m.join(' ')); break; }
        }
      }
      if (infos.prenom) break;
    }
  }

  for (let i = 0; i < lignesClean.length; i++) {
    if (/N[°º]\s*de\s*la\s*carte|carte\s*d.identit/i.test(lignesClean[i])) {
      const meme = lignesClean[i].match(/\b([A-Z0-9\s]{6,25})\b/g);
      if (meme) {
        const code = meme.find(c => /\d/.test(c) && c.trim().length >= 6);
        if (code) { infos.numeroPiece = code.replace(/\s+/g,''); break; }
      }
      for (let j = 1; j <= 3; j++) {
        const l = lignesClean[i + j] || '';
        const m = l.match(/[\d\s]{6,25}/);
        if (m) { infos.numeroPiece = m[0].replace(/\s+/g,''); break; }
      }
      if (infos.numeroPiece) break;
    }
  }
  if (!infos.numeroPiece) {
    for (let i = 0; i < lignesClean.length; i++) {
      if (/N[°º]\s*DU\s*DOCUMENT|Document\s*No/i.test(lignesClean[i])) {
        for (let j = 0; j <= 4; j++) {
          const l = lignesClean[i + j] || '';
          const m = l.match(/\b([A-Z0-9]{6,15})\b/g);
          if (m) {
            const code = m.find(c => /[A-Z]/.test(c) && /[0-9]/.test(c));
            if (code) { infos.numeroPiece = code; break; }
          }
        }
        if (infos.numeroPiece) break;
      }
    }
  }
  if (!infos.numeroPiece) {
    const m = texteClean.match(/\b([A-Z][A-Z0-9]{6,14})\b/g);
    if (m) infos.numeroPiece = m.find(c => /[A-Z]/.test(c) && /[0-9]/.test(c));
  }

  if (!infos.nom || !infos.prenom) {
    const mrz = texteClean.match(/[A-Z<]{25,}/g);
    if (mrz) {
      const parts = mrz[0].replace(/</g,' ').split(/\s+/).filter(Boolean);
      if (!infos.nom)    infos.nom    = nettoyer(parts[0]);
      if (!infos.prenom) infos.prenom = nettoyer(parts[1]);
    }
  }

  return infos;
};

module.exports = { scannerImage };
