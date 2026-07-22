// Sénégal — CNI / carte d'identité biométrique CEDEAO sénégalaise
const { extraireValeurApresLabel, extraireValeurParmiLabels, nettoyer, infosVides } = require('../helpers');

const detect = (ocrText) => {
  const upper = ocrText.toUpperCase();
  return upper.includes('SENEGAL') ||
         upper.includes("CENTRE D'ENREGISTREMENT") ||
         upper.includes("CENTRE FENREGISTREMENT");
};

const extract = (ocrText, lignes) => {
  const infos = infosVides();

  infos.prenom = extraireValeurApresLabel('Prénom', lignes);
  infos.nom = extraireValeurApresLabel('Nom', lignes);
  infos.lieuNaissance = extraireValeurApresLabel('Lieu de naissance', lignes) ||
                        extraireValeurApresLabel('Lito de naissance', lignes);
  infos.centreEnregistrement = extraireValeurApresLabel("Centre d'enregistrement", lignes) ||
                               extraireValeurApresLabel("Centre fenregistrement", lignes);
  infos.adresseDomicile = extraireValeurParmiLabels(
    ["Adresse du domicile", 'Adresse di domible', 'Adresse'],
    lignes
  );

  infos.numeroPiece = extraireValeurParmiLabels(
    ["N° de la carte d'identité", 'N° CNI', 'N° de carte', "N° Carte d'identité", 'Numéro', 'NIN', 'Identifiant National'],
    lignes
  );
  if (infos.numeroPiece) infos.numeroPiece = infos.numeroPiece.replace(/\D/g, '') || infos.numeroPiece;

  if (!infos.numeroPiece) {
    let matchNumero = ocrText.match(/N°\s*de\s*la\s*carte\s*d['']identité\s*:?\s*([\d\s]+)/i);
    if (!matchNumero) matchNumero = ocrText.match(/\b(\d{15,})\b/);
    if (matchNumero) infos.numeroPiece = matchNumero[1].replace(/\s/g, '');
  }

  let match = ocrText.match(/(\d{2}\/\d{2}\/\d{4})\s+([MF])\s+(\d{2,3})\s*cm/i);
  if (match) {
    const [j, m, a] = match[1].split('/');
    infos.dateNaissance = `${a}-${m}-${j}`;
    infos.sexe = match[2];
    infos.taille = parseInt(match[3], 10);
  } else {
    match = ocrText.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (match) {
      const [j, m, a] = match[1].split('/');
      infos.dateNaissance = `${a}-${m}-${j}`;
    }
  }

  match = ocrText.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/);
  if (match) {
    const [j1, m1, a1] = match[1].split('/');
    const [j2, m2, a2] = match[2].split('/');
    infos.dateDelivrance = `${a1}-${m1}-${j1}`;
    infos.dateExpiration = `${a2}-${m2}-${j2}`;
  }

  const upper = ocrText.toUpperCase();
  if (upper.includes("CARTE D'IDENTITE CEDEAO") || upper.includes('ECOWAS IDENTITY CARD'))
    infos.typePiece = 'CARTE_IDENTITE_CEDEAO';
  else if (upper.includes('PASSEPORT')) infos.typePiece = 'PASSEPORT';
  else if (upper.includes('PERMIS')) infos.typePiece = 'PERMIS';
  else if (upper.includes('CARTE DE SEJOUR')) infos.typePiece = 'CARTE_SEJOUR';
  else if (upper.includes('CARTE CONSULAIRE')) infos.typePiece = 'CARTE_CONSULAIRE';

  infos.nom = nettoyer(infos.nom);
  infos.prenom = nettoyer(infos.prenom);
  infos.lieuNaissance = nettoyer(infos.lieuNaissance);
  infos.centreEnregistrement = nettoyer(infos.centreEnregistrement);
  infos.adresseDomicile = nettoyer(infos.adresseDomicile);

  return infos;
};

module.exports = { id: 'SN', label: 'Sénégal', detect, extract };
