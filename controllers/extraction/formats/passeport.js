// Passeport (biométrique ou non), toutes nationalités.
// Deux sources d'information, dans l'ordre de fiabilité :
//   1. La Zone de Lecture Automatique (MRZ, norme ICAO 9303) — standardisée mondialement,
//      indépendante de la langue et de la mise en page du passeport.
//   2. Les libellés imprimés (français/anglais, bilingues sur la plupart des passeports CEDEAO).
const {
  extraireValeurParmiLabels,
  extraireDateDDMMYYYY,
  nettoyer,
  infosVides,
  analyserMRZ,
} = require('../helpers');

const detect = (ocrText) => {
  const upper = ocrText.toUpperCase();
  if (upper.includes('PASSEPORT') || upper.includes('PASSPORT')) return true;
  // Repli sur la détection de la MRZ seule (cas où l'OCR rate les libellés imprimés)
  return !!analyserMRZ(ocrText);
};

const extract = (ocrText, lignes) => {
  const infos = infosVides();
  infos.typePiece = 'PASSEPORT';

  const mrz = analyserMRZ(ocrText);

  infos.numeroPiece = extraireValeurParmiLabels(
    ['Passeport No', 'N° du Passeport', 'No du Passeport', 'N° Passeport', 'Passport No', 'Document No'],
    lignes
  ) || (mrz && mrz.numeroPiece) || null;

  infos.nom = extraireValeurParmiLabels(['Nom', 'Surname', 'Nom de famille'], lignes) ||
              (mrz && mrz.nom) || null;

  infos.prenom = extraireValeurParmiLabels(['Prénom', 'Given Name', 'First Name', 'Prénom usuel'], lignes) ||
                 (mrz && mrz.prenom) || null;

  infos.lieuNaissance = extraireValeurParmiLabels(
    ['Lieu de naissance', 'Né(e) à', 'Place of Birth', 'Lieu naissance'],
    lignes
  );

  // "Autorité"/"Lieu de délivrance" (Authority/Place of Issue sur la page ICAO 9303) —
  // pas d'équivalent dédié dans le modèle, on réutilise centreEnregistrement (même rôle
  // que sur une CNI : l'organisme/lieu qui a émis le document).
  infos.centreEnregistrement = extraireValeurParmiLabels(
    ['Autorité', 'Authority', 'Lieu de délivrance', "Lieu d'émission", 'Place of Issue', 'Autorité de délivrance'],
    lignes
  );

  const dateNaissanceTexte = extraireValeurParmiLabels(['Date de naissance', 'Né(e) le', 'Date of Birth'], lignes);
  infos.dateNaissance = extraireDateDDMMYYYY(dateNaissanceTexte) || (mrz && mrz.dateNaissance) || null;

  const dateDelivranceTexte = extraireValeurParmiLabels(["Date de délivrance", "Date d'établissement", 'Date of Issue'], lignes);
  infos.dateDelivrance = extraireDateDDMMYYYY(dateDelivranceTexte);

  const dateExpirationTexte = extraireValeurParmiLabels(["Date d'expiration", 'Date de validité', 'Date of Expiry'], lignes);
  infos.dateExpiration = extraireDateDDMMYYYY(dateExpirationTexte) || (mrz && mrz.dateExpiration) || null;

  const sexeTexte = extraireValeurParmiLabels(['Sexe', 'Sex', 'Genre'], lignes);
  infos.sexe = (sexeTexte ? sexeTexte.trim().charAt(0).toUpperCase() : null) || (mrz && mrz.sexe) || null;

  infos.nom = nettoyer(infos.nom);
  infos.prenom = nettoyer(infos.prenom);
  infos.lieuNaissance = nettoyer(infos.lieuNaissance);
  infos.centreEnregistrement = nettoyer(infos.centreEnregistrement);

  return mrz && mrz.nationalite ? { ...infos, nationalite: mrz.nationalite } : infos;
};

module.exports = { id: 'PASSEPORT', label: 'Passeport (MRZ)', detect, extract };
