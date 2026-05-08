const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const { Document } = require("../models");

const scannerImage = async (req, res) => {
  try {

    // Vérifier image
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Aucune image reçue.",
      });
    }

    // Vérifier clé API
    if (!process.env.MINDEE_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "MINDEE_API_KEY manquante dans le .env",
      });
    }

    const cheminFichier = req.file.path;

    // Vérifier fichier existe
    if (!fs.existsSync(cheminFichier)) {
      return res.status(400).json({
        success: false,
        message: "Fichier introuvable.",
      });
    }

    // Sauvegarde MongoDB
    const document = await Document.create({
      nomFichier: req.file.filename,
      cheminFichier,
      typeMime: req.file.mimetype,
      tailleFichier: req.file.size,
    });

    // Préparer FormData
    const form = new FormData();

    form.append(
      "document",
      fs.createReadStream(cheminFichier),
      {
        filename: req.file.filename,
        contentType: req.file.mimetype,
      }
    );

    console.log("📤 Envoi vers Mindee...");

    // Appel API Mindee
    const response = await axios.post(
      "https://api.mindee.net/v1/products/mindee/international_id/v2/predict",
      form,
      {
        headers: {
          Authorization: `Token ${process.env.MINDEE_API_KEY}`,
          ...form.getHeaders(),
        },
        maxBodyLength: Infinity,
      }
    );

    const data = response.data;

    console.log(
      "✅ Réponse Mindee:",
      JSON.stringify(data, null, 2)
    );

    // Vérification sécurité
    if (
      !data ||
      !data.document ||
      !data.document.inference
    ) {
      return res.status(400).json({
        success: false,
        message: "Réponse Mindee invalide.",
        data,
      });
    }

    const pred = data.document.inference.prediction;

    // Extraction données
    const infosExtraites = {
      nom:
        pred.surnames?.[0]?.value || null,

      prenom:
        pred.given_names?.[0]?.value || null,

      numeroPiece:
        pred.document_number?.value || null,

      typePiece:
        detecterType(
          pred.document_type?.value
        ),

      dateNaissance:
        pred.birth_date?.value || null,

      nationalite:
        pred.nationality?.value || null,

      dateExpiration:
        pred.expiry_date?.value || null,

      pays:
        pred.country_of_issue?.value || null,

      sexe:
        pred.gender?.value || null,

      adresse:
        pred.address?.value || null,
    };

    // Socket.io temps réel
    const io = req.app.get("io");

    if (io) {
      io.emit("ocr:donnees", {
        infosExtraites,
        nomFichier: document.nomFichier,
      });
    }

    // Réponse finale
    return res.status(200).json({
      success: true,
      message: "Scan terminé avec succès.",
      document: {
        id: document._id,
        nomFichier: document.nomFichier,
      },
      infosExtraites,
    });

  } catch (err) {

    console.error(
      "❌ Scan Error:",
      err.response?.data || err.message
    );

    return res.status(
      err.response?.status || 500
    ).json({
      success: false,
      message:
        err.response?.data ||
        err.message ||
        "Erreur serveur",
    });

  }
};

// Détection type document
const detecterType = (type) => {

  if (!type) return "CNI";

  const t = type.toUpperCase();

  if (t.includes("PASSPORT")) {
    return "PASSEPORT";
  }

  if (
    t.includes("DRIVER") ||
    t.includes("LICENCE")
  ) {
    return "PERMIS";
  }

  if (t.includes("RESIDENCE")) {
    return "CARTE_SEJOUR";
  }

  return "CNI";
};

module.exports = {
  scannerImage,
};