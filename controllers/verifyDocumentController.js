const { evaluerFiabiliteDocument, identifierPays, REGLES_PAYS } = require('../services/fiabiliteService');
const { extraireInfosAvecGemini } = require('./extraction');

/**
 * Controller pour l'API de vérification de la fiabilité d'un document scanné selon le pays
 */
const verifierFiabiliteDocument = async (req, res) => {
  try {
    let documentData = req.body || {};
    let imageSource = req.file?.buffer || req.files?.[0]?.buffer || req.file?.path || req.body.image || req.body.recto || req.body.base64;
    let typeMime = req.file?.mimetype || req.files?.[0]?.mimetype || null;

    // 1. Si une nouvelle image est envoyée, extraire d'abord les infos via Gemini Vision
    if (imageSource && (!documentData.nom || !documentData.numeroPiece)) {
      try {
        const ocrInfos = await extraireInfosAvecGemini(imageSource, typeMime);
        if (ocrInfos) {
          documentData = { ...ocrInfos, ...documentData };
        }
      } catch (ocrErr) {
        console.warn('⚠️ OCR Gemini lors de la vérification de fiabilité :', ocrErr.message);
      }
    }

    // 2. Évaluer la fiabilité par rapport aux règles du pays
    const resultatFiabilite = evaluerFiabiliteDocument(documentData);

    return res.status(200).json({
      success: true,
      message: `Évaluation de fiabilité terminée pour ${resultatFiabilite.pays.nom}.`,
      document: documentData,
      fiabilite: resultatFiabilite,
    });
  } catch (err) {
    console.error('Erreur verification document :', err.message);
    return res.status(500).json({ success: false, message: `Erreur verification document: ${err.message}` });
  }
};

/**
 * Endpoint d'information sur les règles gérées par pays
 */
const obtenirReglesPays = (req, res) => {
  return res.status(200).json({
    success: true,
    paysPrisEnCharge: Object.values(REGLES_PAYS),
  });
};

module.exports = {
  verifierFiabiliteDocument,
  obtenirReglesPays,
};
