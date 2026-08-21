const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const getMimeType = (filePath) => {
  if (typeof filePath !== 'string') return 'image/jpeg';
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
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
 * Liste des modèles Gemini pris en charge (gemini-3.6-flash en priorité)
 */
const MODES_GEMINI = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];

/**
 * Analyse une image de pièce d'identité avec Google Gemini Vision (optimisé pour CNI CEDEAO / Sénégal / Passeports)
 * Extraits ciblés : Taille, Lieu de Naissance, Adresse Domicile, NIN / N° de pièce.
 * 
 * @param {string|Buffer} sourceImage - Chemin de fichier, Buffer binaire ou chaîne Base64
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
      const matchMime = sourceImage.match(/^data:(image\/\w+);base64,/);
      if (matchMime) mimeType = matchMime[1];
      const base64Data = sourceImage.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    } else if (fs.existsSync(sourceImage)) {
      buffer = fs.readFileSync(sourceImage);
      mimeType = getMimeType(sourceImage);
    } else {
      buffer = Buffer.from(sourceImage, 'base64');
    }
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('L\'image fournie est vide ou corrompue.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const imagePart = {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType,
    },
  };

  const promptSysteme = `Tu es un système d'IA expert en reconnaissance optique (OCR) et analyse de documents d'identité officiels (Carte Nationale d'Identité CNI, Carte CNI CEDEAO Sénégal/Afrique de l'Ouest, Passeport, Carte Consulaire, Permis de Conduire, Carte de Séjour).

Examine minutieusement l'image fournie (recto ou verso). Recherche activement et extrais les informations clés suivantes :

1. **NIN / Numéro de Pièce (numeroPiece)** :
   - Sur les CNI CEDEAO/Sénégal : il s'agit du N° IDENTIFICATION NATIONALE (NIN), une suite de 13 ou 14 chiffres (ex: "1 751 1995 00123" ou "2751..."). Extrais cette suite complète de chiffres sans espaces.
   - Sur les passeports ou autres cartes : le N° de Passeport ou N° de Document.

2. **Lieu de Naissance (lieuNaissance)** :
   - Recherche les mentions "Lieu de naissance", "Place of birth", "Né(e) à" (ex: "Dakar", "Ziguinchor", "Thiès", "Saint-Louis", "Pikine", etc.).

3. **Taille (taille)** :
   - Recherche les mentions "Taille", "Height" (ex: "1,75 m", "1m75", "175 cm"). Convertis impérativement en un nombre entier représentant la taille en centimètres (ex: 175).

4. **Adresse de Domicile (adresseDomicile)** :
   - Recherche les mentions "Adresse", "Domicile", "Résidence", "Address" (souvent présent au verso ou au recto des cartes d'identité et permis).

5. **Autres données d'identité** :
   - Nom de famille (nom)
   - Prénom(s) (prenom)
   - Date de naissance (dateNaissance au format YYYY-MM-DD)
   - Sexe ("M" ou "F")
   - Date de délivrance (dateDelivrance au format YYYY-MM-DD)
   - Date d'expiration (dateExpiration au format YYYY-MM-DD)
   - Centre d'enregistrement / Autorité émettrice (centreEnregistrement)
   - Nationalité (nationalite)

Tu dois retourner EXCLUSIVEMENT un objet JSON valide suivant exactement ce schéma :
{
  "nom": string ou null,
  "prenom": string ou null,
  "dateNaissance": string "YYYY-MM-DD" ou null,
  "lieuNaissance": string ou null,
  "sexe": "M" ou "F" ou null,
  "taille": integer (cm, ex: 175) ou null,
  "numeroPiece": string (NIN ou n° passeport/carte) ou null,
  "nin": string (NIN à 13-14 chiffres) ou null,
  "typePiece": string parmi ["CNI", "PASSEPORT", "PERMIS", "CARTE_CONSULAIRE", "CARTE_SEJOUR", "CARTE_IDENTITE_CEDEAO"],
  "dateDelivrance": string "YYYY-MM-DD" ou null,
  "dateExpiration": string "YYYY-MM-DD" ou null,
  "centreEnregistrement": string ou null,
  "adresseDomicile": string ou null,
  "nationalite": string ou null
}`;

  let lastError = null;

  for (const modelName of MODES_GEMINI) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: 'application/json' },
      });

      const result = await model.generateContent([promptSysteme, imagePart]);
      const responseText = result.response.text();

      if (!responseText) {
        throw new Error(`Aucune réponse renvoyée par le modèle ${modelName}`);
      }

      const parsedData = JSON.parse(responseText);

      const numeroPieceExtrait = parsedData.numeroPiece || parsedData.nin || null;
      const tailleCm = parseTailleCentimetres(parsedData.taille);

      return {
        nom: parsedData.nom ? String(parsedData.nom).trim() : null,
        prenom: parsedData.prenom ? String(parsedData.prenom).trim() : null,
        dateNaissance: parsedData.dateNaissance || null,
        lieuNaissance: parsedData.lieuNaissance ? String(parsedData.lieuNaissance).trim() : null,
        sexe: parsedData.sexe || null,
        taille: tailleCm,
        numeroPiece: numeroPieceExtrait ? String(numeroPieceExtrait).replace(/\s+/g, '').trim() : null,
        nin: parsedData.nin ? String(parsedData.nin).replace(/\s+/g, '').trim() : (numeroPieceExtrait ? String(numeroPieceExtrait).replace(/\s+/g, '').trim() : null),
        typePiece: parsedData.typePiece || 'CNI',
        dateDelivrance: parsedData.dateDelivrance || null,
        dateExpiration: parsedData.dateExpiration || null,
        centreEnregistrement: parsedData.centreEnregistrement ? String(parsedData.centreEnregistrement).trim() : null,
        adresseDomicile: parsedData.adresseDomicile ? String(parsedData.adresseDomicile).trim() : null,
        nationalite: parsedData.nationalite ? String(parsedData.nationalite).trim() : null,
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
