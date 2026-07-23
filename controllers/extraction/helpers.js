// Fonctions utilitaires partagées entre les parsers de pièces d'identité

// Construit un regex tolérant pour un label : insensible à la casse et aux accents,
// et au pluriel sous toutes ses formes (nom/noms, prénom/prénoms/prénom(s)/prénom (s)...).
const construireRegexLabel = (label) => {
  const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const accentInsensible = (s) => s
    .replace(/[éèêë]/gi, '[éèêëe]')
    .replace(/[àâ]/gi, '[àâa]')
    .replace(/[ôö]/gi, '[ôöo]')
    .replace(/[ûùü]/gi, '[ûùüu]')
    .replace(/[îï]/gi, '[îïi]')
    .replace(/[ç]/gi, '[çc]');

  // Tolère les différentes apostrophes que l'OCR peut produire (droite ', typographique
  // ', accent grave `) pour les labels du type "Date d'établissement".
  const apostropheInsensible = (s) => s.replace(/'/g, "['`’‘]");

  const base = apostropheInsensible(accentInsensible(echapper(label)));
  // Tolère un "s" de pluriel, avec ou sans parenthèses, avec ou sans espace avant, puis ":" optionnel
  return new RegExp('^' + base + '\\s*\\(?\\s*s?\\s*\\)?\\s*:?\\s*', 'i');
};

const extraireValeurApresLabel = (label, lignes) => {
  const regex = construireRegexLabel(label);
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    const match = ligne.match(regex);
    if (match) {
      let valeur = ligne.slice(match[0].length).trim();
      if (valeur) return valeur;
      if (i + 1 < lignes.length) return lignes[i + 1].trim();
    }
  }
  return null;
};

// Essaie plusieurs libellés synonymes (ex: langues différentes) et renvoie la première valeur trouvée.
// Chaque libellé bénéficie déjà de la tolérance accents/pluriel de extraireValeurApresLabel.
const extraireValeurParmiLabels = (labels, lignes) => {
  for (const label of labels) {
    const valeur = extraireValeurApresLabel(label, lignes);
    if (valeur) return valeur;
  }
  return null;
};

// Convertit une date jj/mm/aaaa (ou jj-mm-aaaa) trouvée dans une chaîne en aaaa-mm-jj.
const extraireDateDDMMYYYY = (texte) => {
  if (!texte) return null;
  const match = texte.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (!match) return null;
  const [, j, m, a] = match;
  return `${a}-${m}-${j}`;
};

const nettoyer = (str) => str ? str.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').replace(/\s+/g, ' ').trim() : null;

const infosVides = () => ({
  nom: null, prenom: null, dateNaissance: null, numeroPiece: null,
  typePiece: 'CNI', sexe: null, taille: null, lieuNaissance: null,
  dateDelivrance: null, dateExpiration: null, centreEnregistrement: null,
  adresseDomicile: null,
});

// Parse la Zone de Lecture Automatique (MRZ, norme ICAO 9303, format TD3 - 2 lignes de 44
// caractères) présente sur la page d'identité de la quasi-totalité des passeports biométriques,
// quel que soit le pays. Sert de filet de sécurité quand les libellés imprimés ne sont pas reconnus.
const analyserMRZ = (ocrText) => {
  const lignesBrutes = ocrText.split('\n').map(l => l.replace(/\s/g, '').toUpperCase());
  const candidats = lignesBrutes.filter(l => /^[A-Z0-9<]{40,44}$/.test(l));
  if (candidats.length < 2) return null;

  const ligne1 = candidats.find(l => l.startsWith('P<'));
  if (!ligne1) return null;
  const index1 = candidats.indexOf(ligne1);
  const ligne2 = candidats[index1 + 1];
  if (!ligne2) return null;

  const formatDateMRZ = (yymmdd) => {
    if (!/^\d{6}$/.test(yymmdd)) return null;
    const yy = parseInt(yymmdd.substring(0, 2), 10);
    const anneeCourante2Chiffres = new Date().getFullYear() % 100;
    const siecle = yy > anneeCourante2Chiffres + 5 ? 1900 : 2000;
    return `${siecle + yy}-${yymmdd.substring(2, 4)}-${yymmdd.substring(4, 6)}`;
  };

  const numeroPiece = ligne2.substring(0, 9).replace(/</g, '').trim() || null;
  const nationalite = ligne2.substring(10, 13).replace(/</g, '').trim() || null;
  const sexeBrut = ligne2.substring(20, 21);
  const sexe = sexeBrut === 'M' || sexeBrut === 'F' ? sexeBrut : null;
  const dateNaissance = formatDateMRZ(ligne2.substring(13, 19));
  const dateExpiration = formatDateMRZ(ligne2.substring(21, 27));

  const partieNoms = ligne1.substring(5).split('<<');
  const nom = partieNoms[0] ? partieNoms[0].replace(/</g, ' ').trim() : null;
  const prenom = partieNoms[1] ? partieNoms[1].replace(/</g, ' ').trim() : null;

  return { numeroPiece, nom, prenom, sexe, dateNaissance, dateExpiration, nationalite };
};

module.exports = {
  extraireValeurApresLabel,
  extraireValeurParmiLabels,
  extraireDateDDMMYYYY,
  nettoyer,
  infosVides,
  analyserMRZ,
};
