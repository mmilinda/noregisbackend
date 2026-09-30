const mongoose = require('mongoose');
const { Visite, Visiteur, Utilisateur, Entreprise } = require('../models');

/**
 * Tente de résoudre l'entreprise associée à une visite ou un rendez-vous si entrepriseId est nul.
 * Effectue une réparation silencieuse en BDD pour garantir l'intégrité multi-tenant.
 */
const resoudreEntreprise = async (visiteDoc) => {
  if (!visiteDoc) return null;

  let entObj = null;

  if (visiteDoc.entrepriseId && typeof visiteDoc.entrepriseId === 'object' && visiteDoc.entrepriseId.nom) {
    entObj = visiteDoc.entrepriseId;
  } else if (visiteDoc.entrepriseId && mongoose.Types.ObjectId.isValid(visiteDoc.entrepriseId)) {
    entObj = await Entreprise.findById(visiteDoc.entrepriseId);
  }

  // 1. Tenter la résolution par l'agent créateur / hôte
  if (!entObj && visiteDoc.agentId) {
    const agent = typeof visiteDoc.agentId === 'object' ? visiteDoc.agentId : await Utilisateur.findById(visiteDoc.agentId);
    const agentEntId = agent?.entrepriseId?._id || agent?.entrepriseId;
    if (agentEntId) {
      entObj = await Entreprise.findById(agentEntId);
    }
  }

  // 2. Tenter la résolution par le visiteur rattaché
  if (!entObj && visiteDoc.visiteurId) {
    const visiteur = typeof visiteDoc.visiteurId === 'object' ? visiteDoc.visiteurId : await Visiteur.findById(visiteDoc.visiteurId);
    const visiteurEntId = visiteur?.entrepriseId?._id || visiteur?.entrepriseId;
    if (visiteurEntId) {
      entObj = await Entreprise.findById(visiteurEntId);
    }
  }

  // 3. Fallback sur la première entreprise active de la base de données
  if (!entObj) {
    entObj = await Entreprise.findOne({ statut: 'ACTIF' }).sort({ createdAt: 1 }) || await Entreprise.findOne().sort({ createdAt: 1 });
  }

  // Réparation silencieuse du document en BDD
  if (entObj && visiteDoc._id) {
    if (!visiteDoc.entrepriseId || String(visiteDoc.entrepriseId) !== String(entObj._id)) {
      await Visite.updateOne({ _id: visiteDoc._id }, { entrepriseId: entObj._id }).catch(() => {});
    }
  }

  return entObj;
};

const construireFiltrePérimètre = (req) => {
  const user = req.utilisateur;
  const filtre = {};

  if (!user) return filtre;

  const role = (user.role || '').toUpperCase();

  if (role === 'SUPER_ADMIN' || role === 'SUPERADMIN') {
    if (req.query.entrepriseId) filtre.entrepriseId = req.query.entrepriseId;
    if (req.query.agentId) filtre.agentId = req.query.agentId;
  } else {
    // ADMIN et AGENT : cloisonnement strict par entreprise. Seules les visites/RDV de leur propre entreprise sont retournés.
    const entId = user.entrepriseId?._id || user.entrepriseId;
    if (entId) {
      filtre.entrepriseId = entId;
    } else if (role === 'AGENT') {
      filtre.agentId = user._id;
    }
  }

  return filtre;
};

const enregistrerEntree = async (req, res) => {
  try {
    const { visiteurId, personneVisitee, service, motif, rendezVousId, visiteId } = req.body;
    const user = req.utilisateur;

    let targetVisiteurId = visiteurId || req.body.visiteur;

    // Si le frontend transmet un objet complet (ex: { _id: '...', nom: '...' })
    if (targetVisiteurId && typeof targetVisiteurId === 'object') {
      targetVisiteurId = targetVisiteurId._id || targetVisiteurId.id;
    }

    let visiteur = null;

    // 1. Recherche directe par ID de visiteur
    if (targetVisiteurId && mongoose.Types.ObjectId.isValid(targetVisiteurId)) {
      visiteur = await Visiteur.findById(targetVisiteurId);
    }

    // 2. Si non trouvé par ID direct, vérifier si l'ID transmis correspond à un Rendez-vous / Visite
    const potentialRdvId = rendezVousId || visiteId || req.body.id || (targetVisiteurId && !visiteur ? targetVisiteurId : null);
    if (!visiteur && potentialRdvId && mongoose.Types.ObjectId.isValid(potentialRdvId)) {
      const meRendezVous = await Visite.findById(potentialRdvId);
      if (meRendezVous) {
        if (meRendezVous.visiteurId) {
          visiteur = await Visiteur.findById(meRendezVous.visiteurId);
        }

        // Si la visite trouvée est un rendez-vous 'PROGRAMME', on valide ce rendez-vous directement
        if (meRendezVous.statut === 'PROGRAMME') {
          if (!visiteur) {
            const entrepriseId = user?.entrepriseId?._id || user?.entrepriseId || meRendezVous.entrepriseId || null;
            visiteur = await Visiteur.create({
              nom: req.body.nom || req.body.visiteurNom || 'Visiteur',
              prenom: req.body.prenom || req.body.visiteurPrenom || 'RDV',
              numeroPiece: `RDV-${Date.now()}`,
              typePiece: 'CNI',
              entrepriseId,
              creeParAgentId: user?._id || null,
            });
            meRendezVous.visiteurId = visiteur._id;
          }

          const visiteEnCours = await Visite.findOne({
            visiteurId: visiteur._id,
            statut: 'EN_COURS',
            _id: { $ne: meRendezVous._id }
          });

          if (visiteEnCours) {
            return res.status(409).json({
              success: false,
              message: "Ce visiteur a déjà une visite en cours.",
              visiteEnCours
            });
          }

          meRendezVous.statut = 'EN_COURS';
          meRendezVous.heureEntree = new Date();
          if (personneVisitee) meRendezVous.personneVisitee = personneVisitee;
          if (service) meRendezVous.service = service;
          if (motif) meRendezVous.motif = motif;
          await meRendezVous.save();

          const completeVisite = await Visite.findById(meRendezVous._id)
            .populate('visiteurId')
            .populate('agentId', 'nom prenom email')
            .populate('entrepriseId', 'nom code');

          const io = req.app.get('io');
          if (io) {
            io.emit('visite:entree', completeVisite);
          }

          return res.status(200).json({
            success: true,
            message: `Entrée du rendez-vous enregistrée à ${new Date().toLocaleTimeString('fr-SN')}`,
            visite: completeVisite,
          });
        }
      }
    }

    // 3. Fallback de recherche par NIN, numeroPiece ou telephone
    if (!visiteur && (req.body.nin || req.body.numeroPiece || req.body.telephone)) {
      const searchConditions = [];
      if (req.body.nin && String(req.body.nin).trim()) searchConditions.push({ nin: String(req.body.nin).trim() });
      if (req.body.numeroPiece && String(req.body.numeroPiece).trim()) searchConditions.push({ numeroPiece: String(req.body.numeroPiece).trim() });
      if (req.body.telephone && String(req.body.telephone).trim()) searchConditions.push({ telephone: String(req.body.telephone).trim() });

      if (searchConditions.length > 0) {
        visiteur = await Visiteur.findOne({ $or: searchConditions });
      }
    }

    // 4. Auto-création de secours si des infos visiteur sont fournies
    if (!visiteur) {
      const nom = req.body.nom || req.body.visiteurNom || (typeof req.body.visiteur === 'string' ? req.body.visiteur : null);
      const prenom = req.body.prenom || req.body.visiteurPrenom || '';

      if (nom || prenom) {
        const entrepriseId = user?.entrepriseId?._id || user?.entrepriseId || null;
        visiteur = await Visiteur.create({
          nom: nom || 'Visiteur',
          prenom: prenom || 'Inconnu',
          telephone: req.body.telephone || null,
          numeroPiece: req.body.numeroPiece || `VIS-${Date.now()}`,
          nin: req.body.nin || null,
          typePiece: req.body.typePiece || 'CNI',
          entrepriseId,
          creeParAgentId: user?._id || null,
        });
      }
    }

    if (!visiteur) {
      return res.status(404).json({ success: false, message: 'Visiteur introuvable.' });
    }

    const effectiveVisiteurId = visiteur._id;

    const visiteEnCours = await Visite.findOne({ visiteurId: effectiveVisiteurId, statut: 'EN_COURS' });
    if (visiteEnCours) {
      return res.status(409).json({ success: false, message: "Ce visiteur est déjà à l'intérieur.", visiteEnCours });
    }

    const agentId = user?._id || null;
    const entrepriseId = user?.entrepriseId?._id || user?.entrepriseId || null;

    const visite = await Visite.create({
      visiteurId: effectiveVisiteurId,
      agentId,
      entrepriseId,
      personneVisitee: personneVisitee || 'Accueil / Réception',
      service: service || 'Direction',
      motif,
      heureEntree: new Date(),
      statut: 'EN_COURS',
    });

    const completeVisite = await Visite.findById(visite._id)
      .populate('visiteurId')
      .populate('agentId', 'nom prenom email')
      .populate('entrepriseId', 'nom code');

    const io = req.app.get('io');
    if (io) {
      io.emit('visite:entree', completeVisite);
    }

    res.status(201).json({
      success: true,
      message: `Entrée enregistrée à ${new Date().toLocaleTimeString('fr-SN')}`,
      visite: completeVisite,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const enregistrerSortie = async (req, res) => {
  try {
    const visite = await Visite.findById(req.params.id)
      .populate('visiteurId')
      .populate('agentId', 'nom prenom email')
      .populate('entrepriseId', 'nom code');

    if (!visite) return res.status(404).json({ success: false, message: 'Visite introuvable.' });
    if (visite.statut === 'TERMINE') return res.status(400).json({ success: false, message: 'Visite déjà terminée.' });

    visite.heureSortie = new Date();
    visite.statut = 'TERMINE';
    await visite.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('visite:sortie', visite);
    }

    const dureeMinutes = Math.round((new Date() - new Date(visite.heureEntree)) / 60000);
    res.json({ success: true, message: `Sortie enregistrée. Durée : ${dureeMinutes} min.`, visite });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const listerVisites = async (req, res) => {
  try {
    const { statut, date } = req.query;
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;

    const filtre = construireFiltrePérimètre(req);

    if (statut) filtre.statut = statut;
    if (date) {
      const debut = new Date(date);
      const fin   = new Date(date);
      fin.setHours(23, 59, 59, 999);
      filtre.heureEntree = { $gte: debut, $lte: fin };
    }

    const [total, visites] = await Promise.all([
      Visite.countDocuments(filtre),
      Visite.find(filtre)
        .populate('visiteurId')
        .populate('agentId', 'nom prenom email role entrepriseId')
        .populate('entrepriseId')
        .sort({ heureEntree: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    const visitesEnrichies = await Promise.all(
      visites.map(async v => {
        const vObj = v.toObject();
        let ent = vObj.entrepriseId;

        if (!ent || !ent.nom) {
          ent = await resoudreEntreprise(v);
        }

        vObj.entrepriseId = ent || null;
        vObj.entrepriseNom = ent?.nom || 'Entreprise Principale';
        vObj.entrepriseCode = ent?.code || '';
        vObj.entreprise = ent || null;
        return vObj;
      })
    );

    res.json({ success: true, total, page, pages: Math.ceil(total / limit), visites: visitesEnrichies });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const visitesEnCours = async (req, res) => {
  try {
    const filtre = construireFiltrePérimètre(req);
    filtre.statut = 'EN_COURS';

    const visites = await Visite.find(filtre)
      .populate('visiteurId')
      .populate('agentId', 'nom prenom email role entrepriseId')
      .populate('entrepriseId')
      .sort({ heureEntree: -1 });

    const visitesEnrichies = await Promise.all(
      visites.map(async v => {
        const vObj = v.toObject();
        let ent = vObj.entrepriseId;

        if (!ent || !ent.nom) {
          ent = await resoudreEntreprise(v);
        }

        vObj.entrepriseId = ent || null;
        vObj.entrepriseNom = ent?.nom || 'Entreprise Principale';
        vObj.entrepriseCode = ent?.code || '';
        vObj.entreprise = ent || null;
        return vObj;
      })
    );

    res.json({ success: true, total: visitesEnrichies.length, visites: visitesEnrichies });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const supprimerVisite = async (req, res) => {
  try {
    const user = req.utilisateur;
    const visite = await Visite.findById(req.params.id);
    if (!visite) {
      return res.status(404).json({ success: false, message: 'Visite introuvable.' });
    }

    if (user.role === 'AGENT' && String(visite.agentId) !== String(user._id)) {
      return res.status(403).json({ success: false, message: 'Un agent ne peut supprimer que ses propres visites.' });
    }

    if (user.role === 'ADMIN') {
      const entId = user.entrepriseId?._id || user.entrepriseId;
      if (String(visite.entrepriseId) !== String(entId)) {
        return res.status(403).json({ success: false, message: 'Vous ne pouvez supprimer que les visites de votre entreprise.' });
      }
    }

    await Visite.findByIdAndDelete(req.params.id);

    const io = req.app.get('io');
    if (io) {
      io.emit('visite:supprimee', { id: req.params.id });
    }

    res.json({ success: true, message: 'Visite supprimée avec succès.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const creerRendezVous = async (req, res) => {
  try {
    const {
      visiteurId,
      nom, prenom, telephone, numeroPiece, nin, typePiece,
      personneVisitee, service, motif, notes, dateRendezVous
    } = req.body;
    const user = req.utilisateur;

    if (!personneVisitee || !service || !dateRendezVous) {
      return res.status(400).json({
        success: false,
        message: 'La personne visitée, le service et la date du rendez-vous sont requis.'
      });
    }

    let visiteur = null;

    if (visiteurId) {
      visiteur = await Visiteur.findById(visiteurId);
    }

    if (!visiteur && (nin || numeroPiece || telephone)) {
      const searchConditions = [];
      if (nin && String(nin).trim()) searchConditions.push({ nin: String(nin).trim() });
      if (numeroPiece && String(numeroPiece).trim()) searchConditions.push({ numeroPiece: String(numeroPiece).trim() });
      if (telephone && String(telephone).trim()) searchConditions.push({ telephone: String(telephone).trim() });

      if (searchConditions.length > 0) {
        visiteur = await Visiteur.findOne({ $or: searchConditions });
      }
    }

    if (!visiteur) {
      if (!nom || !prenom) {
        return res.status(400).json({
          success: false,
          message: 'Informations du visiteur incomplètes. Veuillez fournir au moins le nom et le prénom ou un visiteur existant.'
        });
      }

      let cleanNumPiece = numeroPiece ? String(numeroPiece).trim() : null;
      let cleanNin = nin ? String(nin).trim() : null;

      if (!cleanNumPiece || cleanNumPiece.toLowerCase() === 'undefined' || cleanNumPiece.toLowerCase() === 'null') {
        if (cleanNin) {
          cleanNumPiece = `NIN-${cleanNin.replace(/\D/g, '')}`;
        } else if (telephone) {
          cleanNumPiece = `TEL-${String(telephone).replace(/\D/g, '')}`;
        } else {
          cleanNumPiece = `VIS-${Date.now()}`;
        }
      }

      const entrepriseId = req.body.entrepriseId || user?.entrepriseId?._id || user?.entrepriseId || null;

      visiteur = await Visiteur.create({
        nom,
        prenom,
        telephone,
        numeroPiece: cleanNumPiece,
        nin: cleanNin,
        typePiece: typePiece || 'CNI',
        entrepriseId,
        creeParAgentId: user?._id || null,
      });
    }

    const agentId = user?._id || null;
    let targetEntrepriseId = req.body.entrepriseId || user?.entrepriseId?._id || user?.entrepriseId || visiteur?.entrepriseId || null;
    if (!targetEntrepriseId) {
      const premiereEnt = await Entreprise.findOne({ statut: 'ACTIF' }).sort({ createdAt: 1 }) || await Entreprise.findOne().sort({ createdAt: 1 });
      if (premiereEnt) targetEntrepriseId = premiereEnt._id;
    }

    const meRendezVous = await Visite.create({
      visiteurId: visiteur._id,
      agentId,
      entrepriseId: targetEntrepriseId,
      personneVisitee,
      service,
      motif,
      notes,
      dateRendezVous: new Date(dateRendezVous),
      heureEntree: null,
      statut: 'PROGRAMME',
    });

    const rendezVousPopule = await Visite.findById(meRendezVous._id)
      .populate('visiteurId')
      .populate('agentId', 'nom prenom email role entrepriseId')
      .populate('entrepriseId');

    let ent = rendezVousPopule.entrepriseId;
    if (!ent || !ent.nom) {
      ent = await resoudreEntreprise(rendezVousPopule);
    }

    const rendezVousObj = rendezVousPopule.toObject();
    rendezVousObj.entrepriseId = ent || null;
    rendezVousObj.entrepriseNom = ent?.nom || 'Entreprise Principale';
    rendezVousObj.entrepriseCode = ent?.code || '';
    rendezVousObj.entreprise = ent || null;

    const io = req.app.get('io');
    if (io) {
      io.emit('rendezvous:cree', rendezVousObj);
    }

    res.status(201).json({
      success: true,
      message: 'Rendez-vous créé avec succès.',
      rendezVous: rendezVousObj,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const listerRendezVous = async (req, res) => {
  try {
    const { date } = req.query;
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;

    const filtre = construireFiltrePérimètre(req);
    filtre.statut = 'PROGRAMME';

    if (date) {
      const debut = new Date(date);
      const fin   = new Date(date);
      fin.setHours(23, 59, 59, 999);
      filtre.dateRendezVous = { $gte: debut, $lte: fin };
    }

    const [total, rendezVous] = await Promise.all([
      Visite.countDocuments(filtre),
      Visite.find(filtre)
        .populate('visiteurId')
        .populate('agentId', 'nom prenom email role entrepriseId')
        .populate('entrepriseId')
        .sort({ dateRendezVous: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    const rendezVousEnrichis = await Promise.all(
      rendezVous.map(async rdv => {
        const rdvObj = rdv.toObject();
        let ent = rdvObj.entrepriseId;

        if (!ent || !ent.nom) {
          ent = await resoudreEntreprise(rdv);
        }

        rdvObj.entrepriseId = ent || null;
        rdvObj.entrepriseNom = ent?.nom || 'Entreprise Principale';
        rdvObj.entrepriseCode = ent?.code || '';
        rdvObj.entreprise = ent || null;
        return rdvObj;
      })
    );

    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      rendezVous: rendezVousEnrichis,
      visites: rendezVousEnrichis
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const validerEntreeRendezVous = async (req, res) => {
  try {
    const user = req.utilisateur;
    const meRendezVous = await Visite.findById(req.params.id);

    if (!meRendezVous) {
      return res.status(404).json({ success: false, message: 'Rendez-vous introuvable.' });
    }

    if (meRendezVous.statut !== 'PROGRAMME') {
      return res.status(400).json({
        success: false,
        message: `Impossible de valider ce rendez-vous. Statut actuel: ${meRendezVous.statut}`
      });
    }

    let visiteur = null;
    if (meRendezVous.visiteurId) {
      visiteur = await Visiteur.findById(meRendezVous.visiteurId);
    }

    if (!visiteur) {
      const nom = req.body.nom || req.body.visiteurNom || 'Visiteur';
      const prenom = req.body.prenom || req.body.visiteurPrenom || 'RDV';
      const entrepriseId = user?.entrepriseId?._id || user?.entrepriseId || meRendezVous.entrepriseId || null;

      visiteur = await Visiteur.create({
        nom,
        prenom,
        numeroPiece: `RDV-${Date.now()}`,
        typePiece: 'CNI',
        entrepriseId,
        creeParAgentId: user?._id || null,
      });

      meRendezVous.visiteurId = visiteur._id;
    }

    const visiteEnCours = await Visite.findOne({
      visiteurId: visiteur._id,
      statut: 'EN_COURS',
      _id: { $ne: meRendezVous._id }
    });

    if (visiteEnCours) {
      return res.status(409).json({
        success: false,
        message: "Ce visiteur a déjà une visite en cours.",
        visiteEnCours
      });
    }

    meRendezVous.statut = 'EN_COURS';
    meRendezVous.heureEntree = new Date();
    await meRendezVous.save();

    const visitePopulee = await Visite.findById(meRendezVous._id)
      .populate('visiteurId')
      .populate('agentId', 'nom prenom email')
      .populate('entrepriseId', 'nom code');

    const io = req.app.get('io');
    if (io) {
      io.emit('visite:entree', visitePopulee);
    }

    res.json({
      success: true,
      message: `Entrée du rendez-vous validée à ${new Date().toLocaleTimeString('fr-SN')}`,
      visite: visitePopulee,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const annulerRendezVous = async (req, res) => {
  try {
    const meRendezVous = await Visite.findById(req.params.id);

    if (!meRendezVous) {
      return res.status(404).json({ success: false, message: 'Rendez-vous introuvable.' });
    }

    if (meRendezVous.statut !== 'PROGRAMME') {
      return res.status(400).json({
        success: false,
        message: `Seuls les rendez-vous programmés peuvent être annulés. Statut actuel: ${meRendezVous.statut}`
      });
    }

    meRendezVous.statut = 'ANNULE';
    await meRendezVous.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('rendezvous:annule', meRendezVous);
    }

    res.json({
      success: true,
      message: 'Rendez-vous annulé avec succès.',
      visite: meRendezVous,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  enregistrerEntree,
  enregistrerSortie,
  listerVisites,
  visitesEnCours,
  supprimerVisite,
  creerRendezVous,
  listerRendezVous,
  validerEntreeRendezVous,
  annulerRendezVous,
};