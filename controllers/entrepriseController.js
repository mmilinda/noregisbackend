const { Entreprise, Utilisateur, Visite } = require('../models');

const creerEntreprise = async (req, res) => {
  try {
    const { nom, code, adresse, telephone, emailContact } = req.body;
    if (!nom || !code) {
      return res.status(400).json({ success: false, message: 'Nom et code entreprise requis.' });
    }

    const existeCode = await Entreprise.findOne({ code: String(code).toUpperCase().trim() });
    if (existeCode) {
      return res.status(409).json({ success: false, message: 'Ce code entreprise existe déjà.' });
    }

    const entreprise = await Entreprise.create({
      nom: String(nom).trim(),
      code: String(code).toUpperCase().trim(),
      adresse: adresse || '',
      telephone: telephone || '',
      emailContact: emailContact || '',
      statut: 'ACTIF',
    });

    res.status(201).json({
      success: true,
      message: 'Entreprise créée avec succès.',
      entreprise,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const listerEntreprises = async (req, res) => {
  try {
    const entreprises = await Entreprise.find().sort({ createdAt: -1 });

    const statsPromesses = entreprises.map(async (ent) => {
      const [nbAdmins, nbAgents, nbVisites] = await Promise.all([
        Utilisateur.countDocuments({ entrepriseId: ent._id, role: 'ADMIN' }),
        Utilisateur.countDocuments({ entrepriseId: ent._id, role: 'AGENT' }),
        Visite.countDocuments({ entrepriseId: ent._id }),
      ]);
      return {
        ...ent.toObject(),
        nbAdmins,
        nbAgents,
        nbVisites,
      };
    });

    const resultats = await Promise.all(statsPromesses);

    res.json({
      success: true,
      entreprises: resultats,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const modifierEntreprise = async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, adresse, telephone, emailContact } = req.body;

    const entreprise = await Entreprise.findById(id);
    if (!entreprise) {
      return res.status(404).json({ success: false, message: 'Entreprise introuvable.' });
    }

    if (nom) entreprise.nom = String(nom).trim();
    if (adresse !== undefined) entreprise.adresse = adresse;
    if (telephone !== undefined) entreprise.telephone = telephone;
    if (emailContact !== undefined) entreprise.emailContact = emailContact;

    await entreprise.save();

    res.json({
      success: true,
      message: 'Entreprise mise à jour avec succès.',
      entreprise,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const changerStatutEntreprise = async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    if (!['ACTIF', 'SUSPENDU', 'DESACTIVE'].includes(statut)) {
      return res.status(400).json({ success: false, message: 'Statut invalide. Choisissez ACTIF, SUSPENDU ou DESACTIVE.' });
    }

    const entreprise = await Entreprise.findById(id);
    if (!entreprise) {
      return res.status(404).json({ success: false, message: 'Entreprise introuvable.' });
    }

    entreprise.statut = statut;
    await entreprise.save();

    // Mettre à jour le statutCompte des utilisateurs rattachés
    if (statut !== 'ACTIF') {
      await Utilisateur.updateMany(
        { entrepriseId: entreprise._id },
        { $set: { isActif: false } }
      );
    } else {
      await Utilisateur.updateMany(
        { entrepriseId: entreprise._id, statutCompte: 'ACTIF' },
        { $set: { isActif: true } }
      );
    }

    res.json({
      success: true,
      message: `Statut de l'entreprise mis à jour : ${statut}`,
      entreprise,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  creerEntreprise,
  listerEntreprises,
  modifierEntreprise,
  changerStatutEntreprise,
};
