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
  return str;
};

/**
 * Nettoie les numéros de pièce et NIN (retire uniquement les libellés parasites "N°", "NIN:", "CNI:")
 */
const nettoyerNumeroPiece = (valeur) => {
  if (!valeur) return null;
  let str = String(valeur).trim();
  str = str.replace(/^(N°\s*DE\s*LA\s*CARTE|N°\s*CNI|N°|CNI|NIN|ID|PASSEPORT|PASSPORT|NUMBER|NUMERO|CARD)\s*:?\s*/i, '');
  return str.trim() || null;
};

/**
 * Nettoie les noms et prénoms (retire uniquement les libellés parasites "Nom:", "Prénom:")
 */
const nettoyerNomPrenom = (valeur) => {
  if (!valeur) return null;
  let str = String(valeur).trim();
  str = str.replace(/^(SURNAME|GIVEN\s*NAMES?|NAMES?|NOM|PRENOM|PRÉNOM|NOMS?|PRÉNOMS?)\s*(\/|\\|\:|-|\s)*\s*/i, '');
  return str.trim() || null;
};

/**
 * Convertit toute représentation de taille (ex: "1,75m", "1m75", "1.75", 175) en cm entier (ex: 175)
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
 * Modèles Gemini d'ultra-précision
 */
const MODES_GEMINI = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];

/**
 * Schéma JSON avec descriptions d'orientation visuelle pour l'IA
 */
const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    nom: { 
      type: SchemaType.STRING, 
      description: "EXCLUSIVEMENT le Nom de famille du titulaire (ligne 'Nom / Surname'). Ne mets JAMAIS le prénom ici." 
    },
    prenom: { 
      type: SchemaType.STRING, 
      description: "EXCLUSIVEMENT le ou les Prénom(s) du titulaire (ligne 'Prénom(s) / Given Names'). Ne mets JAMAIS le nom de famille ici." 
    },
    dateNaissance: { 
      type: SchemaType.STRING, 
      description: "Date de naissance au format YYYY-MM-DD (ligne 'Date de naissance / Date of birth')." 
    },
    lieuNaissance: { 
      type: SchemaType.STRING, 
      description: "Lieu / Ville de naissance (ligne 'Lieu de naissance / Place of birth')." 
    },
    sexe: { 
      type: SchemaType.STRING, 
      description: "Sexe ('M' pour Masculin, 'F' pour Féminin)." 
    },
    taille: { 
      type: SchemaType.STRING, 
      description: "Taille en cm (ex: 175)." 
    },
    numeroPiece: { 
      type: SchemaType.STRING, 
      description: "Numéro officiel de la pièce ou du passeport." 
    },
    nin: { 
      type: SchemaType.STRING, 
      description: "Numéro d'Identification National à 13 ou 14 chiffres (ligne 'N° CNI / ID Card No' ou 'NIN')." 
    },
    codePays: { 
      type: SchemaType.STRING, 
      description: "Code ISO 3 lettres du pays émetteur (ex: SEN)." 
    },
    typePiece: { 
      type: SchemaType.STRING, 
      description: "Type de document (CARTE_IDENTITE_CEDEAO, CNI, PASSEPORT, PERMIS)." 
    },
    dateDelivrance: { 
      type: SchemaType.STRING, 
      description: "Date d'établissement au format YYYY-MM-DD." 
    },
    dateExpiration: { 
      type: SchemaType.STRING, 
      description: "Date d'expiration au format YYYY-MM-DD." 
    },
    centreEnregistrement: { 
      type: SchemaType.STRING, 
      description: "Centre d'enregistrement / autorité d'émission." 
    },
    adresseDomicile: { 
      type: SchemaType.STRING, 
      description: "Adresse du domicile." 
    },
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
 * Analyse une image ou un document (PDF / image) de pièce d'identité avec Google Gemini Vision
 * 
 * @param {string|Buffer} sourceImage - Chemin de fichier, Buffer binaire ou chaîne Base64
 * @param {string|null} mimeTypeForm - Type MIME fourni en amont
 * @returns {Promise<Object>} Données d'identité extraites
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

  // Prétraitement Haute Définition (1600px / JPEG 88) pour une lisibilité parfaite des petits chiffres
  if (mimeType !== 'application/pdf') {
    try {
      buffer = await sharp(buffer)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 88 })
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

  const promptSysteme = `Tu es un moteur OCR de précision maximale spécialisé dans le décodage de pièces d'identité (Carte Nationale d'Identité CNI CEDEAO Sénégal / Afrique de l'Ouest, Passeport biométrique, Carte Consulaire, Permis de Conduire, Carte de Séjour).

DIRECTIVES STRICTES DE DÉCODAGE CHIRURGICAL ET DE MAPPING :

1. **ZONE MRZ (BANDE OPTIQUE EN BAS AVEC DES CHEVRONS "<<<") - SOURCE DE VÉRITÉ** :
   - Si la carte ou le passeport contient une bande MRZ en bas, tu DOIS l'utiliser pour valider avec une certitude absolue :
   - **Nom (nom)** : C'est le premier mot de la 3ème ligne MRZ avant les chevrons "<<<" (ex: "MENDY" dans "MENDY<<MILINDA<<<<<<").
   - **Prénom(s) (prenom)** : Ce sont les mots situés après les chevrons "<<" de la 3ème ligne MRZ (ex: "MILINDA" dans "MENDY<<MILINDA<<<<<<").
   - **Date de naissance (dateNaissance)** : Les 6 premiers chiffres de la 2ème ligne MRZ au format YYMMDD (ex: "941018" -> "1994-10-18").
   - **Sexe (sexe)** : Le caractère suivant la date de naissance dans la 2ème ligne MRZ ("M" ou "F").
   - **Date d'expiration (dateExpiration)** : Les 6 chiffres d'expiration dans la 2ème ligne MRZ au format YYMMDD (ex: "260926" -> "2026-09-26").
   - **NIN / Numéro de pièce (nin / numeroPiece)** : La suite de chiffres de la 1ère ligne MRZ (ex: "1751199401234").

2. **TEXTE IMPRIMÉ SUR LA CARTE** :
   - **nom** (SURNAME) : Ligne "Nom / Surname" (ex: "MENDY"). Ne mets JAMAIS le prénom ici !
   - **prenom** (GIVEN NAMES) : Ligne "Prénom(s) / Given Names" (ex: "MILINDA"). Ne mets JAMAIS le nom de famille ici !
   - **dateNaissance** : Ligne "Date de Naissance / Date of birth" au format "YYYY-MM-DD" (ex: "1994-10-18").
   - **lieuNaissance** : Ligne "Lieu de Naissance / Place of birth" (ex: "DAKAR").
   - **nin** : Ligne "N° CNI / ID Card No" ou "NIN" (suite de 13 ou 14 chiffres purs).
   - **numeroPiece** : Numéro officiel de la pièce (NIN ou numéro de passeport ex: "A12345678").
   - **dateDelivrance** : Ligne "Date de Délivrance / Date of issue" au format "YYYY-MM-DD".
   - **dateExpiration** : Ligne "Date d'Expiration / Date of expiry" au format "YYYY-MM-DD".
   - **centreEnregistrement** : Ligne "Centre d'Enregistrement".
   - **adresseDomicile** : Ligne "Adresse / Address" (au verso).
   - **codePays** : Code ISO 3 lettres ("SEN").
   - **typePiece** : parmi ["CARTE_IDENTITE_CEDEAO", "CNI", "PASSEPORT", "PERMIS", "CARTE_CONSULAIRE", "CARTE_SEJOUR"].

Si l'image provient d'une webcam et est inversée en miroir ou pivotée, lis le texte à l'endroit.`;

  let lastError = null;

  for (const modelName of MODES_GEMINI) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: 0.0,
        },
      });

      const result = await model.generateContent([promptSysteme, imagePart]);
      const responseText = result.response.text();

      if (!responseText) {
        throw new Error(`Aucune réponse renvoyée par le modèle ${modelName}`);
      }

      const parsedData = JSON.parse(responseText);

      const nomExtrait = nettoyerNomPrenom(parsedData.nom);
      const prenomExtrait = nettoyerNomPrenom(parsedData.prenom);
      const rawNum = parsedData.numeroPiece || parsedData.nin || null;
      const numeroPieceExtrait = nettoyerNumeroPiece(rawNum);
      const ninExtrait = nettoyerNumeroPiece(parsedData.nin) || numeroPieceExtrait;
      const tailleCm = parseTailleCentimetres(parsedData.taille);

      const dateNaissanceNorm = normaliserDate(parsedData.dateNaissance);
      const dateDelivranceNorm = normaliserDate(parsedData.dateDelivrance);
      const dateExpirationNorm = normaliserDate(parsedData.dateExpiration);

      return {
        // Clés en Français
        nom: nomExtrait,
        prenom: prenomExtrait,
        dateNaissance: dateNaissanceNorm,
        lieuNaissance: parsedData.lieuNaissance ? String(parsedData.lieuNaissance).trim() : null,
        sexe: (parsedData.sexe || '').toUpperCase().trim() || null,
        taille: tailleCm,
        numeroPiece: numeroPieceExtrait,
        nin: ninExtrait,
        codePays: parsedData.codePays ? String(parsedData.codePays).toUpperCase().trim() : 'SEN',
        typePiece: parsedData.typePiece || 'CARTE_IDENTITE_CEDEAO',
        dateDelivrance: dateDelivranceNorm,
        dateExpiration: dateExpirationNorm,
        centreEnregistrement: parsedData.centreEnregistrement ? String(parsedData.centreEnregistrement).trim() : null,
        adresseDomicile: parsedData.adresseDomicile ? String(parsedData.adresseDomicile).trim() : null,
        nationalite: parsedData.nationalite ? String(parsedData.nationalite).trim() : null,
        numeroElecteur: parsedData.numeroElecteur ? String(parsedData.numeroElecteur).trim() : null,
        region: parsedData.region ? String(parsedData.region).trim() : null,
        departement: parsedData.departement ? String(parsedData.departement).trim() : null,
        arrondissement: parsedData.arrondissement ? String(parsedData.arrondissement).trim() : null,
        commune: parsedData.commune ? String(parsedData.commune).trim() : null,
        lieuDeVote: parsedData.lieuDeVote ? String(parsedData.lieuDeVote).trim() : null,
        bureauDeVote: parsedData.bureauDeVote ? String(parsedData.bureauDeVote).trim() : null,

        // Alias bilingues
        lastName: nomExtrait,
        firstName: prenomExtrait,
        birthDate: dateNaissanceNorm,
        birthPlace: parsedData.lieuNaissance ? String(parsedData.lieuNaissance).trim() : null,
        sex: (parsedData.sexe || '').toUpperCase().trim() || null,
        height: tailleCm,
        documentNumber: numeroPieceExtrait,
        idNumber: ninExtrait,
        documentType: parsedData.typePiece || 'CARTE_IDENTITE_CEDEAO',
        issuedAt: dateDelivranceNorm,
        expiresAt: dateExpirationNorm,
        issuer: parsedData.centreEnregistrement ? String(parsedData.centreEnregistrement).trim() : null,
        address: parsedData.adresseDomicile ? String(parsedData.adresseDomicile).trim() : null,

        formatDetecte: 'GEMINI_VISION',
      };
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Tentative Gemini (${modelName}) échouée :`, err.message);
    }
  }

  throw new Error(`Google Gemini Vision Erreur: ${lastError?.message || 'Échec de génération'}`);
};

module.exports = { extraireInfosAvecGemini };
