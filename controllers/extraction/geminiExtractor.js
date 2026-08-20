const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
};

/**
 * Analyse une image de pièce d'identité avec Google Gemini Vision (gemini-1.5-flash)
 * et extrait les données sous forme d'un objet JSON structuré.
 * 
 * @param {string} cheminFichier - Chemin absolu ou relatif de l'image
 * @returns {Promise<Object>} Données d'identité extraites
 */
const extraireInfosAvecGemini = async (cheminFichier) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('La clé GEMINI_API_KEY n\'est pas définie dans le fichier .env');
  }

  if (!fs.existsSync(cheminFichier)) {
    throw new Error(`Fichier introuvable sur le serveur : ${cheminFichier}`);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  });

  const buffer = fs.readFileSync(cheminFichier);
  const mimeType = getMimeType(cheminFichier);

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

  try {
    const result = await model.generateContent([promptSysteme, imagePart]);
    const responseText = result.response.text();

    if (!responseText) {
      throw new Error('Aucune réponse renvoyée par Google Gemini Vision.');
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
    throw new Error(`Google Gemini Vision Erreur: ${err.message}`);
  }
};

module.exports = { extraireInfosAvecGemini };
