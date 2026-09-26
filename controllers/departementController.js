const Departement = require('../models/Departement');

const DEFAULT_DEPARTEMENTS = [
  { nom: 'Direction Générale', code: 'DIR-GEN', description: 'Direction générale et exécutif' },
  { nom: 'Ressources Humaines', code: 'RH', description: 'Gestion du personnel et du recrutement' },
  { nom: 'Comptabilité & Finances', code: 'FIN-CPT', description: 'Finances, comptabilité et trésorerie' },
  { nom: 'Informatique & DSI', code: 'DSI-IT', description: 'Systèmes d\'information, réseaux et support IT' },
  { nom: 'Logistique & Sécurité', code: 'LOG-SEC', description: 'Gestion logistique, approvisionnements et sécurité' },
  { nom: 'Commercial & Marketing', code: 'COM-MKT', description: 'Ventes, relation client et communication' },
  { nom: 'Accueil / Réception', code: 'ACC-REC', description: 'Guichet d\'accueil et orientation des visiteurs' },
];

/**
 * Lister les départements de l'entreprise
 */
exports.listerDepartements = async (req, res) => {
  try {
    const userRole = req.utilisateur.role;
    let entrepriseId = req.utilisateur.entrepriseId
      ? (req.utilisateur.entrepriseId._id ? req.utilisateur.entrepriseId._id.toString() : req.utilisateur.entrepriseId.toString())
      : null;

    let filter = {};

    if (userRole === 'SUPER_ADMIN') {
      if (req.query.entrepriseId) {
        filter.entrepriseId = req.query.entrepriseId;
      }
    } else {
      if (!entrepriseId) {
        return res.status(400).json({ success: false, message: 'Aucune entreprise rattachée à cet utilisateur.' });
      }
      filter.entrepriseId = entrepriseId;
    }

    let departements = await Departement.find(filter).sort({ nom: 1 });

    // Si l'entreprise n'a pas encore de département configuré et qu'un filtre entrepriseId est actif, on initialise les départements par défaut
    if (departements.length === 0 && filter.entrepriseId) {
      const seedDocs = DEFAULT_DEPARTEMENTS.map(d => ({
        ...d,
        entrepriseId: filter.entrepriseId,
        statut: 'ACTIF'
      }));
      await Departement.insertMany(seedDocs);
      departements = await Departement.find(filter).sort({ nom: 1 });
    }

    return res.json({
      success: true,
      total: departements.length,
      departements,
    });
  } catch (err) {
    console.error('Erreur listerDepartements :', err);
    return res.status(500).json({ success: false, message: 'Erreur lors de la récupération des départements.' });
  }
};

/**
 * Créer un nouveau département
 */
exports.creerDepartement = async (req, res) => {
  try {
    const { nom, code, description, statut, entrepriseId: targetEntrepriseId } = req.body;

    if (!nom || !nom.trim()) {
      return res.status(400).json({ success: false, message: 'Le nom du département est requis.' });
    }

    let entrepriseId = req.utilisateur.entrepriseId
      ? (req.utilisateur.entrepriseId._id ? req.utilisateur.entrepriseId._id.toString() : req.utilisateur.entrepriseId.toString())
      : null;

    if (req.utilisateur.role === 'SUPER_ADMIN' && targetEntrepriseId) {
      entrepriseId = targetEntrepriseId;
    }

    if (!entrepriseId) {
      return res.status(400).json({ success: false, message: 'Entreprise obligatoire pour créer un département.' });
    }

    // Vérifier l'unicité du nom dans cette entreprise
    const existant = await Departement.findOne({
      entrepriseId,
      nom: { $regex: new RegExp(`^${nom.trim()}$`, 'i') }
    });

    if (existant) {
      return res.status(400).json({ success: false, message: 'Un département avec ce nom existe déjà dans votre entreprise.' });
    }

    const nouveauDepartement = new Departement({
      nom: nom.trim(),
      code: code ? code.trim().toUpperCase() : '',
      description: description ? description.trim() : '',
      entrepriseId,
      statut: statut || 'ACTIF',
    });

    await nouveauDepartement.save();

    return res.status(201).json({
      success: true,
      message: 'Département créé avec succès.',
      departement: nouveauDepartement,
    });
  } catch (err) {
    console.error('Erreur creerDepartement :', err);
    return res.status(500).json({ success: false, message: 'Erreur lors de la création du département.' });
  }
};

/**
 * Modifier un département existant
 */
exports.modifierDepartement = async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, code, description, statut } = req.body;

    const departement = await Departement.findById(id);
    if (!departement) {
      return res.status(404).json({ success: false, message: 'Département introuvable.' });
    }

    // Vérifier les droits (Admin ne peut modifier que ceux de sa propre entreprise)
    let userEntrepriseId = req.utilisateur.entrepriseId
      ? (req.utilisateur.entrepriseId._id ? req.utilisateur.entrepriseId._id.toString() : req.utilisateur.entrepriseId.toString())
      : null;

    if (req.utilisateur.role !== 'SUPER_ADMIN' && departement.entrepriseId.toString() !== userEntrepriseId) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé à ce département.' });
    }

    if (nom && nom.trim()) {
      const existant = await Departement.findOne({
        _id: { $ne: id },
        entrepriseId: departement.entrepriseId,
        nom: { $regex: new RegExp(`^${nom.trim()}$`, 'i') }
      });
      if (existant) {
        return res.status(400).json({ success: false, message: 'Un autre département avec ce nom existe déjà.' });
      }
      departement.nom = nom.trim();
    }

    if (code !== undefined) departement.code = code.trim().toUpperCase();
    if (description !== undefined) departement.description = description.trim();
    if (statut && ['ACTIF', 'DESACTIVE'].includes(statut)) departement.statut = statut;

    await departement.save();

    return res.json({
      success: true,
      message: 'Département mis à jour avec succès.',
      departement,
    });
  } catch (err) {
    console.error('Erreur modifierDepartement :', err);
    return res.status(500).json({ success: false, message: 'Erreur lors de la modification du département.' });
  }
};

/**
 * Supprimer un département
 */
exports.supprimerDepartement = async (req, res) => {
  try {
    const { id } = req.params;
    const departement = await Departement.findById(id);

    if (!departement) {
      return res.status(404).json({ success: false, message: 'Département introuvable.' });
    }

    let userEntrepriseId = req.utilisateur.entrepriseId
      ? (req.utilisateur.entrepriseId._id ? req.utilisateur.entrepriseId._id.toString() : req.utilisateur.entrepriseId.toString())
      : null;

    if (req.utilisateur.role !== 'SUPER_ADMIN' && departement.entrepriseId.toString() !== userEntrepriseId) {
      return res.status(403).json({ success: false, message: 'Accès non autorisé.' });
    }

    await Departement.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: 'Département supprimé avec succès.',
    });
  } catch (err) {
    console.error('Erreur supprimerDepartement :', err);
    return res.status(500).json({ success: false, message: 'Erreur lors de la suppression du département.' });
  }
};
