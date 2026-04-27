const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Document } = require('../models');
const fs = require('fs');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const scannerImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucune image reçue.' });
    }

    const cheminFichier = req.file.path;

    const document = await Document.create({
      nomFichier: req.file.filename,
      cheminFichier,
      typeMime: req.file.mimetype,
      tailleFichier: req.file.size,
    });

    // Lire l'image en base64
    const imageData = fs.readFileSync(cheminFichier);
    const base64Image = imageData.toString('base64');

    // Appel Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: req.file.mimetype,
          data: base64Image,
        },
      },
      {
        text: `Tu es un expert en lecture de pièces d'identité.
Analyse cette image et extrais les informations suivantes en JSON strict :
{
  "nom": "NOM DE FAMILLE en majuscules",
  "prenom": "Prénom(s)",
  "numeroPiece": "numéro du document",
  "typePiece": "CNI | PASSEPORT | PERMIS | CARTE_SEJOUR",
  "dateNaissance": "YYYY-MM-DD"
}
Réponds UNIQUEMENT avec le JSON, sans texte autour.`,
      },
    ]);

    const texte = result.response.text();
    console.log('📄 Gemini OCR:', texte);

    let infosExtraites = {};
    try {
      const clean = texte.replace(/```json|```/g, '').trim();
      infosExtraites = JSON.parse(clean);
    } catch {
      infosExtraites = { raw: texte };
    }

    return res.json({
      success: true,
      message: 'Scan terminé.',
      document: { id: document._id, nomFichier: document.nomFichier },
      infosExtraites,
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { scannerImage };