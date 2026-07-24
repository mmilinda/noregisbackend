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
  // Frontière de mot : la lettre suivant le label ne doit pas être une autre lettre.
  // Sans ça, un label comme "Nom" matcherait à tort le début du mot espagnol "Nombres"
  // (label d'une tout autre ligne/langue) au lieu de le rejeter.
  const frontiereDeMot = '(?![A-Za-zÀ-ÿ])';
  // Beaucoup de passeports (ICAO 9303) impriment le label en bilingue sur une seule ligne,
  // ex: "Nom / Surname", "Lieu de naissance / Place of Birth". Sans ça, "Surname" serait
  // pris à tort pour la valeur au lieu d'aller lire la ligne suivante (la vraie donnée).
  const traductionBilingue = '(?:\\s*\\/\\s*[A-Za-zÀ-ÿ()]+(?:\\s+[A-Za-zÀ-ÿ()]+){0,4})?';
  // Parasites OCR fréquents en début de ligne (puces, guillemets égarés, symboles) avant le
  // vrai libellé, ex: '⚫ "Lieu de Naissance Libreville'. On les ignore.
  const parasitesDebutLigne = '[^A-Za-zÀ-ÿ]*';
  // Tolère un "s" de pluriel, avec ou sans parenthèses, avec ou sans espace avant, puis ":" optionnel
  return new RegExp(
    '^' + parasitesDebutLigne + base + '\\s*\\(?\\s*s?\\s*\\)?' + frontiereDeMot + traductionBilingue + '\\s*:?\\s*',
    'i'
  );
};

// Devises/mentions nationales imprimées en filigrane sur beaucoup de cartes consulaires
// ("Unité - Travail - Progrès" au Congo, "Union - Travail - Justice" au Gabon...) que l'OCR
// capte parfois à la place de la vraie valeur d'un champ. Comparaison par préfixe pour
// tolérer les erreurs OCR courantes (ex: "PROGSE"/"UNITS" au lieu de "PROGRES"/"UNITE").
const PREFIXES_BRUIT_DE_FOND = [
  'UNIT', 'TRAVA', 'PROGR', 'PROGS', 'FRATERN', 'JUSTIC', 'DISCIPL', 'REPUBLIQU', 'REPUBLIC',
];

const estBruitDeFond = (ligne) => {
  const mot = ligne.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
  // Pas de lettres du tout (date, numéro...) : ce n'est pas un mot de devise nationale, donc pas du bruit.
  if (!mot) return false;
  return PREFIXES_BRUIT_DE_FOND.some(p => mot.startsWith(p));
};

const extraireValeurApresLabel = (label, lignes) => {
  const regex = construireRegexLabel(label);
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    const match = ligne.match(regex);
    if (!match) continue;

    // Une tabulation juste après le label indique une colonne voisine (bruit de fond
    // imprimé sur la carte), pas la valeur du champ : on ignore le reste de la ligne.
    const suiviDuneTabulation = match[0].includes('\t');
    const valeurMemeLigne = suiviDuneTabulation ? '' : ligne.slice(match[0].length).split('\t')[0].trim();
    if (valeurMemeLigne && !estBruitDeFond(valeurMemeLigne)) return valeurMemeLigne;

    let j = i + 1;
    while (j < lignes.length && estBruitDeFond(lignes[j].split('\t')[0])) j++;
    if (j < lignes.length) return lignes[j].split('\t')[0].trim();
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

// Beaucoup de passeports CEDEAO impriment les dates en mois abrégé bilingue sur la même
// ligne, ex: "18 OCT/OCT 1994", "26 SEPT/SEP 2024" (jour, mois FR/EN séparés par "/", année).
const MOIS_ABREGES = {
  JAN: '01', JANV: '01',
  FEV: '02', FEVR: '02', FEB: '02',
  MAR: '03', MARS: '03',
  AVR: '04', APR: '04',
  MAI: '05', MAY: '05',
  JUN: '06', JUIN: '06',
  JUL: '07', JUIL: '07',
  AOU: '08', AOUT: '08', AUG: '08',
  SEP: '09', SEPT: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12',
};

// Renvoie toutes les dates "JJ MOIS/MOIS AAAA" trouvées dans le texte, dans leur ordre
// d'apparition (convention habituelle sur ces passeports : naissance, délivrance, expiration).
const extraireDatesMoisAbrege = (texte) => {
  if (!texte) return [];
  const regex = /(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,5})\s*\/\s*[A-Za-zÀ-ÿ]{3,5}\s+(\d{4})/g;
  const dates = [];
  let m;
  while ((m = regex.exec(texte)) !== null) {
    const mois = MOIS_ABREGES[m[2].toUpperCase()];
    if (mois) dates.push(`${m[3]}-${mois}-${m[1].padStart(2, '0')}`);
  }
  return dates;
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
  extraireDatesMoisAbrege,
  nettoyer,
  infosVides,
  analyserMRZ,
};
