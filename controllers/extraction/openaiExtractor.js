const fs = require('fs');
const path = require('path');
const axios = require('axios');

const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
};

/**
 * Analyse une image de pièce d'identité avec OpenAI Vision (gpt-4o-mini via API REST Axios)
 * et extrait les données sous forme d'un objet JSON structuré.
 * 
 * @param {string} cheminFichier - Chemin absolu ou relatif de l'image
 * @returns {Promise<Object>} Données d'identité extraites
 */
const extraireInfosAvecOpenAI = async (cheminFichier) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('La clé OPENAI_API_KEY n\'est pas définie dans le fichier .env');
  }

  if (!fs.existsSync(cheminFichier)) {
    throw new Error(`Fichier introuvable sur le serveur : ${cheminFichier}`);
  }

  const buffer = fs.readFileSync(cheminFichier);
  const base64Image = buffer.toString('base64');
  const mimeType = getMimeType(cheminFichier);
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

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

  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: promptSysteme,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Analyse ce document d\'identité et extrait toutes les informations disponibles en JSON structuré.',
          },
          {
            type: 'image_url',
            image_url: {
              url: dataUrl,
              detail: 'high',
            },
          },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  };

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        timeout: 30000,
      }
    );

    const rawJson = response.data?.choices?.[0]?.message?.content;
    if (!rawJson) {
      throw new Error('Aucune réponse renvoyée par OpenAI Vision.');
    }

    const parsedData = JSON.parse(rawJson);

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
      formatDetecte: 'OPENAI_VISION',
    };
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const apiErrorMsg = err.response.data?.error?.message || JSON.stringify(err.response.data);
      throw new Error(`OpenAI API Erreur ${status}: ${apiErrorMsg}`);
    }
    throw err;
  }
};

module.exports = { extraireInfosAvecOpenAI };
