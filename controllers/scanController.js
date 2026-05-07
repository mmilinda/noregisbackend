const fs = require('fs');
const sharp = require('sharp');
const mindee = require('mindee');
const { Document } = require('../models');

// ================================
// CONFIGURATION
// ================================
const MINDEE_API_KEY = process.env.MINDEE_API_KEY;
const MODEL_ID = process.env.MINDEE_MODEL_ID || "ef4168fa-30a8-41ce-a972-eb152aa0cc86";

const mindeeClient = new mindee.Client({ apiKey: MINDEE_API_KEY });

// ================================
// PRÉTRAITEMENT IMAGE
// ================================
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
    return imagePath; // fallback : image originale
  }
}

// ================================
// EXTRACTION MINDEE (GeneratedV1)
// ================================
async function extraireAvecMindee(imagePath) {
  try {
    console.log('--- Appel Mindee SDK ---');
    console.log('📁 Fichier :', imagePath);
    console.log('📦 Taille  :', fs.statSync(imagePath).size, 'bytes');
    console.log('🆔 Model ID:', MODEL_ID);

    const inputSource = new mindee.PathInput({ inputPath: imagePath });

    // ✅ GeneratedV1 = classe correcte pour les modèles custom Mindee
    const response = await mindeeClient.enqueueAndGetResult(
      mindee.product.GeneratedV1,
      inputSource,
      { modelId: MODEL_ID }
    );

    console.log('✅ Réponse Mindee reçue');

    // ─── DEBUG : affiche la structure brute pour identifier les vrais noms de champs ───
    // À commenter une fois que tout fonctionne
    console.log('🔍 Réponse brute (inference.prediction) :',
      JSON.stringify(response?.document?.inference?.prediction, null, 2)
    );
    // ──────────────────────────────────────────────────────────────────────────────────

    // ✅ Chemin correct pour GeneratedV1
    const prediction = response?.document?.inference?.prediction || {};
    const fields = prediction.fields || prediction || {};

    console.log('📦 Champs disponibles :', Object.keys(fields));

    /**
     * Lecture robuste d'un champ Mindee :
     * - GeneratedV1 peut renvoyer { value: "..." } ou [{ value: "..." }]
     * - On gère les deux cas + valeur null si absent
     */
    const get = (...keys) => {
      for (const key of keys) {
        const val = fields[key];
        if (!val) continue;
        if (Array.isArray(val)) {
          const v = val[0]?.value;
          if (v !== undefined && v !== null && v !== '') return v;
        } else if (typeof val === 'object') {
          const v = val.value;
          if (v !== undefined && v !== null && v !== '') return v;
        } else if (val !== '') {
          return val;
        }
      }
      return null;
    };

    /**
     * Confidence robuste d'un champ Mindee
     */
    const conf = (...keys) => {
      for (const key of keys) {
        const val = fields[key];
        if (!val) continue;
        if (Array.isArray(val)) return val[0]?.confidence ?? 0;
        if (typeof val === 'object') return val.confidence ?? 0;
      }
      return 0;
    };

    // ─── Mapping vers tes champs applicatifs ───
    // Si les noms dans le log ci-dessus sont différents, mets-les ici
    const result = {
      nom:            get('nom', 'last_name', 'surname', 'family_name'),
      prenom:         get('prenom', 'first_name', 'given_name', 'given_names', 'prenoms'),
      numeroPiece:    get('numero_piece', 'numero', 'document_number', 'id_number', 'number'),
      dateNaissance:  get('date_naissance', 'birth_date', 'date_of_birth', 'dob'),
      dateExpiration: get('date_expiration', 'expiry_date', 'expiration_date', 'date_expiry'),
      sexe:           get('sexe', 'sex', 'gender'),
      nationalite:    get('nationalite', 'nationality'),
      typePiece:      get('type_piece', 'document_type', 'type') || 'CNI',
      paysEmission:   get('pays_emission', 'country_of_issue', 'issuing_country', 'country'),
      adresse:        get('adresse', 'address'),
      mrz:            get('mrz', 'mrz_line1', 'mrz1'),
      mrz2:           get('mrz2', 'mrz_line2'),
      confiance: {
        nom:    conf('nom', 'last_name', 'surname'),
        prenom: conf('prenom', 'first_name', 'given_names'),
        numero: conf('numero_piece', 'document_number', 'id_number'),
      },
    };

    console.log('📄 Résultat extrait :', result);
    return result;

  } catch (error) {
    console.error('❌ Erreur Mindee SDK :');
    if (error.response) {
      console.error('Statut :', error.response.status);
      console.error('Données :', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
    // Retour vide structuré (ne fait pas planter le reste)
    return {
      nom: null, prenom: null, numeroPiece: null, dateNaissance: null,
      dateExpiration: null, sexe: null, nationalite: null, typePiece: 'INCONNU',
      paysEmission: null, adresse: null, mrz: null, mrz2: null,
      confiance: { nom: 0, prenom: 0, numero: 0 },
    };
  }
}

// ================================
// CONTRÔLEUR PRINCIPAL
// ================================
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

    // 2. Sauvegarde en base
    const document = await Document.create({
      nomFichier:    req.file.filename,
      cheminFichier: preparedPath,
      typeMime:      req.file.mimetype,
      tailleFichier: fs.statSync(preparedPath).size,
    });

    // 3. Extraction Mindee
    const infosExtraites = await extraireAvecMindee(preparedPath);

    console.log('📄 Infos finales :', infosExtraites);

    // 4. Socket.io (si utilisé)
    const io = req.app.get('io');
    if (io) {
      io.emit('ocr:donnees', { infosExtraites, nomFichier: document.nomFichier });
    }

    // 5. Réponse
    return res.json({
      success: true,
      message: 'Scan terminé.',
      document: { id: document._id, nomFichier: document.nomFichier },
      infosExtraites,
    });

  } catch (err) {
    console.error('❌ Erreur générale :', err);
    return res.status(500).json({ success: false, message: err.message });

  } finally {
    // 6. Nettoyage fichiers temporaires
    try {
      if (originalPath && fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
      if (preparedPath && preparedPath !== originalPath && fs.existsSync(preparedPath)) {
        fs.unlinkSync(preparedPath);
      }
    } catch (e) {
      console.error('Nettoyage échoué :', e);
    }
  }
};

module.exports = { scannerImage };