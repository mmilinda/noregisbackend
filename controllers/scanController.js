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
  // Format JJ/MM/AAAA ou JJ-MM-AAAA
  const d1 = texte.match(/\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/);
  if (d1) {
    const j = +d1[1], m = +d1[2], a = +d1[3];
    if (j >= 1 && j <= 31 && m >= 1 && m <= 12 && a >= 1900 && a <= 2100)
      return `${d1[3]}-${d1[2]}-${d1[1]}`;
  }
  // Format compact JJMMAAAA
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

/* ── Extraction principale ──────────────────────────────────────────────── */

const BLACKLIST = new Set([
  'REPUBLIQUE','FRANCAISE','FRANÇAISE','SENEGAL','SÉNÉGAL','CARTE','NATIONALE',
  'IDENTITE','IDENTITÉ','DOCUMENT','PASSEPORT','NOM','SEXE','NATIONALITE',
  'NATIONALITÉ','CEDEAO','ECOWAS','IDENTITY','CARD','BILHETE','IDENTIDADE',
  'OWAS','TAILLE','LIEU','NAISSANCE','DELIVRANCE','EXPIRATION','CENTRE',
  'ENREGISTREMENT','DOMICILE','ADRESSE','DATE','PRENOM','PRENOMS','COMMUNE',
  'REBEUSS','MADIABEL','KEUR','COMM','BIRTH','SURNAME','GIVEN','FORENAME',
  'NAMES','TYPE','PIECE','NUMERO','NUMÉRO','SENEGALAN','SÉNÉGALAISE',
]);

const isValidNom = (s) => {
  if (!s) return false;
  const up = s.toUpperCase().trim();
  if (BLACKLIST.has(up)) return false;
  if (up.length < 2 || up.length > 20) return false;
  if (/\d/.test(up)) return false;
  return true;
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
  const infos = {
    nom: null, prenom: null, numeroPiece: null,
    typePiece: 'CNI', dateNaissance: null,
  };

  // ── Nettoyage global ──────────────────────────────────────────────────────
  const texteClean = texte
    .replace(/\|/g, 'I')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/0(?=[A-Z])/g, 'O'); // 0 → O devant lettre

  const lignes = texteClean.split('\n').map(l => l.trim()).filter(Boolean);
  const upper  = texteClean.toUpperCase();

  // ── Type de pièce ─────────────────────────────────────────────────────────
  if (upper.includes('PASSEPORT'))                                          infos.typePiece = 'PASSEPORT';
  else if (upper.includes('PERMIS DE CONDUIRE'))                            infos.typePiece = 'PERMIS';
  else if (upper.includes("CARTE D'IDENTITE") || upper.includes('CARTE NATIONALE')
        || upper.includes('CEDEAO') || upper.includes('ECOWAS')
        || upper.includes('IDENTITY CARD') || upper.includes('CNI'))        infos.typePiece = 'CNI';
  else if (upper.includes('SEJOUR'))                                        infos.typePiece = 'CARTE_SEJOUR';

  // ── Date de naissance ─────────────────────────────────────────────────────
  for (let i = 0; i < lignes.length; i++) {
    if (/date\s*de\s*naiss|date\s*of\s*birth/i.test(lignes[i])) {
      // Cherche une date sur la même ligne
      const meme = lignes[i].match(/\b(\d{2})[\/\-](\d{2})[\/\-](\d{4})\b/);
      if (meme) { infos.dateNaissance = `${meme[3]}-${meme[2]}-${meme[1]}`; break; }
      // Ou sur les lignes suivantes
      for (let j = 1; j <= 3; j++) {
        const d = extraireDate(lignes[i + j] || '');
        if (d) { infos.dateNaissance = d; break; }
      }
      if (infos.dateNaissance) break;
    }
  }
  if (!infos.dateNaissance) infos.dateNaissance = extraireDate(texteClean);

  // ── PRÉNOM : stratégie stricte label → ligne suivante ────────────────────
  // Stratégie 1 : label seul sur une ligne, valeur en dessous
  for (let i = 0; i < lignes.length; i++) {
    if (/^Pr[ée]noms?\s*[:\-]?\s*$/i.test(lignes[i])) {
      for (let j = 1; j <= 3; j++) {
        let l = (lignes[i + j] || '').trim();
        // Ignore les lignes qui ressemblent à des labels
        if (/^(Nom|Date|Sexe|Taille|Lieu|N°|Carte)/i.test(l)) continue;
        l = l.replace(/^[^A-ZÀ-ÿa-zà-ÿ]+/, '').replace(/\d/g, '').replace(/[-–—]+/g, ' ').trim();
        if (l.length >= 2) { infos.prenom = nettoyer(l); break; }
      }
      if (infos.prenom) break;
    }
  }

  // Stratégie 2 : label + valeur sur la même ligne
  if (!infos.prenom) {
    for (const l of lignes) {
      const m = l.match(/Pr[ée]noms?\s*[:\-]\s*(.+)/i);
      if (m && m[1].trim().length >= 2) {
        const val = nettoyer(m[1]);
        if (val && isValidNom(val)) { infos.prenom = val; break; }
      }
    }
  }

  // Stratégie 3 : label sur une ligne, valeur tout en majuscules en dessous
  if (!infos.prenom) {
    for (let i = 0; i < lignes.length; i++) {
      if (/Pr[ée]noms?|Given|Forename/i.test(lignes[i])) {
        for (let j = 1; j <= 4; j++) {
          const l = (lignes[i + j] || '').trim();
          if (!l || /^(Nom|Date|Sexe|N°|Carte)/i.test(l)) continue;
          const mots = l.match(/\b[A-ZÀ-Ÿ]{2,}\b/g);
          if (mots) {
            const valide = mots.filter(m => isValidNom(m));
            if (valide.length > 0) { infos.prenom = nettoyer(valide.join(' ')); break; }
          }
        }
        if (infos.prenom) break;
      }
    }
  }

  // ── NOM : idem, label → ligne suivante ───────────────────────────────────
  // Stratégie 1 : label seul "Nom" suivi de la valeur
  for (let i = 0; i < lignes.length; i++) {
    // Le label "Nom" seul (pas "Nom de..." ou "Nommer")
    if (/^Nom\s*[:\-]?\s*$/i.test(lignes[i])) {
      for (let j = 1; j <= 3; j++) {
        const l = (lignes[i + j] || '').trim();
        if (!l || /^(Pr[ée]nom|Date|Sexe|N°)/i.test(l)) continue;
        const mots = l.match(/\b[A-ZÀ-Ÿ]{2,}\b/g);
        if (mots) {
          const valide = mots.filter(m => isValidNom(m));
          if (valide.length > 0) { infos.nom = nettoyer(valide[0]); break; }
        }
      }
      if (infos.nom) break;
    }
  }

  // Stratégie 2 : "Nom : VALEUR" sur la même ligne
  if (!infos.nom) {
    for (const l of lignes) {
      const m = l.match(/^Nom\s*[:\-]\s*([A-ZÀ-Ÿa-zà-ÿ\-\s]+)/i);
      if (m) {
        const val = nettoyer(m[1]);
        if (val && isValidNom(val)) { infos.nom = val; break; }
      }
    }
  }

  // Stratégie 3 : fallback — mots entièrement en majuscules après le prénom trouvé
  if (!infos.nom && infos.prenom) {
    const prenomPos = texteClean.toUpperCase().indexOf(infos.prenom.toUpperCase());
    if (prenomPos !== -1) {
      const apres = texteClean.slice(prenomPos + infos.prenom.length);
      const candidats = apres.match(/\b[A-ZÀ-Ÿ]{2,}\b/g) || [];
      const val = candidats.find(c => isValidNom(c) && c !== infos.prenom.toUpperCase());
      if (val) infos.nom = nettoyer(val);
    }
  }

  // ── Numéro de pièce ───────────────────────────────────────────────────────
  // CNI sénégalaise : "1 06 19941018 00015 4" → on joint tous les chiffres
  for (let i = 0; i < lignes.length; i++) {
    if (/N[°º\.]\s*de\s*la\s*carte|carte\s*d.identit/i.test(lignes[i])) {
      // Sur la même ligne
      const meme = lignes[i].match(/[\d\s]{6,}/);
      if (meme) {
        const code = meme[0].replace(/\s+/g, '');
        if (code.length >= 6) { infos.numeroPiece = code; break; }
      }
      // Sur les lignes suivantes
      for (let j = 1; j <= 4; j++) {
        const l = (lignes[i + j] || '');
        // Capture une séquence de chiffres et espaces d'au moins 6 chiffres
        const m = l.match(/[\d][\d\s]{5,}/);
        if (m) {
          const code = m[0].replace(/\s+/g, '');
          if (code.length >= 6) { infos.numeroPiece = code; break; }
        }
      }
      if (infos.numeroPiece) break;
    }
  }

  // Fallback : cherche "N° du document" ou "Document No"
  if (!infos.numeroPiece) {
    for (let i = 0; i < lignes.length; i++) {
      if (/N[°º]\s*DU\s*DOCUMENT|Document\s*No/i.test(lignes[i])) {
        for (let j = 0; j <= 4; j++) {
          const l = lignes[i + j] || '';
          const m = (l.match(/\b([A-Z0-9]{6,15})\b/g) || [])
            .find(c => /[A-Z]/.test(c) && /[0-9]/.test(c));
          if (m) { infos.numeroPiece = m; break; }
        }
        if (infos.numeroPiece) break;
      }
    }
  }

  // Fallback final : motif alphanumérique générique
  if (!infos.numeroPiece) {
    const m = texteClean.match(/\b([A-Z][A-Z0-9]{5,14})\b/g);
    if (m) infos.numeroPiece = m.find(c => /[A-Z]/.test(c) && /[0-9]/.test(c)) || null;
  }

  // ── MRZ fallback pour nom/prénom ──────────────────────────────────────────
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