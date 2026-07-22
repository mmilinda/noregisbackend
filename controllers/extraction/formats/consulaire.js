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
  const upper = ocrText.toUpperCase();
  return upper.includes('CARTE D\'IDENTITE CONSULAIRE') ||
         upper.includes('CARTE D IDENTITE CONSULAIRE') ||
         upper.includes('AMBASSADE DU') ||
         upper.includes('AMBASSADE DE') ||
         upper.includes('CONSULAIRE');
};

// Code alphanumérique du type "AMIGA0017/25-SGL" ou "SN0326160", souvent imprimé
// sans libellé explicite sur ces cartes.
const extraireCodeAlphanumerique = (ocrText) => {
  const match = ocrText.match(/\b([A-Z]{2,10}\d{2,}(?:[\/\-][A-Z0-9]+)*)\b/);
  return match ? match[1] : null;
};

const extract = (ocrText, lignes) => {
  const infos = infosVides();
  infos.typePiece = 'CARTE_CONSULAIRE';

  infos.nom = extraireValeurApresLabel('Nom', lignes);
  infos.prenom = extraireValeurApresLabel('Prénom', lignes);

  const sexeTexte = extraireValeurApresLabel('Sexe', lignes);
  infos.sexe = sexeTexte ? sexeTexte.trim().charAt(0).toUpperCase() : null;

  const dateNaissanceTexte = extraireValeurParmiLabels(['Date de naissance', 'Né(e) le'], lignes);
  infos.dateNaissance = extraireDateDDMMYYYY(dateNaissanceTexte);

  infos.lieuNaissance = extraireValeurApresLabel('Lieu de naissance', lignes);
  infos.adresseDomicile = extraireValeurApresLabel('Adresse', lignes);

  const dateDelivranceTexte = extraireValeurParmiLabels(
    ['Date de délivrance', "Date d'établissement"], lignes
  );
  infos.dateDelivrance = extraireDateDDMMYYYY(dateDelivranceTexte);

  const dateExpirationTexte = extraireValeurParmiLabels(
    ["Date d'expiration", 'Expire le', 'Date de validité'], lignes
  );
  infos.dateExpiration = extraireDateDDMMYYYY(dateExpirationTexte);

  infos.numeroPiece = extraireValeurParmiLabels(['N°', 'Numéro', 'N° Carte'], lignes) ||
                       extraireCodeAlphanumerique(ocrText);

  const profession = extraireValeurApresLabel('Profession', lignes);

  infos.nom = nettoyer(infos.nom);
  infos.prenom = nettoyer(infos.prenom);
  infos.lieuNaissance = nettoyer(infos.lieuNaissance);

  return profession ? { ...infos, profession: nettoyer(profession) } : infos;
};

module.exports = { id: 'CONSULAIRE', label: 'Carte consulaire', detect, extract };
