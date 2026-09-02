const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
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
 * Liste des modèles Gemini officiels pris en charge
 */
const MODES_GEMINI = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'];

/**
 * Analyse une image ou un document (PDF / image) de pièce d'identité avec Google Gemini Vision
 * 
 * @param {string|Buffer} sourceImage - Chemin de fichier, Buffer binaire ou chaîne Base64
 * @param {string|null} mimeTypeForm - Type MIME fourni en amont
 * @returns {Promise<Object>} Données d'identité et électorales extraites
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

  // Prétraitement Ultra-Rapide (< 1s) : 1000px / JPEG 75 (Payload ultra-léger ~50KB)
  if (mimeType !== 'application/pdf') {
    try {
      buffer = await sharp(buffer)
        .rotate()
        .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true, fastShrinkOnLoad: true })
        .jpeg({ quality: 75 })
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

  const promptSysteme = `Tu es un moteur OCR d'ultra-précision spécialisé dans l'analyse de documents d'identité officiels (Carte Nationale d'Identité CNI, Carte CNI CEDEAO Sénégal / Afrique de l'Ouest, Carte d'Électeur, Passeport, Carte Consulaire, Permis de Conduire, Carte de Séjour).

CONSIGNES STRICTES DE MAPPING :
- **nom** : Le Nom de famille (SURNAME) de la ligne "Nom / Surname" (ex: "MENDY"). Ne le confonds pas avec le prénom.
- **prenom** : Le ou les Prénom(s) (GIVEN NAMES) de la ligne "Prénom(s) / Given Names" (ex: "MILINDA").
- **dateNaissance** : La date de naissance au format "YYYY-MM-DD" (ex: "1994-10-18").
- **lieuNaissance** : La ville ou lieu de naissance (ex: "DAKAR").
- **sexe** : "M" ou "F".
- **taille** : La taille en cm (entier, ex: 175).
- **nin** : Le Numéro d'Identification National à 13 ou 14 chiffres (ex: "1751199401234").
- **numeroPiece** : Le numéro officiel de la pièce (NIN ou Numéro de passeport).
- **dateDelivrance** : La date d'établissement au format "YYYY-MM-DD".
- **dateExpiration** : La date d'expiration au format "YYYY-MM-DD".
- **centreEnregistrement** : L'autorité émettrice / centre d'enregistrement.
- **adresseDomicile** : L'adresse du domicile (au verso).

Si une zone MRZ (bande en bas avec symboles <<<) est présente, utilise-la pour valider les nom, prénom, numéro de pièce, date de naissance, sexe et expiration.
Si l'image provient d'une webcam et est inversée en miroir ou pivotée, lis le texte à l'endroit.

Tu dois retourner EXCLUSIVEMENT un objet JSON valide suivant exactement ce schéma :
{
  "nom": string ou null,
  "prenom": string ou null,
  "dateNaissance": string "YYYY-MM-DD" ou null,
  "lieuNaissance": string ou null,
  "sexe": "M" ou "F" ou null,
  "taille": integer ou null,
  "numeroPiece": string ou null,
  "nin": string ou null,
  "codePays": string ou null,
  "typePiece": string ou null,
  "dateDelivrance": string "YYYY-MM-DD" ou null,
  "dateExpiration": string "YYYY-MM-DD" ou null,
  "centreEnregistrement": string ou null,
  "adresseDomicile": string ou null,
  "nationalite": string ou null,
  "numeroElecteur": string ou null,
  "region": string ou null,
  "departement": string ou null,
  "arrondissement": string ou null,
  "commune": string ou null,
  "lieuDeVote": string ou null,
  "bureauDeVote": string ou null
}`;

  let lastError = null;

  for (const modelName of MODES_GEMINI) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.0, // Température zéro pour éliminer toute hallucination
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

