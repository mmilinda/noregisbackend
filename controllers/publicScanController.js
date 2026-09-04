const mongoose = require('mongoose');
const Visiteur = require('../models/Visiteur');
const Visite = require('../models/Visite');
const Utilisateur = require('../models/Utilisateur');
const { extraireInfosAvecGemini } = require('./extraction');
const { evaluerFiabiliteDocument } = require('../services/fiabiliteService');

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getVisitorPayload = (data) => ({
  nom: data.nom || data.lastName || data.nomComplet || data.fullName || '',
  prenom: data.prenom || data.firstName || '',
  dateNaissance: parseDate(data.dateNaissance || data.dateDeNaissance || data.birthDate),
  lieuNaissance: data.lieuNaissance || data.birthPlace || '',
  sexe: data.sexe || data.sex || '',
  taille: data.taille || data.height || '',
  numeroPiece: data.numeroPiece || data.documentNumber || data.idNumber || '',
  typePiece: data.typePiece || data.documentType || '',
  dateDelivrance: parseDate(data.dateDelivrance || data.issuedAt),
  dateExpiration: parseDate(data.dateExpiration || data.expiresAt),
  centreEnregistrement: data.centreEnregistrement || data.issuer || '',
  adresseDomicile: data.adresseDomicile || data.address || '',
});

const traiterPublicScan = async (req, res) => {
  try {
    let { agentId, scanData = {}, image, recto, source } = req.body;

    // 1. Extraction automatique via Gemini Vision si une image ou un document est fourni
    const imageSource = req.file?.buffer || req.files?.[0]?.buffer || req.file?.path || image || recto || req.body.base64;
    const typeMime = req.file?.mimetype || req.files?.[0]?.mimetype || null;
    
    if (imageSource && (!scanData.nom || !scanData.prenom || !scanData.numeroPiece)) {
      try {
        console.log('🤖 Analyse de document automatique dans public-scan via Gemini Vision...');
        const ocrInfos = await extraireInfosAvecGemini(imageSource, typeMime);
        if (ocrInfos) {
          scanData = { ...ocrInfos, ...scanData };
        }
      } catch (ocrErr) {
        console.warn('⚠️ OCR Gemini dans public-scan non disponible :', ocrErr.message);
      }
    }

    const visitorPayload = getVisitorPayload(scanData);
    const { numeroPiece, nom, prenom } = visitorPayload;

    let agent = null;
    // Recherche Agent non-bloquante (si BDD connectée)
    if (agentId && mongoose.Types.ObjectId.isValid(agentId)) {
      try {
        agent = await Utilisateur.findById(agentId);
      } catch (dbErr) {
        console.warn('⚠️ BDD non disponible pour recherche Agent :', dbErr.message);
      }
    }

    let visiteur = null;
    let visite = null;

    // Traitement BDD non-bloquant
    try {
      if (mongoose.connection.readyState === 1 && numeroPiece) {
        visiteur = await Visiteur.findOne({ numeroPiece });
        if (visiteur) {
          Object.assign(visiteur, visitorPayload);
          await visiteur.save();
        } else if (nom && prenom) {
          visiteur = await Visiteur.create(visitorPayload);
        }

        if (visiteur) {
          const visiteEnCours = await Visite.findOne({ visiteurId: visiteur._id, statut: 'EN_COURS' });
          if (visiteEnCours) {
            return res.status(409).json({
              success: false,
              message: 'Une visite est déjà en cours pour ce visiteur.',
              visite: visiteEnCours,
              visiteur,
              scanData,
            });
          }

          const service = agent?.poste || agent?.departement || 'Entrée QR';
          const personneVisitee = `Portail / agent ${agent?.nom || agent?.email || agentId || 'Public'}`;

          visite = await Visite.create({
            visiteurId: visiteur._id,
            personneVisitee,
            service,
            motif: 'Badgeage QR',
            heureEntree: new Date(),
            statut: 'EN_COURS',
          });
        }
      }
    } catch (dbErr) {
      console.warn('⚠️ Erreur enregistrement BDD (non-bloquant) :', dbErr.message);
    }

    // Notification Socket.io en temps réel
    const io = req.app.get('io');
    const fiabilite = evaluerFiabiliteDocument(scanData);

    const notificationPayload = {
      agentId: agent?._id || agentId,
      visiteId: visite?._id,
      visiteurId: visiteur?._id,
      visiteurNom: `${prenom || ''} ${nom || ''}`.trim(),
      service: agent?.poste || agent?.departement || 'Entrée QR',
      source: source || 'QR public',
      scanData,
      fiabilite,
      createdAt: new Date(),
    };

    if (io) {
      if (agent?._id) io.to(`agent-${agent._id}`).emit('public-scan', notificationPayload);
      io.emit('public-scan', notificationPayload);
    }

    return res.status(200).json({
      success: true,
      message: 'Scan traité avec succès.',
      scanData,
      fiabilite,
      visiteur: visiteur || visitorPayload,
      visite,
      reference: visite?._id || `ref_${Date.now()}`,
    });
  } catch (err) {
    console.error('Erreur globale public scan :', err.message);
    return res.status(500).json({ success: false, message: `Erreur traitement scan : ${err.message}` });
  }
};

module.exports = { traiterPublicScan };
