// Point d'entrée de l'extraction d'infos depuis le texte OCR (Veryfi).
// Détecte le format de la pièce (pays) via mots-clés, puis délègue au
// parser correspondant. Pour ajouter un pays : créer un fichier dans
// ./formats/<pays>.js exportant { id, label, detect(ocrText), extract(ocrText, lignes) }
// et l'enregistrer ci-dessous, avant le fallback "generic".

const passeport = require('./formats/passeport');
const sn = require('./formats/sn');
const generic = require('./formats/generic');

// Le passeport est vérifié en premier : sa MRZ et son libellé "PASSEPORT" sont plus
// spécifiques qu'une simple mention de pays qui peut aussi apparaître sur une CNI.
const FORMATS = [passeport, sn, generic];

const extraireInfosDepuisVeryfi = (data) => {
  const ocrText = data.ocr_text || '';
  const lignes = ocrText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const format = FORMATS.find(f => f.detect(ocrText)) || generic;
  const infos = format.extract(ocrText, lignes);

  return { ...infos, formatDetecte: format.id };
};

module.exports = { extraireInfosDepuisVeryfi };
