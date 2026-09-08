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
 * Recherche un visiteur existant par son NIN (Numéro d'Identification National) ou numéro de pièce
 */
const rechercherParNIN = async (req, res) => {
  try {
    const queryNin = req.query.nin || req.query.q || req.query.telephone || req.query.phone;
    if (!queryNin) {
      return res.status(400).json({ success: false, message: 'Le NIN est requis.' });
    }

    const rawQuery = String(queryNin).trim();
    const digitsOnly = rawQuery.replace(/\D/g, '');

    const filtre = {
      $or: [
        { nin: rawQuery },
        ...(digitsOnly.length >= 5 ? [{ nin: { $regex: digitsOnly, $options: 'i' } }] : []),
        { numeroPiece: rawQuery }
      ]
    };

    const visiteur = await Visiteur.findOne(filtre);

    if (!visiteur) {
      return res.status(404).json({
        success: false,
        message: 'Aucun visiteur trouvé avec ce NIN.'
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

    let existeDeja = null;

    // 1. Recherche prioritaire par NIN
    if (cleanNin) {
      const ninDigits = cleanNin.replace(/\D/g, '');
      existeDeja = await Visiteur.findOne({
        $or: [
          { nin: cleanNin },
          ...(ninDigits.length >= 6 ? [{ nin: { $regex: ninDigits, $options: 'i' } }] : [])
        ]
      });
    }

    // 2. Fallback recherche par Numéro de pièce
    if (!existeDeja && cleanNumPiece) {
      existeDeja = await Visiteur.findOne({ numeroPiece: cleanNumPiece });
    }

    if (existeDeja) {
      let modified = false;
      if (cleanNin && !existeDeja.nin) {
        existeDeja.nin = cleanNin;
        modified = true;
      }
      if (telephone && !existeDeja.telephone) {
        existeDeja.telephone = telephone;
        modified = true;
      }
      if (modified) await existeDeja.save();

      return res.status(200).json({
        success: true,
        message: 'Visiteur déjà enregistré.',
        visiteur: existeDeja,
        estNouveau: false,
        id: existeDeja._id
      });
    }

    const visiteur = await Visiteur.create({
      nom: nom || 'Visiteur',
      prenom: prenom || 'Anonyme',
      dateNaissance,
      lieuNaissance,
      sexe,
      taille,
      numeroPiece: cleanNumPiece,
      typePiece: typePiece || 'CNI',
      dateDelivrance,
      dateExpiration,
      centreEnregistrement,
      adresseDomicile,
      nin: cleanNin,
      telephone
    });

    res.status(201).json({
      success: true,
      message: 'Visiteur créé.',
      visiteur,
      id: visiteur._id,
      estNouveau: true
    });
  } catch (err) {
    console.error('❌ Erreur creerVisiteur :', err.message);
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
  rechercherParNIN,
  rechercherParTelephone: rechercherParNIN,
  listerVisiteurs,
  getVisiteur,
  modifierVisiteur,
  supprimerVisiteur
};