const BugReport = require('../models/BugReport');

/**
 * Créer un nouveau signalement de bug / problème
 */
exports.creerBug = async (req, res) => {
  try {
    const { titre, description, priorite } = req.body;

    if (!titre || !titre.trim() || !description || !description.trim()) {
      return res.status(400).json({ success: false, message: 'Le titre et la description sont obligatoires.' });
    }

    const utilisateur = req.utilisateur;
    let entrepriseId = null;
    let entrepriseNom = '';

    if (utilisateur.entrepriseId) {
      if (typeof utilisateur.entrepriseId === 'object') {
        entrepriseId = utilisateur.entrepriseId._id;
        entrepriseNom = utilisateur.entrepriseId.nom || '';
      } else {
        entrepriseId = utilisateur.entrepriseId;
      }
    }

    const bug = new BugReport({
      titre: titre.trim(),
      description: description.trim(),
      priorite: priorite || 'MOYENNE',
      statut: 'OUVERT',
      signaleParId: utilisateur._id,
      roleSignaleur: utilisateur.role,
      nomSignaleur: `${utilisateur.prenom || ''} ${utilisateur.nom || ''}`.trim(),
      entrepriseId,
      entrepriseNom,
      transmisAuSuperAdmin: true, // Toujours transmis au SuperAdmin
    });

    await bug.save();

    // Notification Socket.IO temps réel
    const io = req.app.get('io');
    if (io) {
      io.emit('bug:created', bug);
    }

    return res.status(201).json({
      success: true,
      message: 'Votre signalement de bug a été transmis avec succès au SuperAdmin.',
      bug,
    });
  } catch (err) {
    console.error('Erreur creerBug :', err);
    return res.status(500).json({ success: false, message: 'Erreur lors de la création du signalement de bug.' });
  }
};

/**
 * Lister les bugs selon le rôle de l'utilisateur
 */
exports.listerBugs = async (req, res) => {
  try {
    const { role, _id: userId, entrepriseId: userEnt } = req.utilisateur;
    const { statut, priorite, entrepriseId: queryEnt } = req.query;

    let filter = {};

    if (role === 'SUPER_ADMIN' || role === 'SUPERADMIN') {
      // SuperAdmin voit tous les bugs ou par entreprise filtrée
      if (queryEnt) filter.entrepriseId = queryEnt;
    } else if (role === 'ADMIN') {
      // Admin voit les bugs de son entreprise et les siennes
      let entId = userEnt ? (userEnt._id ? userEnt._id : userEnt) : null;
      if (entId) {
        filter.$or = [{ entrepriseId: entId }, { signaleParId: userId }];
      } else {
        filter.signaleParId = userId;
      }
    } else {
      // Agent voit uniquement les bugs qu'il a signalés
      filter.signaleParId = userId;
    }

    if (statut) filter.statut = statut;
    if (priorite) filter.priorite = priorite;

    const bugs = await BugReport.find(filter)
      .populate('signaleParId', 'prenom nom email role')
      .populate('entrepriseId', 'nom code')
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      total: bugs.length,
      bugs,
    });
  } catch (err) {
    console.error('Erreur listerBugs :', err);
    return res.status(500).json({ success: false, message: 'Erreur lors de la récupération des signalements de bugs.' });
  }
};

/**
 * Répondre à un bug ou changer son statut (SuperAdmin & Admin)
 */
exports.repondreBug = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, nouveauStatut } = req.body;

    const bug = await BugReport.findById(id);
    if (!bug) {
      return res.status(404).json({ success: false, message: 'Signalement de bug introuvable.' });
    }

    const userRole = req.utilisateur.role;
    const isSuperAdmin = userRole === 'SUPER_ADMIN' || userRole === 'SUPERADMIN';

    const userEnt = req.utilisateur.entrepriseId;
    const userEntId = userEnt ? (userEnt._id ? userEnt._id.toString() : userEnt.toString()) : null;

    const isSignaleur = bug.signaleParId && bug.signaleParId.toString() === req.utilisateur._id.toString();
    const isSameCompany = bug.entrepriseId && userEntId && bug.entrepriseId.toString() === userEntId;

    if (!isSuperAdmin && !isSameCompany && !isSignaleur) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé à ce signalement.' });
    }

    if (message && message.trim()) {
      const repObj = {
        auteurId: req.utilisateur._id,
        nomAuteur: `${req.utilisateur.prenom || ''} ${req.utilisateur.nom || ''}`.trim() || 'Utilisateur',
        roleAuteur: userRole,
        message: message.trim(),
        createdAt: new Date(),
      };

      bug.reponses.push(repObj);

      if (isSuperAdmin) {
        bug.reponseSuperAdmin = message.trim();
        bug.transmisAuSuperAdmin = true;
      }

      // Si aucune demande explicite de nouveauStatut n'est fournie, passer automatiquement
      // de 'OUVERT' à 'EN_COURS' lors de la première réponse
      if (bug.statut === 'OUVERT' && !nouveauStatut) {
        bug.statut = 'EN_COURS';
      }
    }

    if (nouveauStatut && ['OUVERT', 'EN_COURS', 'RESOLU', 'FERME'].includes(nouveauStatut)) {
      bug.statut = nouveauStatut;
    }

    await bug.save();

    const updatedBug = await BugReport.findById(bug._id)
      .populate('signaleParId', 'prenom nom email role')
      .populate('entrepriseId', 'nom code');

    // Notifier via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('bug:updated', updatedBug);
    }

    return res.json({
      success: true,
      message: 'Réponse enregistrée et statut mis à jour avec succès.',
      bug: updatedBug || bug,
    });
  } catch (err) {
    console.error('Erreur repondreBug :', err);
    return res.status(500).json({ success: false, message: 'Erreur lors de l\'enregistrement de la réponse.' });
  }
};

/**
 * Transmettre ou escalader explicitement au SuperAdmin
 */
exports.transmettreSuperAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const bug = await BugReport.findById(id);

    if (!bug) {
      return res.status(404).json({ success: false, message: 'Bug introuvable.' });
    }

    bug.transmisAuSuperAdmin = true;
    await bug.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('bug:updated', bug);
    }

    return res.json({
      success: true,
      message: 'Signalement transmis au SuperAdmin avec succès.',
      bug,
    });
  } catch (err) {
    console.error('Erreur transmettreSuperAdmin :', err);
    return res.status(500).json({ success: false, message: 'Erreur lors de la transmission.' });
  }
};
