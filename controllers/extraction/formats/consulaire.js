// Carte d'identité consulaire — délivrée par l'ambassade/le consulat d'un pays tiers
// (ex: Gabon, Congo) installé au Sénégal. À ne pas confondre avec une CNI sénégalaise :
// le mot "SENEGAL" y figure seulement parce que l'ambassade est située à Dakar
// ("AMBASSADE DU GABON AU SENEGAL"), pas parce que le titulaire est sénégalais.
// Le numéro de carte est alphanumérique (ex: "AMIGA0017/25-SGL", "SN0326160") :
// contrairement aux CNI locales, on ne le réduit pas aux seuls chiffres.
const {
  extraireValeurApresLabel,
  extraireValeurParmiLabels,
  extraireDateDDMMYYYY,
  nettoyer,
  infosVides,
} = require('../helpers');

const detect = (ocrText) => {
  // toUpperCase() garde les accents ("République" -> "RÉPUBLIQUE") : on les retire pour
  // pouvoir comparer avec des constantes non accentuées.
  const upper = ocrText.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  return upper.includes('CARTE D\'IDENTITE CONSULAIRE') ||
         upper.includes('CARTE D IDENTITE CONSULAIRE') ||
         upper.includes('AMBASSADE DU') ||
         upper.includes('AMBASSADE DE') ||
         upper.includes('CONSULAIRE') ||
         // Le verso de ces cartes (dates de délivrance/expiration, signature) ne répète pas
         // toujours "AMBASSADE"/"CONSULAIRE" : on le reconnaît via ses propres mentions.
         upper.includes("SIGNATURE DE L'AUTORITE") ||
         upper.includes('SIGNATURE DE L AUTORITE') ||
         upper.includes('REPUBLIQUE DU CONGO') ||
         upper.includes('REPUBLIQUE GABONAISE');
};

// Code alphanumérique du type "AMIGA0017/25-SGL" ou "SN0326160", souvent imprimé
// sans libellé explicite sur ces cartes.
const extraireCodeAlphanumerique = (ocrText) => {
  const match = ocrText.match(/\b([A-Z]{2,10}\d{2,}(?:[\/\-][A-Z0-9]+)*)\b/);
  return match ? match[1] : null;
};

// Sur certaines cartes (ex: Congo), "Sexe", "Date de naissance" et "Lieu de naissance"
// sont imprimés en colonnes : un en-tête sur une ligne, puis les trois valeurs collées sur
// la ligne suivante ("M   01/04/1998 Pointe-Noire"). Le matching par label seul échoue ici
// (le libellé "Sexe" attrape alors le reste de l'en-tête comme si c'était sa valeur), donc
// on cherche ce triplet directement dans le texte brut.
const extraireTrioSexeDateLieu = (ocrText) => {
  const match = ocrText.match(/\b([MF])[\t ]+(\d{2}\/\d{2}\/\d{4})[\t ]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\- ]*)/);
  if (!match) return null;
  return { sexe: match[1], dateNaissance: match[2], lieuNaissance: match[3].trim() };
};

// Sur le verso, "Date de délivrance" et "Date d'expiration" sont souvent imprimées sur la
// même ligne, et l'OCR massacre régulièrement les deux libellés au point de ne plus les
// reconnaître (ex: "Date de delerance ... Dated expiration ..."). On ne se fie donc pas au
// libellé ici : la première date rencontrée est la délivrance, la seconde l'expiration.
const extraireDeuxDates = (ocrText) => {
  const match = ocrText.match(/(\d{2}\/\d{2}\/\d{4})[^\d\n]{0,40}(\d{2}\/\d{2}\/\d{4})/);
  if (!match) return null;
  return { dateDelivrance: match[1], dateExpiration: match[2] };
};

const extract = (ocrText, lignes) => {
  const infos = infosVides();
  infos.typePiece = 'CARTE_CONSULAIRE';

  infos.nom = extraireValeurApresLabel('Nom', lignes);
  infos.prenom = extraireValeurApresLabel('Prénom', lignes);

  const trio = extraireTrioSexeDateLieu(ocrText);

  const sexeTexte = extraireValeurApresLabel('Sexe', lignes);
  infos.sexe = (sexeTexte && sexeTexte.trim().length <= 2 ? sexeTexte.trim().charAt(0).toUpperCase() : null) ||
               (trio && trio.sexe) || null;

  const dateNaissanceTexte = extraireValeurParmiLabels(['Date de naissance', 'Né(e) le'], lignes);
  infos.dateNaissance = extraireDateDDMMYYYY(dateNaissanceTexte) ||
                        (trio && extraireDateDDMMYYYY(trio.dateNaissance)) || null;

  infos.lieuNaissance = extraireValeurApresLabel('Lieu de naissance', lignes) || (trio && trio.lieuNaissance) || null;
  infos.adresseDomicile = extraireValeurApresLabel('Adresse', lignes);

  const deuxDates = extraireDeuxDates(ocrText);

  const dateDelivranceTexte = extraireValeurParmiLabels(
    ['Date de délivrance', "Date d'établissement"], lignes
  );
  infos.dateDelivrance = extraireDateDDMMYYYY(dateDelivranceTexte) ||
                         (deuxDates && extraireDateDDMMYYYY(deuxDates.dateDelivrance)) || null;

  const dateExpirationTexte = extraireValeurParmiLabels(
    ["Date d'expiration", 'Expire le', 'Date de validité'], lignes
  );
  infos.dateExpiration = extraireDateDDMMYYYY(dateExpirationTexte) ||
                         (deuxDates && extraireDateDDMMYYYY(deuxDates.dateExpiration)) || null;

  infos.numeroPiece = extraireValeurParmiLabels(['N°', 'No', 'Numéro', 'N° Carte'], lignes) ||
                       extraireCodeAlphanumerique(ocrText);

  // Repli : certaines cartes impriment le numéro sur sa propre ligne, sans libellé ni
  // lettre reconnaissable par l'OCR (ex: "SN0326160" lu comme "26160" seul sur sa ligne).
  if (!infos.numeroPiece) {
    const derniereLigne = lignes[lignes.length - 1];
    if (derniereLigne && /^\d{4,}$/.test(derniereLigne)) infos.numeroPiece = derniereLigne;
  }

  const profession = extraireValeurApresLabel('Profession', lignes);

  infos.nom = nettoyer(infos.nom);
  infos.prenom = nettoyer(infos.prenom);
  infos.lieuNaissance = nettoyer(infos.lieuNaissance);

  return profession ? { ...infos, profession: nettoyer(profession) } : infos;
};

module.exports = { id: 'CONSULAIRE', label: 'Carte consulaire', detect, extract };
