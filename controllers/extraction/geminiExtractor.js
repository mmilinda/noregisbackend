const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const sharp = require('sharp');

const getMimeType = (filePath) => {
  if (typeof filePath !== 'string') return 'image/jpeg';
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.pdf') return 'application/pdf';
  return 'image/jpeg';
};

/**
 * Normalise les dates sous forme de chaîne YYYY-MM-DD (extrait les dates de n'importe quel texte brut)
 */
const normaliserDate = (valeur) => {
  if (!valeur || typeof valeur !== 'string') return null;
  const str = valeur.trim();
  
  // match YYYY-MM-DD n'importe où dans la chaîne
  const matchIso = str.match(/\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/);
  if (matchIso) {
    const [, y, m, d] = matchIso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // match DD/MM/YYYY n'importe où dans la chaîne
  const matchFr = str.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/);
  if (matchFr) {
    const [, d, m, y] = matchFr;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
};

/**
 * Nettoie les numéros de pièce et NIN (retire les préfixes 5. N° PERMIS etc.)
 */
const nettoyerNumeroPiece = (valeur) => {
  if (!valeur) return null;
  let str = String(valeur).trim();
  str = str.replace(/^(?:1|2|3|4a|4b|4c|4d|5|6|7|8|9|10|11|12)[\.\s:\-]+/i, '');
  str = str.replace(/^(N°\s*DE\s*LA\s*CARTE|N°\s*CNI|N°\s*PERMIS|N°\s*DE\s*PERMIS|N°|CNI|NIN|ID|PASSEPORT|PASSPORT|NUMBER|NUMERO|CARD)\s*:?\s*/i, '');
  return str.trim() || null;
};

/**
 * Nettoie les noms, prénoms et lieux de naissance (retire les numéros de champs officiels 1., 2., 3., 4c...)
 */
const nettoyerNomPrenom = (valeur) => {
  if (!valeur) return null;
  let str = String(valeur).trim();
  str = str.replace(/^(?:1|2|3|4a|4b|4c|4d|5|6|7|8|9|10|11|12)[\.\s:\-]+/i, '');
  str = str.replace(/^(SURNAME|GIVEN\s*NAMES?|NAMES?|NOM|PRENOM|PRÉNOM|NOMS?|PRÉNOMS?|LIEU\s*DE\s*NAISSANCE|PLACE\s*OF\s*BIRTH|A|À|VILLE\s*DE)\s*(\/|\\|\:|-|\s)*\s*/i, '');
  return str.trim() || null;
};

/**
 * Convertit toute représentation de taille en cm entier
 */
const parseTailleCentimetres = (valeur) => {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  if (typeof valeur === 'number') {
    if (valeur > 0.5 && valeur < 3.0) return Math.round(valeur * 100);
    if (valeur >= 50 && valeur <= 300) return Math.round(valeur);
    return null;
  }
  const str = String(valeur).replace(',', '.').replace(/[^\d.]/g, '');
  const num = parseFloat(str);
  if (Number.isNaN(num)) return null;
  if (num > 0.5 && num < 3.0) return Math.round(num * 100);
  if (num >= 50 && num <= 300) return Math.round(num);
  return null;
};

/**
 * Décode la bande optique MRZ (Machine Readable Zone) au bas de la carte ou passeport
 */
const decoderBandeMRZ = (mrzText) => {
  if (!mrzText || typeof mrzText !== 'string') return {};
  const res = {};
  const clean = mrzText.replace(/\r\n/g, '\n');
  const lines = clean.split('\n').map(l => l.trim().toUpperCase()).filter(Boolean);

  for (const line of lines) {
    // 1. Ligne Nom / Prénom MRZ (ex: "MENDY<<MILINDA<<<<<<<<<<<<<<<<<")
    if (line.includes('<<')) {
      const matchNames = line.match(/^([A-Z0-9]+)<<([A-Z0-9<]+)$/);
      if (matchNames) {
        res.nom = matchNames[1].replace(/</g, '').trim();
        res.prenom = matchNames[2].replace(/</g, ' ').trim();
      }
    }

    // 2. Ligne 2 MRZ Passeport (Format ICAO 9303 TD3 ex: "A012345674SEN9410189M2609267<<<<<<<<<<<8")
    const matchPassportMrz = line.match(/^([A-Z0-9<]{8,10})\d([A-Z]{3})\d{6}/);
    if (matchPassportMrz) {
      const pNum = matchPassportMrz[1].replace(/</g, '').trim();
      if (pNum && pNum.length >= 6) {
        res.mrzNumeroPiece = pNum;
      }
    }

    // 3. Ligne NIN MRZ (ex: "I<SEN17511994012344<<<<<<<<<<<<<" ou 13-14 chiffres)
    const matchNinMrz = line.match(/(?:[A-Z0-9<]{2,5})(\d{13,14})\d/);
    if (matchNinMrz) {
      res.nin = matchNinMrz[1];
    }

    // 3. Ligne Date Naissance + Sexe + Expiration MRZ (ex: "9410189M2609267SEN<<<<<<<<<<<8")
    const matchDates = line.match(/(\d{6})\d([MF])(\d{6})/);
    if (matchDates) {
      const [, yymmddBirth, sex, yymmddExp] = matchDates;
      
      const yyB = parseInt(yymmddBirth.slice(0, 2), 10);
      const mmB = yymmddBirth.slice(2, 4);
      const ddB = yymmddBirth.slice(4, 6);
      const yearB = yyB > 35 ? `19${yyB}` : `20${yyB < 10 ? '0' + yyB : yyB}`;
      res.dateNaissance = `${yearB}-${mmB}-${ddB}`;
      res.sexe = sex;

      const yyE = parseInt(yymmddExp.slice(0, 2), 10);
      const mmE = yymmddExp.slice(2, 4);
      const ddE = yymmddExp.slice(4, 6);
      const yearE = `20${yyE < 10 ? '0' + yyE : yyE}`;
      res.dateExpiration = `${yearE}-${mmE}-${ddE}`;
    }
  }

  return res;
};



const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    typePiece: { 
      type: SchemaType.STRING, 
      description: "Type de document d'identité détecté : 'CNI', 'PASSEPORT', 'PERMIS', 'CARTE_GRISE', 'CARTE_CONSULAIRE', 'CARTE_SEJOUR', ou 'AUTRE'." 
    },
    nom: { 
      type: SchemaType.STRING, 
      description: "Nom de famille (SURNAME / NOM) imprimé sur le document." 
    },
    prenom: { 
      type: SchemaType.STRING, 
      description: "Prénom(s) (GIVEN NAMES / PRÉNOM) imprimé(s) sur le document." 
    },
    dateNaissance: { 
      type: SchemaType.STRING, 
      description: "Date de naissance au format YYYY-MM-DD." 
    },
    lieuNaissance: { 
      type: SchemaType.STRING, 
      description: "Lieu/Ville de naissance." 
    },
    sexe: { type: SchemaType.STRING, description: "Sexe ('M' ou 'F')" },
    taille: { type: SchemaType.STRING, description: "Taille en cm (ex: 175)" },
    numeroPiece: { type: SchemaType.STRING, description: "Numéro officiel du document (N° CNI, N° Passeport, N° Permis, N° Immatriculation, N° Carte de Séjour, N° Carte Consulaire)" },
    nin: { type: SchemaType.STRING, description: "Numéro d'Identification National (NIN) ou identifiant national unique" },
    codePays: { type: SchemaType.STRING, description: "Code ISO du pays émetteur (ex: SEN, FRA, MLI, CIV, GIN, GMB)" },
    dateDelivrance: { type: SchemaType.STRING, description: "Date d'émission / délivrance au format YYYY-MM-DD" },
    dateExpiration: { type: SchemaType.STRING, description: "Date d'expiration / validité au format YYYY-MM-DD" },
    centreEnregistrement: { type: SchemaType.STRING, description: "Autorité / Consulat / Préfecture / Ambassade émettrice" },
    adresseDomicile: { type: SchemaType.STRING, description: "Adresse du domicile" },
    nationalite: { type: SchemaType.STRING, description: "Nationalité du titulaire" },

    // Champs spécifiques Carte Grise (Certificat d'immatriculation)
    immatriculation: { type: SchemaType.STRING, description: "Numéro de plaque d'immatriculation du véhicule" },
    marque: { type: SchemaType.STRING, description: "Marque du véhicule (ex: TOYOTA, PEUGEOT, MERCEDES, HONDA)" },
    modele: { type: SchemaType.STRING, description: "Modèle du véhicule (ex: HILUX, COROLLA, DUSTER)" },
    couleur: { type: SchemaType.STRING, description: "Couleur du véhicule (ex: BLANC, NOIR, GRIS, BLEU)" },
    typeVehicule: { type: SchemaType.STRING, description: "Type/Genre de véhicule (ex: Voiture, Camion, Moto, Bus, Camionnette)" },

    // Champs spécifiques Permis de conduire
    categoriesPermis: { type: SchemaType.STRING, description: "Catégories de permis accordées (ex: A, B, C, D, EB)" },

    // Bande optique MRZ (Passeport / CNI)
    mrzLine1: { type: SchemaType.STRING, description: "1ère ligne MRZ au bas du passeport ou de la carte" },
    mrzLine2: { type: SchemaType.STRING, description: "2ème ligne MRZ au bas du passeport ou de la carte" },
    mrzLine3: { type: SchemaType.STRING, description: "3ème ligne MRZ si présente" },
  },
};

/**
 * Valide et corrige rigoureusement les champs extraits pour tous types de documents
 */
const validerEtCorrigerDonnees = (parsed) => {
  // 1. Décodage MRZ prioritaire si présent (Passeport ou CNI)
  const mrzRaw = `${parsed.mrzLine1 || ''}\n${parsed.mrzLine2 || ''}\n${parsed.mrzLine3 || ''}\n${parsed.mrzText || ''}`;
  const mrzDecoded = decoderBandeMRZ(mrzRaw);

  let nom = mrzDecoded.nom || nettoyerNomPrenom(parsed.nom);
  let prenom = mrzDecoded.prenom || nettoyerNomPrenom(parsed.prenom);
  let lieuNaissance = nettoyerNomPrenom(parsed.lieuNaissance);

  // Désambiguïsation Nom vs Prénom
  if (nom && nom.includes(' ') && (!prenom || prenom.trim() === '')) {
    const parts = nom.trim().split(/\s+/);
    nom = parts.pop();
    prenom = parts.join(' ');
  }

  // 2. Identification du type de pièce
  let typePiece = (parsed.typePiece || '').toUpperCase().trim();
  const validTypes = ['CNI', 'PASSEPORT', 'PERMIS', 'CARTE_GRISE', 'CARTE_CONSULAIRE', 'CARTE_SEJOUR'];

  // Signaux MRZ prioritaires
  if (mrzRaw.startsWith('P<')) {
    typePiece = 'PASSEPORT';
  } else if (mrzRaw.startsWith('I<') || mrzRaw.startsWith('ID<') || mrzRaw.startsWith('A<')) {
    typePiece = 'CNI';
  }

  // Signal Permis prioritaire si catégories ou mots-clés présents
  const isPermis = !!(parsed.categoriesPermis || typePiece.includes('PERMIS') || typePiece.includes('DRIVER') || typePiece.includes('CONDUIRE'));
  if (isPermis) {
    typePiece = 'PERMIS';
  } else if (!validTypes.includes(typePiece)) {
    if (parsed.marque && parsed.immatriculation) {
      typePiece = 'CARTE_GRISE';
    } else {
      typePiece = 'CNI';
    }
  }

  // Sécurité anti-faux positif : Si le document comporte des attributs de personne (NIN, lieu naissance, etc.)
  // ou si 'marque' est absent, il ne s'agit PAS d'une Carte Grise même si centreEnregistrement mentionne 'immatriculation'.
  const isPersonDoc = !!(parsed.nin || parsed.taille || parsed.lieuNaissance || mrzDecoded.nin || mrzRaw.length > 10 || parsed.categoriesPermis);
  if (isPersonDoc && typePiece === 'CARTE_GRISE' && !parsed.marque) {
    typePiece = isPermis ? 'PERMIS' : 'CNI';
  }

  // Traitement combiné Date et Lieu de naissance (champ 3 du Permis)
  let dateNaissance = mrzDecoded.dateNaissance || normaliserDate(parsed.dateNaissance);

  if (parsed.dateNaissance && (parsed.dateNaissance.includes(' ') || /[a-zA-Z]/.test(parsed.dateNaissance))) {
    const rawDobStr = String(parsed.dateNaissance).replace(/^[3][\.\s:\-]+/, '').trim();
    const dateMatch = rawDobStr.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/);
    if (dateMatch) {
      dateNaissance = normaliserDate(dateMatch[1]);
      const lieuPart = rawDobStr.replace(dateMatch[0], '').replace(/^[\s,:\-\/]+|[\s,:\-\/]+$/g, '').trim();
      if (!lieuNaissance && lieuPart && lieuPart.length >= 2) {
        lieuNaissance = nettoyerNomPrenom(lieuPart);
      }
    }
  }

  // 3. NIN & Numéro de pièce
  let rawNum = parsed.numeroPiece || parsed.numeroPermis || parsed.documentNumber || parsed.cardNumber;
  let numeroPiece = nettoyerNumeroPiece(rawNum) || mrzDecoded.mrzNumeroPiece || mrzDecoded.numeroPiece || (typePiece === 'CARTE_GRISE' ? parsed.immatriculation : null);

  let nin = mrzDecoded.nin;
  if (typePiece === 'PASSEPORT') {
    nin = parsed.nin || mrzDecoded.nin || numeroPiece;
  } else if (!isPermis) {
    const allText = `${mrzDecoded.nin || ''} ${parsed.nin || ''} ${parsed.numeroPiece || ''}`;
    const matchNinChiffres = allText.match(/(?:^|\D)(\d{13,14})(?:\D|$)/);
    nin = mrzDecoded.nin || (matchNinChiffres ? matchNinChiffres[1] : (parsed.nin ? String(parsed.nin).replace(/\D/g, '') : null));
    if (nin && nin.length < 8) nin = null;
  } else {
    // Sur un Permis de Conduire, nin est défini SEULEMENT s'il s'agit d'un vrai NIN à 13-14 chiffres distinct du n° de permis
    if (parsed.nin && parsed.nin !== rawNum) {
      const cleanNin = String(parsed.nin).replace(/\D/g, '');
      if (/^\d{13,14}$/.test(cleanNin)) {
        nin = cleanNin;
      }
    }
  }

  if (!numeroPiece) numeroPiece = nin;

  // 4. Normalisation des dates
  let dateDelivrance = normaliserDate(parsed.dateDelivrance);
  let dateExpiration = mrzDecoded.dateExpiration || normaliserDate(parsed.dateExpiration);

  if (dateNaissance && dateDelivrance && dateNaissance > dateDelivrance) {
    const tmp = dateNaissance;
    dateNaissance = dateDelivrance;
    dateDelivrance = tmp;
  }

  if (dateDelivrance && dateExpiration && dateDelivrance > dateExpiration) {
    const tmp = dateDelivrance;
    dateDelivrance = dateExpiration;
    dateExpiration = tmp;
  }

  let centreEnregistrement = nettoyerNomPrenom(parsed.centreEnregistrement);

  const rawCodePays = parsed.codePays ? String(parsed.codePays).toUpperCase().trim() : '';
  const paysNom = ISO3_COUNTRY_MAP[rawCodePays] || parsed.pays || 'Sénégal';

  const isVehicle = typePiece === 'CARTE_GRISE';

  return {
    nom,
    prenom,
    dateNaissance,
    lieuNaissance,
    sexe: mrzDecoded.sexe || (parsed.sexe || '').toUpperCase().trim() || null,
    taille: parseTailleCentimetres(parsed.taille),
    numeroPiece,
    nin,
    codePays: rawCodePays || 'SEN',
    pays: paysNom,
    typePiece,
    dateDelivrance,
    dateExpiration,
    centreEnregistrement,
    adresseDomicile: parsed.adresseDomicile ? String(parsed.adresseDomicile).trim() : null,
    nationalite: parsed.nationalite ? String(parsed.nationalite).trim() : null,

    // Champs Carte Grise
    immatriculation: isVehicle ? (parsed.immatriculation || numeroPiece) : null,
    marque: isVehicle ? (parsed.marque ? String(parsed.marque).trim() : null) : null,
    modele: isVehicle ? (parsed.modele ? String(parsed.modele).trim() : null) : null,
    couleur: isVehicle ? (parsed.couleur ? String(parsed.couleur).trim() : null) : null,
    typeVehicule: isVehicle ? (parsed.typeVehicule ? String(parsed.typeVehicule).trim() : null) : null,

    // Champs Permis
    categoriesPermis: Array.isArray(parsed.categoriesPermis) ? parsed.categoriesPermis.join(', ') : (parsed.categoriesPermis ? String(parsed.categoriesPermis).replace(/^[9][\.\s:\-]+/, '').trim() : null),

    // Alias bilingues
    lastName: nom,
    firstName: prenom,
    birthDate: dateNaissance,
    birthPlace: lieuNaissance,
    sex: mrzDecoded.sexe || (parsed.sexe || '').toUpperCase().trim() || null,
    height: parseTailleCentimetres(parsed.taille),
    documentNumber: numeroPiece,
    idNumber: nin,
    documentType: typePiece,
    country: paysNom,
    issuedAt: dateDelivrance,
    expiresAt: dateExpiration,
    issuer: centreEnregistrement,
    address: parsed.adresseDomicile ? String(parsed.adresseDomicile).trim() : null,

    formatDetecte: 'GEMINI_VISION',
  };
};

/**
 * Analyse 100% exacte avec Google Gemini Vision pour TOUS types de documents d'identité
 */
const extraireInfosAvecGemini = async (sourceImage, mimeTypeForm = null) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('La clé GEMINI_API_KEY n\'est pas configurée dans les variables d\'environnement.');
  }

  let buffer = null;
  let mimeType = mimeTypeForm || 'image/jpeg';

  if (Buffer.isBuffer(sourceImage)) {
    buffer = sourceImage;
  } else if (typeof sourceImage === 'string') {
    if (sourceImage.startsWith('data:')) {
      const matchMime = sourceImage.match(/^data:([^;]+);base64,/);
      if (matchMime) mimeType = matchMime[1];
      const base64Data = sourceImage.replace(/^data:[^;]+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');
    } else if (fs.existsSync(sourceImage)) {
      buffer = fs.readFileSync(sourceImage);
      mimeType = (mimeTypeForm && mimeTypeForm !== 'image/jpeg') ? mimeTypeForm : getMimeType(sourceImage);
    } else {
      buffer = Buffer.from(sourceImage, 'base64');
    }
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('Le document fourni est vide ou corrompu.');
  }

  // Prétraitement Sharp si image volumineuse (résolution 1024px optimale pour vitesse ultra-rapide et netteté OCR)
  if (mimeType !== 'application/pdf' && buffer.length > 150 * 1024) {
    try {
      buffer = await sharp(buffer)
        .rotate()
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true, fastShrinkOnLoad: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      mimeType = 'image/jpeg';
    } catch (sharpErr) {
      console.warn('⚠️ Prétraitement sharp ignoré :', sharpErr.message);
    }
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const imagePart = {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType,
    },
  };

  const promptSysteme = `Tu es un système OCR universel d'ultra-précision spécialisé dans l'analyse de tous types de documents officiels (Sénégal, CEDEAO, France, International) :
- Cartes d'Identité (CNI / CIN CEDEAO, Sénégal, France, Afrique de l'Ouest, etc.)
- Passeports (Nationaux et Internationaux)
- Permis de Conduire (Format carte plastifiée ou papier, CEDEAO, Sénégal, France, Europe)
- Cartes Grises (Certificats d'immatriculation de véhicules)
- Cartes Consulaires
- Cartes de Séjour / Titres de séjour / Residence Permits

CONSIGNES PARTICULIÈRES PASSEPORT :
- typePiece: "PASSEPORT"
- nom: Nom de famille du titulaire (SURNAME / NOM).
- prenom: Prénom(s) du titulaire (GIVEN NAMES / PRÉNOMS).
- numeroPiece: Numéro du passeport (ex: "A01234567").
- dateNaissance: Date de naissance au format YYYY-MM-DD.
- lieuNaissance: Lieu de naissance (PLACE OF BIRTH / LIEU DE NAISSANCE).
- sexe: Sexe ('M' ou 'F').
- codePays: Code ISO à 3 lettres du pays émetteur (ex: SEN, FRA, CIV, MLI, GIN, GMB).
- dateDelivrance: Date de délivrance au format YYYY-MM-DD.
- dateExpiration: Date d'expiration au format YYYY-MM-DD.
- mrzLine1, mrzLine2: Les 2 lignes MRZ au bas de la page du passeport si visibles.

CONSIGNES PARTICULIÈRES CARTE NATIONALE D'IDENTITÉ (CNI) :
- typePiece: "CNI"
- nom: Nom de famille du titulaire.
- prenom: Prénom(s) du titulaire.
- nin: Numéro d'Identification National à 13-14 chiffres (ex: "1751199401234").
- numeroPiece: Numéro de la carte CNI. Si absent, utiliser le NIN.
- dateNaissance: Date de naissance au format YYYY-MM-DD.
- lieuNaissance: Lieu / Ville de naissance.
- sexe: Sexe ('M' ou 'F').
- taille: Taille en cm (ex: 175).
- adresseDomicile: Adresse / Domicile figurant sur la carte.
- centreEnregistrement: Centre d'enregistrement ou autorité émettrice.
- dateDelivrance: Date d'émission au format YYYY-MM-DD.
- dateExpiration: Date d'expiration au format YYYY-MM-DD.

CONSIGNES PARTICULIÈRES PERMIS DE CONDUIRE :
- typePiece: "PERMIS"
- nom: Nom de famille du titulaire (champ "1." ou SURNAME / NOM). Ne PAS inclure "1.".
- prenom: Prénom(s) du titulaire (champ "2." ou GIVEN NAMES / PRÉNOM). Ne PAS inclure "2.".
- dateNaissance: Date de naissance issue du champ "3." au format YYYY-MM-DD.
- lieuNaissance: Lieu / Ville de naissance issu du champ "3." ou POB.
- dateDelivrance: Date de délivrance issue du champ "4a." au format YYYY-MM-DD.
- dateExpiration: Date d'expiration issue du champ "4b." au format YYYY-MM-DD.
- centreEnregistrement: Autorité émettrice issue du champ "4c.".
- numeroPiece: Numéro officiel du permis issu du champ "5.". Ne PAS inclure "5.".
- categoriesPermis: Catégories autorisées issues du champ "9." (ex: "A, B", "B", "C1, D").

CONSIGNES PARTICULIÈRES CARTE GRISE :
- typePiece "CARTE_GRISE", immatriculation (champ A), marque (champ D.1), modele (champ D.3), typeVehicule (champ J.1), nom/prenom titulaire.

Tu DOIS répondre EXCLUSIVEMENT au format JSON valide respectant le schéma exact fourni.`;

  const MODES_GEMINI = [
    'gemini-3.5-flash',
    'gemini-3.6-flash',
  ];

  let lastError = null;

  for (const modelName of MODES_GEMINI) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.0,
          maxOutputTokens: 600,
        },
      });

      const result = await model.generateContent([promptSysteme, imagePart]);
      const responseText = result.response.text();

      if (!responseText) {
        throw new Error(`Aucune réponse renvoyée par le modèle ${modelName}`);
      }

      const parsedData = JSON.parse(responseText);
      console.log(`✅ Extraction Gemini réussie pour type ${parsedData.typePiece || 'Inconnu'} avec ${modelName}`);
      return validerEtCorrigerDonnees(parsedData);
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ Tentative Gemini (${modelName}) échouée :`, err.message);
    }
  }

  throw new Error(`Google Gemini Vision Erreur: ${lastError?.message || 'Échec de génération'}`);
};

module.exports = { extraireInfosAvecGemini };
