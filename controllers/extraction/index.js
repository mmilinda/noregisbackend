// Point d'entrée de l'extraction d'infos depuis le texte OCR (Gemini / OpenAI / Veryfi).
const passeport = require('./formats/passeport');
const consulaire = require('./formats/consulaire');
const sn = require('./formats/sn');
const generic = require('./formats/generic');
const { extraireInfosAvecOpenAI } = require('./openaiExtractor');
const { extraireInfosAvecGemini } = require('./geminiExtractor');

const FORMATS = [passeport, consulaire, sn, generic];

const extraireInfosDepuisVeryfi = (data) => {
  const ocrText = data.ocr_text || '';
  const lignes = ocrText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const format = FORMATS.find(f => f.detect(ocrText)) || generic;
  const infos = format.extract(ocrText, lignes);

  return { ...infos, formatDetecte: format.id };
};

module.exports = {
  extraireInfosDepuisVeryfi,
  extraireInfosAvecOpenAI,
  extraireInfosAvecGemini,
};
