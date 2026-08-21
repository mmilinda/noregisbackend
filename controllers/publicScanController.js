const mongoose = require('mongoose');
const Visiteur = require('../models/Visiteur');
const Visite = require('../models/Visite');
const Utilisateur = require('../models/Utilisateur');
const { extraireInfosAvecGemini } = require('./extraction');

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

    if (!agentId) {
      return res.status(400).json({ success: false, message: 'Identifiant de l\'agent manquant.' });
    }

    // Validation du format d'ID MongoDB pour éviter le crash CastError (HTTP 500)
    if (!mongoose.Types.ObjectId.isValid(agentId)) {
      return res.status(400).json({ success: false, message: 'Identifiant de l\'agent invalide.' });
    }

    const agent = await Utilisateur.findById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent introuvable.' });
    }

    // Extraction automatique via Gemini Vision si les données de scan ne sont pas encore analysées
    const imageSource = req.file?.buffer || req.files?.[0]?.buffer || req.file?.path || image || recto || req.body.base64;
    
    if (imageSource && (!scanData.nom || !scanData.prenom || !scanData.numeroPiece)) {
      try {
        console.log('🤖 Analyse d\'image automatique dans public-scan via Gemini Vision...');
        const ocrInfos = await extraireInfosAvecGemini(imageSource);
        if (ocrInfos) {
          scanData = { ...ocrInfos, ...scanData };
        }
      } catch (ocrErr) {
        console.warn('⚠️ OCR Gemini dans public-scan non disponible :', ocrErr.message);
      }
    }

    const visitorPayload = getVisitorPayload(scanData);
    const { numeroPiece, nom, prenom } = visitorPayload;

    if (!nom || !prenom || !numeroPiece) {
      return res.status(400).json({
        success: false,
        message: 'Scan incomplet : le nom, le prénom et le numéro de pièce sont requis.',
      });
    }

    let visiteur = null;
    if (numeroPiece) {
      visiteur = await Visiteur.findOne({ numeroPiece });
    }

    if (visiteur) {
      Object.assign(visiteur, visitorPayload);
      await visiteur.save();
    } else {
      visiteur = await Visiteur.create(visitorPayload);
    }

    const visiteEnCours = await Visite.findOne({ visiteurId: visiteur._id, statut: 'EN_COURS' });
    if (visiteEnCours) {
      return res.status(409).json({
        success: false,
        message: 'Une visite est déjà en cours pour ce visiteur.',
        visite: visiteEnCours,
      });
    }

    const service = agent.poste || agent.departement || 'Entrée QR';
    const personneVisitee = `Portail / agent ${agent.nom || agent.email || agentId}`;

    const visite = await Visite.create({
      visiteurId: visiteur._id,
      personneVisitee,
      service,
      motif: 'Badgeage QR',
      heureEntree: new Date(),
      statut: 'EN_COURS',
    });

    const io = req.app.get('io');
    const notificationPayload = {
      agentId: agent._id,
      visiteId: visite._id,
      visiteurId: visiteur._id,
      visiteurNom: `${visiteur.prenom || ''} ${visiteur.nom || ''}`.trim(),
      service,
      source: source || 'QR public',
      scanData,
      createdAt: new Date(),
    };

    if (io) {
      io.to(`agent-${agent._id}`).emit('public-scan', notificationPayload);
      io.emit('public-scan', notificationPayload);
    }

    return res.status(201).json({
      success: true,
      message: 'Scan reçu avec succès. Le gardien a été notifié.',
      visite,
      visiteur,
      reference: visite._id,
    });
  } catch (err) {
    console.error('Erreur public scan :', err.message);
    return res.status(500).json({ success: false, message: `Erreur serveur lors du traitement du scan : ${err.message}` });
  }
};

module.exports = { traiterPublicScan };
