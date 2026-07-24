// Passeport (biométrique ou non), toutes nationalités, tous continents.
// Deux sources d'information, dans l'ordre de fiabilité :
//   1. La Zone de Lecture Automatique (MRZ, norme ICAO 9303) — standardisée mondialement,
//      indépendante de la langue et de la mise en page du passeport. Fonctionne pour
//      n'importe quel pays émetteur, y compris ceux dont on ne reconnaît pas les libellés.
//   2. Les libellés imprimés, en couvrant les langues les plus courantes sur les pages
//      biographiques mondiales : français, anglais, espagnol, portugais, allemand, italien.
const {
  extraireValeurParmiLabels,
  extraireDateDDMMYYYY,
  extraireDatesMoisAbrege,
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

// Sur certains passeports, "Sexe", "Lieu de naissance" et "Autorité" (émettrice) sont
// imprimés en colonnes sur une seule ligne de valeurs ("M   KEUR MADIABEL   MINT/DGPN/DPETV"),
// avec un en-tête au-dessus trop dégradé par l'OCR pour être reconnu par libellé.
const extraireTrioSexeLieuAutorite = (ocrText) => {
  const match = ocrText.match(/\b([MF])\t([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\- ]*?)\t([A-Z0-9\/.\-]{3,})/);
  if (!match) return null;
  return { sexe: match[1], lieuNaissance: match[2].trim(), autorite: match[3].trim() };
};

// Repli quand libellé et MRZ échouent tous les deux (ligne 1 de la MRZ tronquée par l'OCR,
// libellé du numéro trop dégradé) : le numéro de passeport reste souvent lisible tel quel
// dans le texte brut (ex: "A03863136").
const extraireNumeroPasseport = (ocrText) => {
  const match = ocrText.match(/\b([A-Z]{1,2}\d{6,9})\b/);
  return match ? match[1] : null;
};

const extract = (ocrText, lignes) => {
  const infos = infosVides();
  infos.typePiece = 'PASSEPORT';

  const mrz = analyserMRZ(ocrText);
  const trio = extraireTrioSexeLieuAutorite(ocrText);
  const datesAbregees = extraireDatesMoisAbrege(ocrText);

  // La MRZ (norme ICAO 9303) est standardisée et bien plus fiable qu'un libellé imprimé
  // dégradé par l'OCR : quand elle est présente, on la préfère pour les champs qu'elle
  // encode, et on ne se rabat sur le libellé que si elle est absente. Sans ça, un libellé
  // mal reconnu (ex: "Prénom Oven Names" sans le "/" attendu) peut voler la valeur d'un
  // champ à la place d'une MRZ pourtant correcte.
  infos.numeroPiece = (mrz && mrz.numeroPiece) || extraireValeurParmiLabels(
    [
      'Passeport No', 'N° du Passeport', 'No du Passeport', 'N° Passeport', 'Passport No', 'Document No',
      'N° de Pasaporte', 'Número de Pasaporte', 'Número do Passaporte', 'Reisepass Nr', 'Passnummer',
      'Numero di Passaporto', 'N° del Passaporto',
    ],
    lignes
  ) || extraireNumeroPasseport(ocrText) || null;

  infos.nom = (mrz && mrz.nom) || extraireValeurParmiLabels(
    ['Nom', 'Surname', 'Nom de famille', 'Apellido', 'Apellidos', 'Sobrenome', 'Nachname', 'Cognome'],
    lignes
  ) || null;

  infos.prenom = (mrz && mrz.prenom) || extraireValeurParmiLabels(
    [
      'Prénom', 'Given Name', 'First Name', 'Prénom usuel', 'Nombre', 'Nombres',
      'Prenome', 'Vorname', 'Nome',
    ],
    lignes
  ) || null;

  infos.lieuNaissance = extraireValeurParmiLabels(
    [
      'Lieu de naissance', 'Né(e) à', 'Place of Birth', 'Lieu naissance',
      'Lugar de Nacimiento', 'Local de Nascimento', 'Geburtsort', 'Luogo di Nascita',
    ],
    lignes
  ) || (trio && trio.lieuNaissance) || null;

  // "Autorité"/"Lieu de délivrance" (Authority/Place of Issue sur la page ICAO 9303) —
  // pas d'équivalent dédié dans le modèle, on réutilise centreEnregistrement (même rôle
  // que sur une CNI : l'organisme/lieu qui a émis le document).
  infos.centreEnregistrement = extraireValeurParmiLabels(
    [
      'Autorité', 'Authority', 'Lieu de délivrance', "Lieu d'émission", 'Place of Issue', 'Autorité de délivrance',
      'Autoridad', 'Autoridade', 'Behörde', 'Autorità',
    ],
    lignes
  ) || (trio && trio.autorite) || null;

  const dateNaissanceTexte = extraireValeurParmiLabels(
    [
      'Date de naissance', 'Né(e) le', 'Date of Birth',
      'Fecha de Nacimiento', 'Data de Nascimento', 'Geburtsdatum', 'Data di Nascita',
    ],
    lignes
  );
  infos.dateNaissance = (mrz && mrz.dateNaissance) || extraireDateDDMMYYYY(dateNaissanceTexte) || null;

  const dateDelivranceTexte = extraireValeurParmiLabels(
    [
      "Date de délivrance", "Date d'établissement", 'Date of Issue',
      'Fecha de Expedición', 'Fecha de Emisión', 'Data de Emissão', 'Ausstellungsdatum', 'Data di Rilascio',
    ],
    lignes
  );
  infos.dateDelivrance = extraireDateDDMMYYYY(dateDelivranceTexte);

  const dateExpirationTexte = extraireValeurParmiLabels(
    [
      "Date d'expiration", 'Date de validité', 'Date of Expiry',
      'Fecha de Caducidad', 'Fecha de Vencimiento', 'Data de Validade', 'Gültig bis', 'Data di Scadenza',
    ],
    lignes
  );
  infos.dateExpiration = (mrz && mrz.dateExpiration) || extraireDateDDMMYYYY(dateExpirationTexte) || null;

  // Repli quand les libellés sont trop dégradés par l'OCR pour être reconnus : les dates au
  // format "JJ MOIS/MOIS AAAA" apparaissent dans l'ordre naissance, délivrance, expiration.
  if (datesAbregees.length >= 3) {
    if (!infos.dateNaissance) infos.dateNaissance = datesAbregees[0];
    if (!infos.dateDelivrance) infos.dateDelivrance = datesAbregees[1];
    if (!infos.dateExpiration) infos.dateExpiration = datesAbregees[2];
  } else if (datesAbregees.length === 2 && !infos.dateDelivrance && !infos.dateExpiration) {
    infos.dateDelivrance = datesAbregees[0];
    infos.dateExpiration = datesAbregees[1];
  } else if (datesAbregees.length === 1 && !infos.dateNaissance) {
    infos.dateNaissance = datesAbregees[0];
  }

  const sexeTexte = extraireValeurParmiLabels(
    ['Sexe', 'Sex', 'Genre', 'Sexo', 'Geschlecht', 'Sesso'],
    lignes
  );
  infos.sexe = (mrz && mrz.sexe) ||
               (sexeTexte ? sexeTexte.trim().charAt(0).toUpperCase() : null) ||
               (trio && trio.sexe) || null;

  infos.nom = nettoyer(infos.nom);
  infos.prenom = nettoyer(infos.prenom);
  infos.lieuNaissance = nettoyer(infos.lieuNaissance);
  // Pas de nettoyer() ici : l'autorité émettrice est parfois un code alphanumérique
  // ponctué ("MINT/DGPN/DPETV") dont la ponctuation fait partie du sens.

  return mrz && mrz.nationalite ? { ...infos, nationalite: mrz.nationalite } : infos;
};

module.exports = { id: 'PASSEPORT', label: 'Passeport (MRZ)', detect, extract };
