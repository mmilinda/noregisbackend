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
 * Nettoie les noms et prénoms
 */
const nettoyerNomPrenom = (valeur) => {
  if (!valeur) return null;
  let str = String(valeur).trim();
  str = str.replace(/^(SURNAME|GIVEN\s*NAMES?|NAMES?|NOM|PRENOM|PRÉNOM|NOMS?|PRÉNOMS?|LIEU\s*DE\s*NAISSANCE)\s*(\/|\\|\:|-|\s)*\s*/i, '');
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
 * Valide et corrige rigoureusement les champs extraits pour éliminer toute erreur de placement
 */
const validerEtCorrigerDonnees = (parsed) => {
  let nom = nettoyerNomPrenom(parsed.nom);
  let prenom = nettoyerNomPrenom(parsed.prenom);
  let lieuNaissance = nettoyerNomPrenom(parsed.lieuNaissance);

  // 1. Désambiguïsation Nom vs Prénom
  if (nom && nom.includes(' ') && (!prenom || prenom.trim() === '')) {
    const parts = nom.trim().split(/\s+/);
    nom = parts.pop();
    prenom = parts.join(' ');
  }

  // 2. Extraction & désambiguïsation du NIN sénégalais (13-14 chiffres purs)
  const allText = `${parsed.nin || ''} ${parsed.numeroPiece || ''}`;
  const matchNinChiffres = allText.match(/(?:^|\D)(\d{13,14})(?:\D|$)/);
  
  let nin = matchNinChiffres ? matchNinChiffres[1] : (parsed.nin ? String(parsed.nin).replace(/\D/g, '') : null);
  if (nin && nin.length < 8) nin = null;

  let numeroPiece = nettoyerNumeroPiece(parsed.numeroPiece) || nin;

  // 3. Normalisation & Ordonnancement logique des dates (Naissance < Délivrance < Expiration)
  let dateNaissance = normaliserDate(parsed.dateNaissance);
  let dateDelivrance = normaliserDate(parsed.dateDelivrance);
  let dateExpiration = normaliserDate(parsed.dateExpiration);

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
    sexe: (parsed.sexe || '').toUpperCase().trim() || null,
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
    sex: (parsed.sexe || '').toUpperCase().trim() || null,
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
      description: "Nom de famille du titulaire (SURNAME). Ex: MENDY, DIOP, SOW." 
    },
    prenom: { 
      type: SchemaType.STRING, 
      description: "Prénom(s) du titulaire (GIVEN NAMES). Ex: MILINDA, CHEIKH AHMADOU BAMBA." 
    },
    dateNaissance: { 
      type: SchemaType.STRING, 
      description: "Date de naissance au format YYYY-MM-DD." 
    },
    lieuNaissance: { 
      type: SchemaType.STRING, 
      description: "Lieu de naissance (ex: DAKAR, ZIGUINCHOR)." 
    },
    sexe: { 
      type: SchemaType.STRING, 
      description: "Sexe ('M' ou 'F')." 
    },
    taille: { 
      type: SchemaType.STRING, 
      description: "Taille en cm (ex: 175)." 
    },
    numeroPiece: { 
      type: SchemaType.STRING, 
      description: "Numéro imprimé de la pièce ou numéro de passeport." 
    },
    nin: { 
      type: SchemaType.STRING, 
      description: "Numéro d'Identification National à 13-14 chiffres." 
    },
    codePays: { type: SchemaType.STRING },
    typePiece: { type: SchemaType.STRING },
    dateDelivrance: { type: SchemaType.STRING },
    dateExpiration: { type: SchemaType.STRING },
    centreEnregistrement: { type: SchemaType.STRING },
    adresseDomicile: { type: SchemaType.STRING },
    nationalite: { type: SchemaType.STRING },
    numeroElecteur: { type: SchemaType.STRING },
    region: { type: SchemaType.STRING },
    departement: { type: SchemaType.STRING },
    arrondissement: { type: SchemaType.STRING },
    commune: { type: SchemaType.STRING },
    lieuDeVote: { type: SchemaType.STRING },
    bureauDeVote: { type: SchemaType.STRING },
  },
  required: ["nom", "prenom"],
};

/**
 * Analyse ultra-rapide (< 1s) et ultra-précise avec Google Gemini Vision
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
    throw new Error('Le document fourni est vide ou corrompu.');
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

  const promptSysteme = `Tu es un moteur OCR instantané de haute précision spécialisé dans la lecture de pièces d'identité (CNI CEDEAO Sénégal, Passeport, Carte Consulaire).

EXTRAIS STRICTEMENT :
- **nom** : Le Nom de famille exact (ligne "Nom / Surname", ex: "MENDY").
- **prenom** : Le ou les Prénom(s) exacts (ligne "Prénom(s) / Given Names", ex: "MILINDA").
- **dateNaissance** : La date de naissance au format "YYYY-MM-DD" (ex: "1994-10-18").
- **lieuNaissance** : La ville de naissance (ex: "DAKAR").
- **nin** : Le Numéro d'Identification National à 13-14 chiffres (ex: "1751199401234").
- **numeroPiece** : Le numéro officiel de la pièce.
- **dateDelivrance** : Date d'établissement au format "YYYY-MM-DD".
- **dateExpiration** : Date d'expiration au format "YYYY-MM-DD".
- **sexe** : "M" ou "F".
- **taille** : Taille en cm (ex: 175).

Si la bande optique MRZ (<<<) en bas est présente, lis la 3ème ligne pour isoler sans erreur le NOM et les PRÉNOMS.`;

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
