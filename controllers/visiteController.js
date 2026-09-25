const { Visite, Visiteur } = require('../models');

const construireFiltrePérimètre = (req) => {
  const user = req.utilisateur;
  const filtre = {};

  if (!user) return filtre;

  if (user.role === 'SUPER_ADMIN') {
    if (req.query.entrepriseId) filtre.entrepriseId = req.query.entrepriseId;
    if (req.query.agentId) filtre.agentId = req.query.agentId;
  } else if (user.role === 'ADMIN') {
    const entId = user.entrepriseId?._id || user.entrepriseId;
    if (entId) filtre.entrepriseId = entId;
    if (req.query.agentId) filtre.agentId = req.query.agentId;
  } else {
    // AGENT: voit uniquement son propre historique de visites enregistrées
    filtre.agentId = user._id;
  }

  return filtre;
};

const enregistrerEntree = async (req, res) => {
  try {
    const { visiteurId, personneVisitee, service, motif } = req.body;
    const user = req.utilisateur;

    const visiteur = await Visiteur.findById(visiteurId);
    if (!visiteur) return res.status(404).json({ success: false, message: 'Visiteur introuvable.' });

    const visiteEnCours = await Visite.findOne({ visiteurId, statut: 'EN_COURS' });
    if (visiteEnCours) {
      return res.status(409).json({ success: false, message: "Ce visiteur est déjà à l'intérieur.", visiteEnCours });
    }

    const agentId = user?._id || null;
    const entrepriseId = user?.entrepriseId?._id || user?.entrepriseId || null;

    const visite = await Visite.create({
      visiteurId,
      agentId,
      entrepriseId,
      personneVisitee,
      service,
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
        .populate('agentId', 'nom prenom email')
        .populate('entrepriseId', 'nom code')
        .sort({ heureEntree: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    res.json({ success: true, total, page, pages: Math.ceil(total / limit), visites });
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
      .populate('agentId', 'nom prenom email')
      .populate('entrepriseId', 'nom code')
      .sort({ heureEntree: -1 });

    res.json({ success: true, total: visites.length, visites });
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

module.exports = {
  enregistrerEntree,
  enregistrerSortie,
  listerVisites,
  visitesEnCours,
  supprimerVisite,
};