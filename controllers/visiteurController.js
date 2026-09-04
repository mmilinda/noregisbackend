/**
 * Construit un regex flexible pour faire correspondre les numéros de téléphone
 * peu importe les espaces, tirets ou indicatifs (+221, 00221, etc.)
 */
const construireRegexTelephone = (queryTel) => {
  if (!queryTel) return null;
  const digitsOnly = String(queryTel).replace(/\D/g, '');
  if (digitsOnly.length < 6) return null;
  const lastDigits = digitsOnly.slice(-8);
  const regexPattern = lastDigits.split('').join('[\\s.-]*');
  return new RegExp(regexPattern, 'i');
};

/**
 * Recherche un visiteur existant par son numéro de téléphone
 */
const rechercherParTelephone = async (req, res) => {
  try {
    const queryTel = req.query.telephone || req.query.phone || req.query.q;
    if (!queryTel) {
      return res.status(400).json({ success: false, message: 'Le numéro de téléphone est requis.' });
    }

    const regexTel = construireRegexTelephone(queryTel);
    const filtre = regexTel 
      ? {
          $or: [
            { telephone: { $regex: regexTel } },
            { telephone: String(queryTel).trim() },
            { numeroPiece: String(queryTel).trim() }
          ]
        }
      : { telephone: String(queryTel).trim() };

    const visiteur = await Visiteur.findOne(filtre);

    if (!visiteur) {
      return res.status(404).json({
        success: false,
        message: 'Aucun visiteur trouvé avec ce numéro de téléphone.'
      });
    }

    return res.json({
      success: true,
      message: 'Visiteur existant trouvé dans la base de données.',
      visiteur
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

const creerVisiteur = async (req, res) => {
  try {
    const {
      nom, prenom, dateNaissance, lieuNaissance, sexe, taille,
      numeroPiece, typePiece, dateDelivrance, dateExpiration,
      centreEnregistrement, adresseDomicile,
      nin, telephone
    } = req.body;

    let existeDeja = null;
    if (numeroPiece) {
      existeDeja = await Visiteur.findOne({ numeroPiece });
    }
    if (!existeDeja && telephone) {
      const regexTel = construireRegexTelephone(telephone);
      if (regexTel) {
        existeDeja = await Visiteur.findOne({ telephone: { $regex: regexTel } });
      }
    }

    if (existeDeja) {
      if (telephone && !existeDeja.telephone) {
        existeDeja.telephone = telephone;
        await existeDeja.save();
      }
      return res.status(200).json({
        success: true,
        message: 'Visiteur déjà enregistré.',
        visiteur: existeDeja,
        estNouveau: false,
        id: existeDeja._id
      });
    }

    const visiteur = await Visiteur.create({
      nom, prenom, dateNaissance, lieuNaissance, sexe, taille,
      numeroPiece, typePiece, dateDelivrance, dateExpiration,
      centreEnregistrement, adresseDomicile,
      nin, telephone
    });

    res.status(201).json({
      success: true,
      message: 'Visiteur créé.',
      visiteur,
      id: visiteur._id,
      estNouveau: true
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const listerVisiteurs = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;
    const [total, visiteurs] = await Promise.all([
      Visiteur.countDocuments(),
      Visiteur.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    ]);
    res.json({ success: true, total, page, pages: Math.ceil(total / limit), visiteurs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getVisiteur = async (req, res) => {
  try {
    const visiteur = await Visiteur.findById(req.params.id);
    if (!visiteur) return res.status(404).json({ success: false, message: 'Visiteur introuvable.' });
    const [visites, documents] = await Promise.all([
      Visite.find({ visiteurId: visiteur._id }).sort({ heureEntree: -1 }),
      Document.find({ visiteurId: visiteur._id }),
    ]);
    res.json({ success: true, visiteur: { ...visiteur.toObject(), visites, documents } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const modifierVisiteur = async (req, res) => {
  try {
    const visiteur = await Visiteur.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!visiteur) return res.status(404).json({ success: false, message: 'Visiteur introuvable.' });
    res.json({ success: true, message: 'Visiteur mis à jour.', visiteur });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 👇 NOUVELLE FONCTION : suppression en cascade
const supprimerVisiteur = async (req, res) => {
  try {
    const visiteurId = req.params.id;

    const visiteur = await Visiteur.findById(visiteurId);
    if (!visiteur) {
      return res.status(404).json({ success: false, message: 'Visiteur introuvable.' });
    }

    // Supprimer toutes les visites et documents liés
    await Promise.all([
      Visite.deleteMany({ visiteurId }),
      Document.deleteMany({ visiteurId })
    ]);

    // Supprimer le visiteur
    await Visiteur.findByIdAndDelete(visiteurId);

    res.json({
      success: true,
      message: 'Visiteur et toutes ses données associées supprimés avec succès.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  creerVisiteur,
  rechercherParTelephone,
  listerVisiteurs,
  getVisiteur,
  modifierVisiteur,
  supprimerVisiteur
};