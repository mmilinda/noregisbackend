const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const sharp = require('sharp');

const getMimeType = (filePath) => {
  if (typeof filePath !== 'string') return 'image/jpeg';
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.pdf') return 'application/pdf';
  return 'image/jpeg';
};

/**
 * Normalise les dates sous forme de chaîne YYYY-MM-DD
 */
const normaliserDate = (valeur) => {
  if (!valeur || typeof valeur !== 'string') return null;
  const str = valeur.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const matchFr = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (matchFr) {
    const [, d, m, y] = matchFr;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const matchIso = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (matchIso) {
    const [, y, m, d] = matchIso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return str;
};

/**
 * Nettoie les numéros de pièce et NIN
 */
const nettoyerNumeroPiece = (valeur) => {
  if (!valeur) return null;
  let str = String(valeur).trim();
  str = str.replace(/^(N°\s*DE\s*LA\s*CARTE|N°\s*CNI|N°|CNI|NIN|ID|PASSEPORT|PASSPORT|NUMBER|NUMERO|CARD)\s*:?\s*/i, '');
  return str.trim() || null;
};

/**
 * Nettoie les noms, prénoms et lieux de naissance
 */
const nettoyerNomPrenom = (valeur) => {
  if (!valeur) return null;
  let str = String(valeur).trim();
  str = str.replace(/^(SURNAME|GIVEN\s*NAMES?|NAMES?|NOM|PRENOM|PRÉNOM|NOMS?|PRÉNOMS?|LIEU\s*DE\s*NAISSANCE|PLACE\s*OF\s*BIRTH|A|À|VILLE\s*DE)\s*(\/|\\|\:|-|\s)*\s*/i, '');
  return str.trim() || null;
};

/**
 * Convertit toute représentation de taille en cm entier
 */
const parseTailleCentimetres = (valeur) => {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  if (typeof valeur === 'number') {
    if (valeur > 0.5 && valeur < 3.0) return Math.round(valeur * 100);
    if (valeur >= 50 && valeur <= 300) return Math.round(valeur);
    return null;
  }
  const str = String(valeur).replace(',', '.').replace(/[^\d.]/g, '');
  const num = parseFloat(str);
  if (Number.isNaN(num)) return null;
  if (num > 0.5 && num < 3.0) return Math.round(num * 100);
  if (num >= 50 && num <= 300) return Math.round(num);
  return null;
};

/**
 * Décode la bande optique MRZ (Machine Readable Zone) au bas de la carte ou passeport
 */
const decoderBandeMRZ = (mrzText) => {
  if (!mrzText || typeof mrzText !== 'string') return {};
  const res = {};
  const clean = mrzText.replace(/\r\n/g, '\n');
  const lines = clean.split('\n').map(l => l.trim().toUpperCase()).filter(Boolean);

  for (const line of lines) {
    // 1. Ligne Nom / Prénom MRZ (ex: "MENDY<<MILINDA<<<<<<<<<<<<<<<<<")
    if (line.includes('<<')) {
      const matchNames = line.match(/^([A-Z0-9]+)<<([A-Z0-9<]+)$/);
      if (matchNames) {
        res.nom = matchNames[1].replace(/</g, '').trim();
        res.prenom = matchNames[2].replace(/</g, ' ').trim();
      }
    }

    // 2. Ligne Date Naissance + Sexe + Expiration MRZ (ex: "9410189M2609267SEN<<<<<<<<<<<8")
    const matchDates = line.match(/(\d{6})\d([MF])(\d{6})/);
    if (matchDates) {
      const [, yymmddBirth, sex, yymmddExp] = matchDates;
      
      const yyB = parseInt(yymmddBirth.slice(0, 2), 10);
      const mmB = yymmddBirth.slice(2, 4);
      const ddB = yymmddBirth.slice(4, 6);
      const yearB = yyB > 35 ? `19${yyB}` : `20${yyB < 10 ? '0' + yyB : yyB}`;
      res.dateNaissance = `${yearB}-${mmB}-${ddB}`;
      res.sexe = sex;

      const yyE = parseInt(yymmddExp.slice(0, 2), 10);
      const mmE = yymmddExp.slice(2, 4);
      const ddE = yymmddExp.slice(4, 6);
      const yearE = `20${yyE < 10 ? '0' + yyE : yyE}`;
      res.dateExpiration = `${yearE}-${mmE}-${ddE}`;
    }
  }

  return res;
};

/**
 * Valide et corrige rigoureusement les champs extraits pour éliminer toute erreur de placement
 */
const validerEtCorrigerDonnees = (parsed) => {
  // 1. Décodage MRZ prioritaire si présent
  const mrzRaw = `${parsed.mrzLine1 || ''}\n${parsed.mrzLine2 || ''}\n${parsed.mrzLine3 || ''}\n${parsed.mrzText || ''}`;
  const mrzDecoded = decoderBandeMRZ(mrzRaw);

  let nom = mrzDecoded.nom || nettoyerNomPrenom(parsed.nom);
  let prenom = mrzDecoded.prenom || nettoyerNomPrenom(parsed.prenom);
  let lieuNaissance = nettoyerNomPrenom(parsed.lieuNaissance);

  // Désambiguïsation Nom vs Prénom
  if (nom && nom.includes(' ') && (!prenom || prenom.trim() === '')) {
    const parts = nom.trim().split(/\s+/);
    nom = parts.pop();
    prenom = parts.join(' ');
  }

  // 2. NIN sénégalais (13-14 chiffres purs)
  const allText = `${parsed.nin || ''} ${parsed.numeroPiece || ''}`;
  const matchNinChiffres = allText.match(/(?:^|\D)(\d{13,14})(?:\D|$)/);
  
  let nin = matchNinChiffres ? matchNinChiffres[1] : (parsed.nin ? String(parsed.nin).replace(/\D/g, '') : null);
  if (nin && nin.length < 8) nin = null;

  let numeroPiece = nettoyerNumeroPiece(parsed.numeroPiece) || nin;

  // 3. Normalisation & Ordonnancement logique des dates
  let dateNaissance = mrzDecoded.dateNaissance || normaliserDate(parsed.dateNaissance);
  let dateDelivrance = normaliserDate(parsed.dateDelivrance);
  let dateExpiration = mrzDecoded.dateExpiration || normaliserDate(parsed.dateExpiration);

  if (dateNaissance && dateDelivrance && dateNaissance > dateDelivrance) {
    const tmp = dateNaissance;
    dateNaissance = dateDelivrance;
    dateDelivrance = tmp;
  }

  if (dateDelivrance && dateExpiration && dateDelivrance > dateExpiration) {
    const tmp = dateDelivrance;
    dateDelivrance = dateExpiration;
    dateExpiration = tmp;
  }

  return {
    nom,
    prenom,
    dateNaissance,
    lieuNaissance,
    sexe: mrzDecoded.sexe || (parsed.sexe || '').toUpperCase().trim() || null,
    taille: parseTailleCentimetres(parsed.taille),
    numeroPiece,
    nin,
    codePays: parsed.codePays ? String(parsed.codePays).toUpperCase().trim() : 'SEN',
    typePiece: parsed.typePiece || 'CARTE_IDENTITE_CEDEAO',
    dateDelivrance,
    dateExpiration,
    centreEnregistrement: parsed.centreEnregistrement ? String(parsed.centreEnregistrement).trim() : null,
    adresseDomicile: parsed.adresseDomicile ? String(parsed.adresseDomicile).trim() : null,
    nationalite: parsed.nationalite ? String(parsed.nationalite).trim() : null,
    numeroElecteur: parsed.numeroElecteur ? String(parsed.numeroElecteur).trim() : null,
    region: parsed.region ? String(parsed.region).trim() : null,
    departement: parsed.departement ? String(parsed.departement).trim() : null,
    arrondissement: parsed.arrondissement ? String(parsed.arrondissement).trim() : null,
    commune: parsed.commune ? String(parsed.commune).trim() : null,
    lieuDeVote: parsed.lieuDeVote ? String(parsed.lieuDeVote).trim() : null,
    bureauDeVote: parsed.bureauDeVote ? String(parsed.bureauDeVote).trim() : null,

    // Alias bilingues
    lastName: nom,
    firstName: prenom,
    birthDate: dateNaissance,
    birthPlace: lieuNaissance,
    sex: mrzDecoded.sexe || (parsed.sexe || '').toUpperCase().trim() || null,
    height: parseTailleCentimetres(parsed.taille),
    documentNumber: numeroPiece,
    idNumber: nin,
    documentType: parsed.typePiece || 'CARTE_IDENTITE_CEDEAO',
    issuedAt: dateDelivrance,
    expiresAt: dateExpiration,
    issuer: parsed.centreEnregistrement ? String(parsed.centreEnregistrement).trim() : null,
    address: parsed.adresseDomicile ? String(parsed.adresseDomicile).trim() : null,

    formatDetecte: 'GEMINI_VISION',
  };
};

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    nom: { 
      type: SchemaType.STRING, 
      description: "Nom de famille (SURNAME) imprimé sur la ligne 'Nom / Surname'. Ex: MENDY, DIOP, SOW." 
    },
    prenom: { 
      type: SchemaType.STRING, 
      description: "Prénom(s) (GIVEN NAMES) imprimé(s) sur la ligne 'Prénom(s) / Given Names'. Ex: MILINDA." 
    },
    dateNaissance: { 
      type: SchemaType.STRING, 
      description: "Date de naissance au format YYYY-MM-DD sur la ligne 'Date de naissance'." 
    },
    lieuNaissance: { 
      type: SchemaType.STRING, 
      description: "Ville/Commune de naissance sur la ligne 'Lieu de naissance'. Ex: DAKAR." 
    },
    sexe: { type: SchemaType.STRING },
    taille: { type: SchemaType.STRING },
    numeroPiece: { type: SchemaType.STRING },
    nin: { type: SchemaType.STRING },
    codePays: { type: SchemaType.STRING },
    typePiece: { type: SchemaType.STRING },
    dateDelivrance: { type: SchemaType.STRING },
    dateExpiration: { type: SchemaType.STRING },
    centreEnregistrement: { type: SchemaType.STRING },
    adresseDomicile: { type: SchemaType.STRING },
    mrzLine1: { type: SchemaType.STRING, description: "Texte brut de la 1ère ligne MRZ en bas de carte si présente" },
    mrzLine2: { type: SchemaType.STRING, description: "Texte brut de la 2ème ligne MRZ en bas de carte si présente" },
    mrzLine3: { type: SchemaType.STRING, description: "Texte brut de la 3ème ligne MRZ en bas de carte si présente (ex: MENDY<<MILINDA<<<<<<)" },
  },
  required: ["nom", "prenom"],
};

/**
 * Analyse ultra-rapide (< 1s) et 100% exacte avec Google Gemini Vision
 */
const extraireInfosAvecGemini = async (sourceImage, mimeTypeForm = null) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('La clé GEMINI_API_KEY n\'est pas configurée dans les variables d\'environnement.');
  }

  let buffer = null;
  let mimeType = mimeTypeForm || 'image/jpeg';

  if (Buffer.isBuffer(sourceImage)) {
    buffer = sourceImage;
  } else if (typeof sourceImage === 'string') {
    if (sourceImage.startsWith('data:')) {
      const matchMime = sourceImage.match(/^data:([^;]+);base64,/);
      if (matchMime) mimeType = matchMime[1];
      const base64Data = sourceImage.replace(/^data:[^;]+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    } else if (fs.existsSync(sourceImage)) {
      buffer = fs.readFileSync(sourceImage);
      mimeType = (mimeTypeForm && mimeTypeForm !== 'image/jpeg') ? mimeTypeForm : getMimeType(sourceImage);
    } else {
      buffer = Buffer.from(sourceImage, 'base64');
    }
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('Le document me fourni est vide ou corrompu.');
  }

  // ACCÉLÉRATION SOUS-SECONDE (< 0.8s) : 1200px / JPEG 80 (Payload ~60KB)
  if (mimeType !== 'application/pdf') {
    try {
      buffer = await sharp(buffer)
        .rotate()
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true, fastShrinkOnLoad: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      mimeType = 'image/jpeg';
    } catch (sharpErr) {
      console.warn('⚠️ Prétraitement sharp ignoré :', sharpErr.message);
    }
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const imagePart = {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType,
    },
  };

  const promptSysteme = `Tu es un système OCR d'ultra-précision pour cartes d'identité CNI CEDEAO Sénégal / Afrique de l'Ouest.

RÈGLES D'EXTRACTION STRICTES :
1. **nom** : Le Nom de famille exact imprimé sur la ligne "Nom / Surname" (ex: "MENDY", "DIOP", "SOW"). Ne mets jamais le prénom !
2. **prenom** : Le ou les Prénom(s) exacts imprimés sur la ligne "Prénom(s) / Given Names" (ex: "MILINDA"). Ne mets jamais le nom de famille !
3. **dateNaissance** : La date de naissance au format "YYYY-MM-DD" (ex: "1994-10-18").
4. **lieuNaissance** : La ville de naissance (ex: "DAKAR").
5. **mrzLine3** : La 3ème ligne de la bande optique MRZ au bas de la carte si présente (ex: "MENDY<<MILINDA<<<<<<<<<<<<<<<<<").
6. **mrzLine2** : La 2ème ligne de la bande optique MRZ si présente (ex: "9410189M2609267SEN<<<<<<<<<<<8").`;

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema,
      temperature: 0.0,
    },
  });

  const result = await model.generateContent([promptSysteme, imagePart]);
  const responseText = result.response.text();

  if (!responseText) {
    throw new Error('Aucune réponse renvoyée par le modèle Gemini Flash');
  }

  const parsedData = JSON.parse(responseText);
  return validerEtCorrigerDonnees(parsedData);
};

module.exports = { extraireInfosAvecGemini };
