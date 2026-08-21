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
 * Liste des modèles Gemini pris en charge (gemini-3.6-flash en priorité)
 */
const MODES_GEMINI = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];

/**
 * Analyse une image de pièce d'identité avec Google Gemini Vision (compatible Serverless Vercel)
 * 
 * @param {string|Buffer} sourceImage - Chemin de fichier, Buffer binaire ou chaîne Base64
 * @returns {Promise<Object>} Données d'identité extraites
 */
const extraireInfosAvecGemini = async (sourceImage, mimeTypeForm = null) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('La clé GEMINI_API_KEY n\'est pas configurée dans les variables d\'environnement de Vercel (Settings -> Environment Variables).');
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
      // Chaîne base64 brute sans préfixe data:
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

  const promptSysteme = `Tu es un système expert en traitement d'images d'identité officielle (Carte Nationale d'Identité CNI, Passeport, Carte Consulaire, Permis de conduire, Carte CEDEAO, Carte de Séjour).
Examine très attentivement l'image fournie et extrais TOUTES les informations d'identité présentes avec la plus grande précision.

Tu dois retourner EXCLUSIVEMENT un objet JSON valide avec exactement les champs suivants :
{
  "nom": string ou null,
  "prenom": string ou null,
  "dateNaissance": string au format "YYYY-MM-DD" ou null,
  "lieuNaissance": string ou null,
  "sexe": "M" ou "F" ou null,
  "taille": integer (taille en cm, ex: 175) ou null,
  "numeroPiece": string (numéro de pièce / passeport / NIN / carte) ou null,
  "typePiece": string parmi ["CNI", "PASSEPORT", "PERMIS", "CARTE_CONSULAIRE", "CARTE_SEJOUR", "CARTE_IDENTITE_CEDEAO"],
  "dateDelivrance": string au format "YYYY-MM-DD" ou null,
  "dateExpiration": string au format "YYYY-MM-DD" ou null,
  "centreEnregistrement": string (autorité d'émission ou centre d'enregistrement) ou null,
  "adresseDomicile": string ou null,
  "nationalite": string ou null
}

Règles de formatage strictes :
1. Convertis impérativement les dates (jj/mm/aaaa ou mois abrégé) au format YYYY-MM-DD (ex: 1995-04-12).
2. Si un champ n'est pas présent ou est illisible, utilise la valeur null.
3. Pour le typePiece, choisis la valeur exacte la plus pertinente parmi la liste proposée.
4. Nettoie les chaînes (supprime les espaces superflus et bruits visuels).`;

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

      return {
        nom: parsedData.nom || null,
        prenom: parsedData.prenom || null,
        dateNaissance: parsedData.dateNaissance || null,
        lieuNaissance: parsedData.lieuNaissance || null,
        sexe: parsedData.sexe || null,
        taille: parsedData.taille ? Number(parsedData.taille) : null,
        numeroPiece: parsedData.numeroPiece ? String(parsedData.numeroPiece).trim() : null,
        typePiece: parsedData.typePiece || 'CNI',
        dateDelivrance: parsedData.dateDelivrance || null,
        dateExpiration: parsedData.dateExpiration || null,
        centreEnregistrement: parsedData.centreEnregistrement || null,
        adresseDomicile: parsedData.adresseDomicile || null,
        nationalite: parsedData.nationalite || null,
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
