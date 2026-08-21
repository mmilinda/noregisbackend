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
 * Extraits ciblés : Données d'identité, Données Électorales & Géographiques.
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

  // Optimisation & Redressement automatique pour les images (JPEG, PNG, WebP, etc.)
  if (mimeType !== 'application/pdf') {
    try {
      buffer = await sharp(buffer)
        .rotate() // Redresse automatiquement selon l'orientation EXIF
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }) // Redimensionnement intelligent
        .jpeg({ quality: 85 }) // Compression optimale pour la rapidité et la lisibilité OCR
        .toBuffer();
      mimeType = 'image/jpeg';
    } catch (sharpErr) {
      console.warn('⚠️ Prétraitement sharp ignoré (fallback image brute) :', sharpErr.message);
    }
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const imagePart = {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType,
    },
  };

  const promptSysteme = `Tu es un système d'IA expert en reconnaissance optique (OCR) et analyse de documents d'identité officiels (Carte Nationale d'Identité CNI, Carte CNI CEDEAO Sénégal/Afrique de l'Ouest, Carte d'Électeur, Passeport, Carte Consulaire, Permis de Conduire, Carte de Séjour).

Examine minutieusement l'image fournie (recto ou verso). Recherche activement et extrais TOUTES les informations d'identité, administratives et électorales suivantes :

1. **Données d'Identité Principales** :
   - Nom de famille (nom)
   - Prénom(s) (prenom)
   - Date de naissance (dateNaissance au format "YYYY-MM-DD")
   - Lieu de naissance (lieuNaissance, ex: "Dakar", "Ziguinchor", "Thiès", etc.)
   - Sexe ("M" ou "F")
   - Taille (taille en cm, ex: 175)
   - Adresse de domicile (adresseDomicile)
   - Nationalité (nationalite)

2. **Données de la Pièce & Dates** :
   - NIN / Numéro de pièce (numeroPiece / nin) : suite de 13-14 chiffres ou numéro de passeport
   - Code Pays (codePays) : code ISO à 3 lettres du pays émetteur (ex: "SEN", "CIV", "MLI", "GIN", "CMR", "MAR", etc.)
   - Type de Pièce (typePiece) : parmi ["CNI", "PASSEPORT", "PERMIS", "CARTE_CONSULAIRE", "CARTE_SEJOUR", "CARTE_IDENTITE_CEDEAO"]
   - Date de délivrance (dateDelivrance au format "YYYY-MM-DD")
   - Date d'expiration (dateExpiration au format "YYYY-MM-DD")
   - Centre d'enregistrement / Autorité émettrice (centreEnregistrement)

3. **Données Électorales & Découpage Géographique** (souvent présentes au verso ou sur cartes électorales) :
   - Numéro d'électeur (numeroElecteur, ex: N° Électeur / N° Carte électorale)
   - Région (region, ex: "Dakar", "Thiès", "Diourbel", "Saint-Louis", etc.)
   - Département (departement, ex: "Dakar", "Pikine", "Rufisque", etc.)
   - Arrondissement (arrondissement, ex: "Almadies", "Grand Dakar", etc.)
   - Commune (commune, ex: "Mermoz-Sacré-Cœur", "Fann-Point E", etc.)
   - Lieu de vote / Centre de vote (lieuDeVote, ex: "École Mermoz", "Centre d'État Civil", etc.)
   - Bureau de vote (bureauDeVote / bureau, ex: "Bureau 1", "01", "B02")

Tu dois retourner EXCLUSIVEMENT un objet JSON valide suivant exactement ce schéma :
{
  "nom": string ou null,
  "prenom": string ou null,
  "dateNaissance": string "YYYY-MM-DD" ou null,
  "lieuNaissance": string ou null,
  "sexe": "M" ou "F" ou null,
  "taille": integer (cm, ex: 175) ou null,
  "numeroPiece": string ou null,
  "nin": string ou null,
  "codePays": string (3 lettres ex: "SEN") ou null,
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
        codePays: parsedData.codePays ? String(parsedData.codePays).toUpperCase().trim() : null,
        typePiece: parsedData.typePiece || 'CNI',
        dateDelivrance: parsedData.dateDelivrance || null,
        dateExpiration: parsedData.dateExpiration || null,
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
