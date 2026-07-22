// Fallback générique — utilisé quand aucun format pays n'est reconnu.
// Ne tente que les extractions robustes (dates, numéro, type de pièce),
// sans labels spécifiques à une mise en page nationale.
const { infosVides } = require('../helpers');

const detect = () => true; // toujours en dernier recours

const extract = (ocrText) => {
  const infos = infosVides();

  let match = ocrText.match(/\b(\d{15,})\b/);
  if (match) infos.numeroPiece = match[1];

  match = ocrText.match(/(\d{2}\/\d{2}\/\d{4})\s+([MF])\s+(\d{2,3})\s*cm/i);
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
  else if (upper.includes('PASSEPORT') || upper.includes('PASSPORT')) infos.typePiece = 'PASSEPORT';
  else if (upper.includes('PERMIS')) infos.typePiece = 'PERMIS';
  else if (upper.includes('CARTE DE SEJOUR')) infos.typePiece = 'CARTE_SEJOUR';
  else if (upper.includes('CARTE CONSULAIRE')) infos.typePiece = 'CARTE_CONSULAIRE';

  return infos;
};

module.exports = { id: 'GENERIQUE', label: 'Générique', detect, extract };
