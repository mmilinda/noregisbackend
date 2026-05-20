const extraireInfosDepuisVeryfi = (data) => {
  const ocrText = data.ocr_text || '';
  const infos = {
    nom: null, prenom: null, dateNaissance: null, numeroPiece: null,
    typePiece: 'CNI', sexe: null, taille: null, lieuNaissance: null,
    dateDelivrance: null, dateExpiration: null, centreEnregistrement: null,
    adresseDomicile: null,
  };

  // ─── PRÉNOM (identique à la regex Python) ───
  let match = ocrText.match(/Pr[ée]nom\s*:?\s*([A-Za-z\s]+?)(?:\n|Date|$)/i);
  if (match) infos.prenom = match[1].trim();

  // ─── NOM ───
  match = ocrText.match(/Nom\s*:?\s*([A-Za-z\s]+?)(?:\n|Prénom|$)/i);
  if (match) infos.nom = match[1].trim();

  // ─── LIEU DE NAISSANCE ───
  match = ocrText.match(/Lieu\s*de\s*naissance\s*:?\s*([A-Za-z\s]+?)(?:\n|$)/i);
  if (!match) match = ocrText.match(/Lito\s*de\s*naissance\s*:?\s*([A-Za-z\s]+?)(?:\n|$)/i);
  if (match) infos.lieuNaissance = match[1].trim();

  // ─── NUMÉRO DE PIÈCE ───
  match = ocrText.match(/N°\s*de\s*la\s*carte\s*d['']identité\s*\n\s*([\d\s]+)/i);
  if (match) {
    infos.numeroPiece = match[1].replace(/\s/g, '');
  } else {
    match = ocrText.match(/\b(\d{15,})\b/);
    if (match) infos.numeroPiece = match[1];
  }

  // ─── DATE NAISSANCE, SEXE, TAILLE ───
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

  // ─── DATES DÉLIVRANCE / EXPIRATION ───
  match = ocrText.match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/);
  if (match) {
    const [j1, m1, a1] = match[1].split('/');
    const [j2, m2, a2] = match[2].split('/');
    infos.dateDelivrance = `${a1}-${m1}-${j1}`;
    infos.dateExpiration = `${a2}-${m2}-${j2}`;
  }

  // ─── CENTRE D'ENREGISTREMENT ───
  match = ocrText.match(/Centre\s*[fd]?enregistrement\s*:?\s*([A-Za-z\s\/]+?)(?:\n|$)/i);
  if (match) infos.centreEnregistrement = match[1].trim();

  // ─── ADRESSE DOMICILE ───
  match = ocrText.match(/Adresse\s*(?:du|di)\s*(?:domicile|domible)\s*:?\s*([A-Za-z\s]+?)(?:\n|$)/i);
  if (match) infos.adresseDomicile = match[1].trim();

  // ─── TYPE DE PIÈCE ───
  const upper = ocrText.toUpperCase();
  if (upper.includes("CARTE D'IDENTITE CEDEAO") || upper.includes('ECOWAS IDENTITY CARD'))
    infos.typePiece = 'CARTE_IDENTITE_CEDEAO';
  else if (upper.includes('PASSEPORT')) infos.typePiece = 'PASSEPORT';
  else if (upper.includes('PERMIS')) infos.typePiece = 'PERMIS';
  else if (upper.includes('CARTE DE SEJOUR')) infos.typePiece = 'CARTE_SEJOUR';
  else if (upper.includes('CARTE CONSULAIRE')) infos.typePiece = 'CARTE_CONSULAIRE';

  // ─── NETTOYAGE FINAL (supprime caractères spéciaux et espaces multiples) ───
  const nettoyer = (str) => str ? str.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').replace(/\s+/g, ' ').trim() : null;
  infos.nom = nettoyer(infos.nom);
  infos.prenom = nettoyer(infos.prenom);
  infos.lieuNaissance = nettoyer(infos.lieuNaissance);
  infos.centreEnregistrement = nettoyer(infos.centreEnregistrement);
  infos.adresseDomicile = nettoyer(infos.adresseDomicile);

  return infos;
};