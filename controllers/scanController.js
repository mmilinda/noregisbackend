const Tesseract = require('tesseract.js');
const { Document } = require('../models');

// ─────────────────────────────────────────────
//  Utilitaires de nettoyage
// ─────────────────────────────────────────────

/** Supprime uniquement les caractères parasites OCR, préserve accents, tirets, espaces */
const nettoyerNom = (str) => {
  if (!str) return null;
  return str
    .replace(/["""«»|]/g, '')
    .replace(/[^a-zA-ZÀ-ÿ\-\s']/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || null;
};

/** Préserve les majuscules exactes telles qu'elles figurent sur la pièce */
const nettoyerPrenom = (str) => {
  if (!str) return null;
  return str
    .replace(/["""«»|]/g, '')
    .replace(/[^a-zA-ZÀ-ÿ\-\s']/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || null;
};

// ─────────────────────────────────────────────
//  Extraction de date
// ─────────────────────────────────────────────

const extraireDate = (texte) => {
  if (!texte) return null;

  // Format DD/MM/YYYY ou DD-MM-YYYY
  const d1 = texte.match(/\b(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})\b/);
  if (d1) {
    const [, j, m, a] = d1.map((v, i) => i === 0 ? v : +v);
    if (j >= 1 && j <= 31 && m >= 1 && m <= 12 && a >= 1900 && a <= 2100)
      return `${String(a).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(j).padStart(2,'0')}`;
  }

  // Format YYYY-MM-DD (ISO)
  const d2 = texte.match(/\b(\d{4})[\/\-\.](\d{2})[\/\-\.](\d{2})\b/);
  if (d2) {
    const a = +d2[1], m = +d2[2], j = +d2[3];
    if (j >= 1 && j <= 31 && m >= 1 && m <= 12 && a >= 1900 && a <= 2100)
      return `${d2[1]}-${d2[2]}-${d2[3]}`;
  }

  // 8 chiffres collés : DDMMYYYY
  const numStr = texte.replace(/[^0-9]/g, '');
  const m8 = numStr.match(/\b(\d{8})\b/) || numStr.match(/(\d{8})/);
  if (m8) {
    const v = m8[1];
    const j = +v.slice(0,2), mo = +v.slice(2,4), a = +v.slice(4,8);
    if (j >= 1 && j <= 31 && mo >= 1 && mo <= 12 && a >= 1900 && a <= 2100)
      return `${v.slice(4,8)}-${v.slice(2,4)}-${v.slice(0,2)}`;
  }

  return null;
};

// ─────────────────────────────────────────────
//  MRZ – zone lisible machine (source la plus fiable)
// ─────────────────────────────────────────────

/**
 * Calcule le chiffre de contrôle MRZ sur une chaîne.
 * Permet de valider les champs extraits.
 */
const checkDigitMRZ = (str) => {
  const weights = [7, 3, 1];
  const table = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let total = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const val = c === '<' ? 0 : table.indexOf(c);
    if (val === -1) return null; // caractère invalide
    total += val * weights[i % 3];
  }
  return total % 10;
};

/**
 * Décode la MRZ complète et retourne les champs tels qu'ils figurent sur la pièce.
 * Supporte TD1 (3 lignes × 30), TD2 (2 lignes × 36), TD3/passeport (2 lignes × 44).
 */
const decoderMRZ = (lignes) => {
  const result = {};

  // Nettoyage : on garde uniquement les lignes qui ressemblent à une MRZ
  const mrzBrutes = lignes.filter(l => /^[A-Z0-9<]{20,}$/.test(l.replace(/\s/g, '')));
  if (mrzBrutes.length < 2) return result;

  const mrz = mrzBrutes.map(l => l.replace(/\s/g, '').replace(/O/g, '0'));

  // ── TD3 / Passeport (2 × 44) ──
  if (mrz[0].length === 44 && mrz[1]?.length === 44) {
    const l1 = mrz[0];
    const l2 = mrz[1];

    // Type de document
    result.typePiece = l1[0] === 'P' ? 'PASSEPORT' : 'CNI';

    // Pays émetteur (ex: SEN, FRA)
    result.pays = l1.slice(2, 5).replace(/<+$/, '');

    // Noms (séparés par <<)
    const nomPart = l1.slice(5).split('<<');
    result.nom    = nomPart[0]?.replace(/</g, ' ').replace(/\s+/g, ' ').trim() || null;
    result.prenom = nomPart[1]?.replace(/</g, ' ').replace(/\s+/g, ' ').trim() || null;

    // Numéro de document
    const numDoc = l2.slice(0, 9);
    result.numeroPiece = numDoc.replace(/<+$/, '');

    // Date de naissance (YYMMDD)
    const dob = l2.slice(13, 19);
    if (/^\d{6}$/.test(dob)) {
      const yy = +dob.slice(0,2);
      const mm = dob.slice(2,4);
      const dd = dob.slice(4,6);
      const yyyy = yy > 30 ? `19${String(yy).padStart(2,'0')}` : `20${String(yy).padStart(2,'0')}`;
      result.dateNaissance = `${yyyy}-${mm}-${dd}`;
    }

    return result;
  }

  // ── TD1 / CNI (3 × 30) ──
  if (mrz[0].length === 30 && mrz[1]?.length === 30 && mrz[2]?.length === 30) {
    const l1 = mrz[0];
    const l2 = mrz[1];
    const l3 = mrz[2];

    result.typePiece = l1[0] === 'I' ? 'CNI' : l1[0] === 'A' ? 'CNI' : 'CNI';

    result.numeroPiece = l1.slice(5, 14).replace(/<+$/, '');

    const dob = l2.slice(0, 6);
    if (/^\d{6}$/.test(dob)) {
      const yy = +dob.slice(0,2);
      const mm = dob.slice(2,4);
      const dd = dob.slice(4,6);
      const yyyy = yy > 30 ? `19${String(yy).padStart(2,'0')}` : `20${String(yy).padStart(2,'0')}`;
      result.dateNaissance = `${yyyy}-${mm}-${dd}`;
    }

    const nomPart = l3.split('<<');
    result.nom    = nomPart[0]?.replace(/</g, ' ').replace(/\s+/g, ' ').trim() || null;
    result.prenom = nomPart[1]?.replace(/</g, ' ').replace(/\s+/g, ' ').trim() || null;

    return result;
  }

  // ── TD2 (2 × 36) ──
  if (mrz[0].length === 36 && mrz[1]?.length === 36) {
    const l1 = mrz[0];
    const l2 = mrz[1];

    result.typePiece = 'CNI';
    result.numeroPiece = l2.slice(0, 9).replace(/<+$/, '');

    const dob = l2.slice(13, 19);
    if (/^\d{6}$/.test(dob)) {
      const yy = +dob.slice(0,2);
      const mm = dob.slice(2,4);
      const dd = dob.slice(4,6);
      const yyyy = yy > 30 ? `19${String(yy).padStart(2,'0')}` : `20${String(yy).padStart(2,'0')}`;
      result.dateNaissance = `${yyyy}-${mm}-${dd}`;
    }

    const nomPart = l1.slice(5).split('<<');
    result.nom    = nomPart[0]?.replace(/</g, ' ').replace(/\s+/g, ' ').trim() || null;
    result.prenom = nomPart[1]?.replace(/</g, ' ').replace(/\s+/g, ' ').trim() || null;

    return result;
  }

  return result;
};

// ─────────────────────────────────────────────
//  Extraction à partir des labels textuels
// ─────────────────────────────────────────────

/** Retourne la valeur qui suit immédiatement un label (même ligne ou lignes suivantes) */
const valeurApresLabel = (lignes, regex, maxLignes = 4) => {
  for (let i = 0; i < lignes.length; i++) {
    if (!regex.test(lignes[i])) continue;

    // 1. Le label et la valeur sont sur la même ligne : "Nom : DIALLO"
    const memeLigne = lignes[i].replace(regex, '').replace(/^[\s:\-\/]+/, '').trim();
    if (memeLigne.length > 1) return memeLigne;

    // 2. La valeur est sur les lignes suivantes
    for (let j = 1; j <= maxLignes; j++) {
      const l = (lignes[i + j] || '').trim();
      if (!l || l.length < 2) continue;
      // Ignorer si c'est un autre label
      if (/^(Nom|Prénom|Prenom|Date|Né|Ne|Nationalité|Sexe|N°|Numéro|Lieu|Délivré|Expire|Valable)/i.test(l)) break;
      return l;
    }
  }
  return null;
};

// ─────────────────────────────────────────────
//  Extraction principale
// ─────────────────────────────────────────────

const BLACKLIST = new Set([
  'REPUBLIQUE','REPUBLIC','FRANÇAISE','FRANCAISE','SENEGAL','SÉNÉGAL',
  'CARTE','NATIONALE','IDENTITE','IDENTITÉ','IDENTITY','DOCUMENT',
  'PASSEPORT','PASSPORT','NOM','SURNAME','SEXE','SEX','NATIONALITE',
  'NATIONALITÉ','NATIONALITY','CEDEAO','ECOWAS','CARD','PERMIS',
  'CONDUIRE','DRIVING','LICENCE','LICENSE','SEJOUR',
]);

const extraireInfosPiece = (texteRaw) => {
  const infos = {
    nom:           null,
    prenom:        null,
    numeroPiece:   null,
    typePiece:     'CNI',
    dateNaissance: null,
  };

  // ── Normalisation de base ──
  const texte  = texteRaw.replace(/\|/g, 'I').replace(/[\u2018\u2019]/g, "'").replace(/\u00B0/g, '°');
  const upper  = texte.toUpperCase();
  const lignes = texte.split('\n').map(l => l.trim()).filter(Boolean);

  // ── 1. Détection du type de pièce ──
  if (upper.includes('PASSEPORT') || upper.includes('PASSPORT'))
    infos.typePiece = 'PASSEPORT';
  else if (/PERMIS\s+DE\s+CONDUIRE|DRIVING\s+LICENCE/i.test(upper))
    infos.typePiece = 'PERMIS';
  else if (/CARTE\s+(NATIONALE\s+D|D.IDENTIT|RESIDENT)|CNI|CEDEAO|ECOWAS/i.test(upper))
    infos.typePiece = 'CNI';
  else if (/SEJOUR|RÉSIDENCE/i.test(upper))
    infos.typePiece = 'CARTE_SEJOUR';

  // ── 2. MRZ (source prioritaire — données certifiées sur la pièce) ──
  const mrzData = decoderMRZ(lignes);

  if (mrzData.nom)           infos.nom           = mrzData.nom;
  if (mrzData.prenom)        infos.prenom        = mrzData.prenom;
  if (mrzData.numeroPiece)   infos.numeroPiece   = mrzData.numeroPiece;
  if (mrzData.dateNaissance) infos.dateNaissance = mrzData.dateNaissance;
  if (mrzData.typePiece)     infos.typePiece     = mrzData.typePiece;

  // ── 3. Extraction par labels textuels (complète ou corrige la MRZ) ──

  // --- NOM ---
  if (!infos.nom) {
    const labels = [
      /^Nom\s*(de\s*famille)?\s*[:\-\/]?\s*/i,
      /^Surname\s*[:\-\/]?\s*/i,
      /^Last\s*name\s*[:\-\/]?\s*/i,
    ];
    for (const lbl of labels) {
      const val = valeurApresLabel(lignes, lbl);
      if (val) {
        // On prend uniquement la portion en majuscules (comme figurant sur la pièce)
        const m = val.match(/([A-ZÉÈÀÙÂÊÎÔÛÇÑ][A-ZÉÈÀÙÂÊÎÔÛÇÑa-zéèàùâêîôûçñ\-\s']+)/);
        const candidat = m ? m[1].trim() : val.trim();
        if (candidat.length >= 2 && !BLACKLIST.has(candidat.toUpperCase())) {
          infos.nom = nettoyerNom(candidat);
          break;
        }
      }
    }
  }

  // --- PRÉNOM(S) ---
  if (!infos.prenom) {
    const labels = [
      /^Pr[ée]noms?\s*[:\-\/]?\s*/i,
      /^Given\s*names?\s*[:\-\/]?\s*/i,
      /^Forenames?\s*[:\-\/]?\s*/i,
      /^First\s*name\s*[:\-\/]?\s*/i,
    ];
    for (const lbl of labels) {
      const val = valeurApresLabel(lignes, lbl);
      if (val) {
        const candidat = val.replace(/[0-9]/g, '').replace(/[-–—]+/g, '-').trim();
        if (candidat.length >= 2) {
          infos.prenom = nettoyerPrenom(candidat);
          break;
        }
      }
    }
  }

  // --- DATE DE NAISSANCE ---
  if (!infos.dateNaissance) {
    const labelsDOB = [
      /date\s*de\s*naiss(ance)?\s*[:\-\/]?/i,
      /date\s*of\s*birth\s*[:\-\/]?/i,
      /n[eé]\s*(le)?\s*[:\-\/]?/i,
      /dob\s*[:\-\/]?/i,
    ];
    for (const lbl of labelsDOB) {
      const val = valeurApresLabel(lignes, lbl, 3);
      if (val) {
        const d = extraireDate(val);
        if (d) { infos.dateNaissance = d; break; }
      }
    }
  }
  // Dernier recours : chercher une date n'importe où dans le texte
  if (!infos.dateNaissance) infos.dateNaissance = extraireDate(texte);

  // --- NUMÉRO DE PIÈCE ---
  if (!infos.numeroPiece) {
    const labelsNum = [
      /n[°º]\s*(de\s*(la\s*)?carte|du\s*document|de\s*la\s*pi[eè]ce)\s*[:\-\/]?/i,
      /document\s*no\.?\s*[:\-\/]?/i,
      /n[°º]\s*[:\-\/]?\s*/i,
      /numéro\s*[:\-\/]?\s*/i,
    ];
    for (const lbl of labelsNum) {
      const val = valeurApresLabel(lignes, lbl, 3);
      if (val) {
        // Un numéro de pièce contient toujours au moins un chiffre et au moins 6 caractères
        const m = val.match(/\b([A-Z0-9]{6,20})\b/);
        if (m && /[0-9]/.test(m[1])) {
          infos.numeroPiece = m[1];
          break;
        }
      }
    }
  }

  // Recherche globale du numéro de pièce si toujours absent
  if (!infos.numeroPiece) {
    // Cherche un code alphanumérique standalone (ex: B1234567, 1234567890)
    const candidats = (texte.match(/\b([A-Z]{0,3}[0-9]{6,15}[A-Z0-9]{0,3})\b/g) || []);
    for (const c of candidats) {
      if (/[0-9]{6,}/.test(c) && !['CEDEAO','ECOWAS'].includes(c)) {
        infos.numeroPiece = c;
        break;
      }
    }
  }

  // ── 4. Nettoyage final & cohérence ──

  // Capitalisation fidèle au document : TOUT EN MAJUSCULES sur la plupart des pièces
  if (infos.nom)    infos.nom    = nettoyerNom(infos.nom);
  if (infos.prenom) infos.prenom = nettoyerPrenom(infos.prenom);

  // Supprimer le nom de la valeur du prénom si l'OCR les a fusionnés
  if (infos.nom && infos.prenom && infos.prenom.toUpperCase().startsWith(infos.nom.toUpperCase())) {
    infos.prenom = nettoyerPrenom(infos.prenom.slice(infos.nom.length).trim()) || infos.prenom;
  }

  return infos;
};

// ─────────────────────────────────────────────
//  Contrôleur principal
// ─────────────────────────────────────────────

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
      {
        logger: () => {},
        // PSM 3 = Fully automatic (meilleur pour les pièces d'identité qui mélangent
        // zones de texte libre et MRZ).  PSM 6 reste en fallback si vous connaissez
        // la mise en page exacte.
        tessedit_pageseg_mode: 3,
      }
    );

    console.log('📄 OCR RAW:\n', text);

    const infosExtraites = extraireInfosPiece(text);

    console.log('✅ Infos extraites:', infosExtraites);

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
    console.error('❌ Erreur scanner:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { scannerImage };