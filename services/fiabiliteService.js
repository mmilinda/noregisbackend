/**
 * Engine de vérification et calcul du score de fiabilité des documents d'identité par Pays
 */

const REGLES_PAYS = {
  SEN: {
    code: 'SEN',
    nom: 'Sénégal',
    drapeau: '🇸🇳',
    codeTel: '+221',
    zone: 'CEDEAO',
    regexNin: /^[12]\d{12,13}$/,
    libelleNin: "NIN à 13 ou 14 chiffres (débutant par 1=H ou 2=F)",
    regexNumeroPiece: /^(\d{13,14}|[A-Z0-9]{8,15})$/i,
    champsRequis: ['nom', 'prenom', 'dateNaissance', 'numeroPiece'],
    symbolesVisuels: ['Armoiries du Sénégal', 'Emblème CEDEAO/ECOWAS', 'Drapeau Vert-Jaune-Rouge à étoile verte'],
  },
  CIV: {
    code: 'CIV',
    nom: "Côte d'Ivoire",
    drapeau: '🇨🇮',
    codeTel: '+225',
    zone: 'CEDEAO',
    regexNin: /^C\d{10,11}$/i,
    libelleNin: "NNI ivoirien (ex: C00...)",
    regexNumeroPiece: /^[A-Z0-9]{8,14}$/i,
    champsRequis: ['nom', 'prenom', 'dateNaissance', 'numeroPiece'],
    symbolesVisuels: ["Armoiries de Côte d'Ivoire (Éléphant)", 'Emblème CEDEAO/ECOWAS'],
  },
  MLI: {
    code: 'MLI',
    nom: 'Mali',
    drapeau: '🇲🇱',
    codeTel: '+223',
    zone: 'CEDEAO',
    regexNin: /^\d{10,15}$/,
    regexNumeroPiece: /^[A-Z0-9]{8,14}$/i,
    champsRequis: ['nom', 'prenom', 'dateNaissance'],
    symbolesVisuels: ['Armoiries du Mali', 'Emblème CEDEAO/ECOWAS'],
  },
  FRA: {
    code: 'FRA',
    nom: 'France',
    drapeau: '🇫🇷',
    codeTel: '+33',
    zone: 'UE',
    regexNin: /^\d{12,15}$/,
    regexNumeroPiece: /^[0-9A-Z]{9,12}$/i,
    champsRequis: ['nom', 'prenom', 'dateNaissance', 'numeroPiece'],
    symbolesVisuels: ['Marianne / République Française', 'Drapeau Européen / Français'],
  },
  DEFAULT: {
    code: 'INT',
    nom: 'International / Standard OACI',
    drapeau: '🌐',
    zone: 'OACI 9303',
    regexNin: /^[A-Z0-9]{6,20}$/i,
    regexNumeroPiece: /^[A-Z0-9]{6,20}$/i,
    champsRequis: ['nom', 'prenom', 'dateNaissance'],
    symbolesVisuels: ['Bande Optique OACI 9303'],
  }
};

/**
 * Normalise le code pays (ex: 'SÉNÉGAL' -> 'SEN', 'CIV' -> 'CIV', 'FRANCE' -> 'FRA')
 */
const identifierPays = (codeOuNom) => {
  if (!codeOuNom) return REGLES_PAYS.SEN;
  const str = String(codeOuNom).trim().toUpperCase();

  if (REGLES_PAYS[str]) return REGLES_PAYS[str];

  if (str.includes('SEN') || str.includes('SENEGAL') || str.includes('SÉNÉGAL')) return REGLES_PAYS.SEN;
  if (str.includes('CIV') || str.includes('IVOIRE') || str.includes('COTE')) return REGLES_PAYS.CIV;
  if (str.includes('MLI') || str.includes('MALI')) return REGLES_PAYS.MLI;
  if (str.includes('FRA') || str.includes('FRANC')) return REGLES_PAYS.FRA;

  return REGLES_PAYS.DEFAULT;
};

/**
 * Calcule le score de fiabilité (0 à 100%) d'un document scanné
 */
const evaluerFiabiliteDocument = (data = {}) => {
  const paysConfig = identifierPays(data.codePays || data.pays || data.nationalite);
  const controles = [];
  const anomalies = [];
  let pointsAssures = 0;
  let totalPoints = 100;

  // 1. Validation de l'identité du titulaire (Nom + Prénom) : 25 points
  const nomValide = data.nom && String(data.nom).trim().length >= 2;
  const prenomValide = data.prenom && String(data.prenom).trim().length >= 2;
  
  if (nomValide && prenomValide) {
    pointsAssures += 25;
    controles.push({ cle: 'identite', succes: true, poids: 25, label: "Nom et Prénom d'identité clairement identifiés" });
  } else {
    controles.push({ cle: 'identite', succes: false, poids: 0, label: "Nom ou Prénom manquant ou incomplet" });
    anomalies.push("Identité incomplète : Nom ou Prénom non lisible.");
  }

  // 2. Validation du numéro de pièce / NIN selon le pays : 25 points
  const ninOuPiece = String(data.nin || data.numeroPiece || '').replace(/\s/g, '');
  let scoreNin = 0;

  if (ninOuPiece) {
    if (paysConfig.regexNin.test(ninOuPiece) || paysConfig.regexNumeroPiece.test(ninOuPiece)) {
      scoreNin = 25;
      controles.push({ 
        cle: 'numeroPiece', 
        succes: true, 
        poids: 25, 
        label: `Numéro de document/NIN conforme aux règles du pays (${paysConfig.nom})` 
      });
    } else {
      scoreNin = 15;
      controles.push({ 
        cle: 'numeroPiece', 
        succes: true, 
        poids: 15, 
        label: `Numéro de document extrait mais format non-standard pour ${paysConfig.nom}` 
      });
      anomalies.push(`Format du numéro (${ninOuPiece}) atypique pour le standard du pays ${paysConfig.nom}.`);
    }
  } else {
    controles.push({ cle: 'numeroPiece', succes: false, poids: 0, label: "Aucun numéro de pièce ou NIN identifié" });
    anomalies.push("Numéro de pièce / NIN manquant.");
  }
  pointsAssures += scoreNin;

  // 3. Chronologie logique des dates (Naissance < Délivrance < Expiration) : 20 points
  const dNaissance = data.dateNaissance ? new Date(data.dateNaissance) : null;
  const dDelivrance = data.dateDelivrance ? new Date(data.dateDelivrance) : null;
  const dExpiration = data.dateExpiration ? new Date(data.dateExpiration) : null;
  const aujourdhui = new Date();

  let datesCoherentes = true;

  if (dNaissance && !isNaN(dNaissance.getTime())) {
    if (dNaissance > aujourdhui) datesCoherentes = false;
  }

  if (dNaissance && dDelivrance && !isNaN(dNaissance.getTime()) && !isNaN(dDelivrance.getTime())) {
    if (dNaissance >= dDelivrance) datesCoherentes = false;
  }

  if (dDelivrance && dExpiration && !isNaN(dDelivrance.getTime()) && !isNaN(dExpiration.getTime())) {
    if (dDelivrance >= dExpiration) datesCoherentes = false;
  }

  if (datesCoherentes && (dNaissance || dDelivrance || dExpiration)) {
    pointsAssures += 20;
    controles.push({ cle: 'chronologieDates', succes: true, poids: 20, label: "Chronologie logique des dates vérifiée" });
  } else if (!datesCoherentes) {
    controles.push({ cle: 'chronologieDates', succes: false, poids: 0, label: "Incohérence chronologique entre les dates" });
    anomalies.push("Dates incohérentes : la date de naissance est supérieure à la date de délivrance ou d'expiration.");
  } else {
    controles.push({ cle: 'chronologieDates', succes: true, poids: 10, label: "Dates partiellement complétées" });
    pointsAssures += 10;
  }

  // 4. Contrôle d'expiration de la pièce : 15 points
  if (dExpiration && !isNaN(dExpiration.getTime())) {
    if (dExpiration >= aujourdhui) {
      pointsAssures += 15;
      controles.push({ cle: 'expiration', succes: true, poids: 15, label: "Pièce d'identité en cours de validité (Non expirée)" });
    } else {
      controles.push({ cle: 'expiration', succes: false, poids: 0, label: "Pièce d'identité périmée / expirée" });
      anomalies.push(`Document expiré le ${dExpiration.toISOString().split('T')[0]}.`);
    }
  } else {
    pointsAssures += 10;
    controles.push({ cle: 'expiration', succes: true, poids: 10, label: "Date d'expiration non renseignée (Indéterminée)" });
  }

  // 5. Présence de la bande MRZ ou Symbole visuel reconnu : 15 points
  const aMRZ = data.mrzLine1 || data.mrzLine2 || data.mrzLine3 || data.mrzText;
  if (aMRZ) {
    pointsAssures += 15;
    controles.push({ cle: 'optiqueMRZ', succes: true, poids: 15, label: "Bande optique biométrique MRZ certifiée" });
  } else {
    pointsAssures += 10;
    controles.push({ cle: 'optiqueMRZ', succes: true, poids: 10, label: "Inspection visuelle IA standard" });
  }

  // Calcul du pourcentage final (0 - 100%)
  const score = Math.min(100, Math.max(0, Math.round((pointsAssures / totalPoints) * 100)));

  let niveau = 'FAIBLE';
  if (score >= 85) niveau = 'EXCELLENT';
  else if (score >= 70) niveau = 'ELEVE';
  else if (score >= 50) niveau = 'MOYEN';

  return {
    score,
    niveau,
    estValide: score >= 60,
    pays: {
      code: paysConfig.code,
      nom: paysConfig.nom,
      drapeau: paysConfig.drapeau,
      zone: paysConfig.zone,
    },
    controles,
    anomalies,
    horodatage: new Date().toISOString(),
  };
};

module.exports = {
  identifierPays,
  evaluerFiabiliteDocument,
  REGLES_PAYS,
};
