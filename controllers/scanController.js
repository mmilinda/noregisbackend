const fs = require('fs');
const sharp = require('sharp');
const mindee = require('mindee');
const { Document } = require('../models');

// Configuration Mindee
const MINDEE_API_KEY = process.env.MINDEE_API_KEY;
// Remplace par l'ID de ton modèle personnalisé (ou garde l'ID que tu as montré)
const MODEL_ID = process.env.MINDEE_MODEL_ID || "ef4168fa-30a8-41ce-a972-eb152aa0cc86";

// Initialisation du client Mindee
const mindeeClient = new mindee.Client({ apiKey: MINDEE_API_KEY });

// ------------------------- Prétraitement image -------------------------
async function preparerImage(imagePath) {
  const outputPath = imagePath + '_prepared.jpg';
  try {
    const metadata = await sharp(imagePath).metadata();
    console.log(`📸 Original : ${metadata.width}x${metadata.height}, ${metadata.size} bytes`);

    await sharp(imagePath)
      .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
      .normalize()
      .jpeg({ quality: 85 })
      .toFile(outputPath);

    const stats = fs.statSync(outputPath);
    console.log(`✅ Image préparée : ${outputPath} (${stats.size} bytes)`);
    return outputPath;
  } catch (err) {
    console.error('❌ Sharp error:', err.message);
    return imagePath;
  }
}

// ------------------------- Appel Mindee (SDK) -------------------------
async function extraireAvecMindee(imagePath, fileInfos) {
  try {
    console.log('--- Appel Mindee SDK ---');
    console.log('📁 Fichier:', imagePath);
    console.log('📦 Taille:', fs.statSync(imagePath).size, 'bytes');
    console.log('🆔 Model ID:', MODEL_ID);

    const inputSource = new mindee.PathInput({ inputPath: imagePath });

    const response = await mindeeClient.enqueueAndGetResult(
      mindee.product.Extraction,
      inputSource,
      {
        modelId: MODEL_ID,
        // Options utiles pour toi
        confidence: true,   // pour avoir le niveau de confiance
        polygon: false,     // inutile pour toi
        rawText: false,
        rag: false,
      }
    );

    console.log('✅ Réponse Mindee reçue');

    // La structure dépend de ton modèle personnalisé
    // "response.inference.result.fields" contient les champs extraits
    const fields = response.inference.result.fields || {};

    // Adaptation générique : on extrait les valeurs des champs
    const extrait = {};

    for (const [key, value] of Object.entries(fields)) {
      // value est un objet avec .value, .confidence, etc.
      if (value && typeof value === 'object' && value.value !== undefined) {
        extrait[key] = value.value;
      } else {
        extrait[key] = value;
      }
    }

    // Si tu veux une mise en correspondance avec tes champs attendus (nom, prenom, etc.)
    // adapte selon les noms de champs que tu as définis dans ton modèle personnalisé.
    // Exemple de mapping :
    const result = {
      nom: extrait['nom'] || extrait['last_name'] || extrait['surname'] || null,
      prenom: extrait['prenom'] || extrait['first_name'] || extrait['given_names'] || null,
      numeroPiece: extrait['numero_piece'] || extrait['document_number'] || null,
      dateNaissance: extrait['date_naissance'] || extrait['birth_date'] || null,
      dateExpiration: extrait['date_expiration'] || extrait['expiry_date'] || null,
      sexe: extrait['sexe'] || extrait['sex'] || null,
      nationalite: extrait['nationalite'] || extrait['nationality'] || null,
      typePiece: extrait['type_piece'] || extrait['document_type'] || 'CNI',
      paysEmission: extrait['pays_emission'] || extrait['country_of_issue'] || null,
      adresse: extrait['adresse'] || extrait['address'] || null,
      mrz: extrait['mrz'] || null,
      confiance: {
        nom: fields['nom']?.confidence || fields['last_name']?.confidence || 0,
        prenom: fields['prenom']?.confidence || fields['first_name']?.confidence || 0,
        numero: fields['numero_piece']?.confidence || fields['document_number']?.confidence || 0,
      }
    };

    return result;
  } catch (error) {
    console.error('❌ Erreur Mindee SDK:');
    if (error.response) {
      console.error('Statut:', error.response.status);
      console.error('Données:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
    // Retour vide
    return {
      nom: null, prenom: null, numeroPiece: null, dateNaissance: null,
      dateExpiration: null, sexe: null, nationalite: null, typePiece: 'INCONNU',
      paysEmission: null, adresse: null, mrz: null,
      confiance: { nom: 0, prenom: 0, numero: 0 },
    };
  }
}

// ------------------------- Contrôleur principal -------------------------
const scannerImage = async (req, res) => {
  let originalPath = null;
  let preparedPath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucune image reçue.' });
    }

    originalPath = req.file.path;

    // 1. Prétraitement
    preparedPath = await preparerImage(originalPath);

    // 2. Sauvegarde en base (optionnel, mais gardé)
    const document = await Document.create({
      nomFichier: req.file.filename,
      cheminFichier: preparedPath,
      typeMime: req.file.mimetype,
      tailleFichier: fs.statSync(preparedPath).size,
    });

    // 3. Extraction Mindee
    const infosExtraites = await extraireAvecMindee(preparedPath, req.file);

    console.log('📄 Infos extraites:', infosExtraites);

    // 4. Socket.io (si tu utilises)
    const io = req.app.get('io');
    if (io) {
      io.emit('ocr:donnees', {
        infosExtraites,
        nomFichier: document.nomFichier,
      });
    }

    // 5. Réponse
    return res.json({
      success: true,
      message: 'Scan terminé.',
      document: { id: document._id, nomFichier: document.nomFichier },
      infosExtraites,
    });
  } catch (err) {
    console.error('❌ Erreur générale:', err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    // 6. Nettoyage fichiers temporaires
    try {
      if (originalPath && fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
      if (preparedPath && preparedPath !== originalPath && fs.existsSync(preparedPath)) fs.unlinkSync(preparedPath);
    } catch (e) {
      console.error('Nettoyage échoué:', e);
    }
  }
};

module.exports = { scannerImage };