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
 * Normalise les dates sous forme de chaîne YYYY-MM-DD
 */
const normaliserDate = (valeur) => {
  if (!valeur || typeof valeur !== 'string') return null;
  const str = valeur.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const matchFr = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (matchFr) {
    const [, d, m, y] = matchFr;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const matchIso = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (matchIso) {
    const [, y, m, d] = matchIso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return str;
};

/**
 * Nettoie les numéros de pièce et NIN
 */
const nettoyerNumeroPiece = (valeur) => {
  if (!valeur) return null;
  let str = String(valeur).trim();
  str = str.replace(/^(N°\s*DE\s*LA\s*CARTE|N°\s*CNI|N°|CNI|NIN|ID|PASSEPORT|PASSPORT|NUMBER|NUMERO|CARD)\s*:?\s*/i, '');
  return str.trim() || null;
};

/**
 * Nettoie les noms, prénoms et lieux de naissance
 */
const nettoyerNomPrenom = (valeur) => {
  if (!valeur) return null;
  let str = String(valeur).trim();
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

    // 2. Ligne NIN / Numéro de pièce MRZ (ex: "I<SEN17511994012344<<<<<<<<<<<<<")
    const matchNinMrz = line.match(/(?:[A-Z0-9<]{2,5})(\d{13,14})\d/);
    if (matchNinMrz) {
      res.nin = matchNinMrz[1];
      res.numeroPiece = matchNinMrz[1];
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
  let typePiece = parsed.typePiece || 'CNI';
  const rawTextUpper = JSON.stringify(parsed).toUpperCase();

  if (mrzRaw.startsWith('P<') || rawTextUpper.includes('PASSPORT') || rawTextUpper.includes('PASSEPORT')) {
    typePiece = 'PASSEPORT';
  } else if (rawTextUpper.includes('PERMIS DE CONDUIRE') || rawTextUpper.includes('DRIVING LICENCE') || parsed.categoriesPermis) {
    typePiece = 'PERMIS';
  } else if (rawTextUpper.includes('CARTE GRISE') || rawTextUpper.includes('IMMATRICULATION') || parsed.immatriculation || parsed.marque) {
    typePiece = 'CARTE_GRISE';
  } else if (rawTextUpper.includes('CONSULAIRE') || rawTextUpper.includes('CONSULAR')) {
    typePiece = 'CARTE_CONSULAIRE';
  } else if (rawTextUpper.includes('SÉJOUR') || rawTextUpper.includes('SEJOUR') || rawTextUpper.includes('RESIDENCE PERMIT')) {
    typePiece = 'CARTE_SEJOUR';
  }

  // 3. NIN & Numéro de pièce
  const allText = `${mrzDecoded.nin || ''} ${parsed.nin || ''} ${parsed.numeroPiece || ''}`;
  const matchNinChiffres = allText.match(/(?:^|\D)(\d{13,14})(?:\D|$)/);
  
  let nin = mrzDecoded.nin || (matchNinChiffres ? matchNinChiffres[1] : (parsed.nin ? String(parsed.nin).replace(/\D/g, '') : null));
  if (nin && nin.length < 8) nin = null;

  let numeroPiece = mrzDecoded.numeroPiece || parsed.immatriculation || nettoyerNumeroPiece(parsed.numeroPiece) || nin;

  // 4. Normalisation des dates
  let dateNaissance = mrzDecoded.dateNaissance || normaliserDate(parsed.dateNaissance);
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

  return {
    nom,
    prenom,
    dateNaissance,
    lieuNaissance,
    sexe: mrzDecoded.sexe || (parsed.sexe || '').toUpperCase().trim() || null,
    taille: parseTailleCentimetres(parsed.taille),
    numeroPiece,
    nin,
    codePays: parsed.codePays ? String(parsed.codePays).toUpperCase().trim() : 'SEN',
    typePiece,
    dateDelivrance,
    dateExpiration,
    centreEnregistrement: parsed.centreEnregistrement ? String(parsed.centreEnregistrement).trim() : null,
    adresseDomicile: parsed.adresseDomicile ? String(parsed.adresseDomicile).trim() : null,
    nationalite: parsed.nationalite ? String(parsed.nationalite).trim() : null,

    // Champs Carte Grise
    immatriculation: parsed.immatriculation || (typePiece === 'CARTE_GRISE' ? numeroPiece : null),
    marque: parsed.marque ? String(parsed.marque).trim() : null,
    modele: parsed.modele ? String(parsed.modele).trim() : null,
    couleur: parsed.couleur ? String(parsed.couleur).trim() : null,
    typeVehicule: parsed.typeVehicule ? String(parsed.typeVehicule).trim() : null,

    // Champs Permis
    categoriesPermis: parsed.categoriesPermis ? String(parsed.categoriesPermis).trim() : null,

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
    issuedAt: dateDelivrance,
    expiresAt: dateExpiration,
    issuer: parsed.centreEnregistrement ? String(parsed.centreEnregistrement).trim() : null,
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

  // Prétraitement Sharp si image volumineuse
  if (mimeType !== 'application/pdf' && buffer.length > 500 * 1024) {
    try {
      buffer = await sharp(buffer)
        .rotate()
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true, fastShrinkOnLoad: true })
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

  const promptSysteme = `Tu es un système OCR universel d'ultra-précision spécialisé dans l'analyse de documents officiels :
- Cartes d'Identité (CNI / CIN CEDEAO, Sénégal, France, Afrique de l'Ouest, etc.)
- Passeports (Nationaux et Internationaux)
- Permis de Conduire
- Cartes Grises (Certificats d'immatriculation de véhicules)
- Cartes Consulaires
- Cartes de Séjour / Titres de séjour / Residence Permits

CONSIGNES D'EXTRACTION STRICTES SELON LE TYPE DE DOCUMENT DÉTECTÉ :

1. **DÉTERMINER typePiece** :
   - 'CNI' pour Carte d'Identité Nationale / CNI CEDEAO.
   - 'PASSEPORT' pour tout passeport.
   - 'PERMIS' pour un permis de conduire.
   - 'CARTE_GRISE' pour une carte grise / certificat d'immatriculation.
   - 'CARTE_CONSULAIRE' pour une carte consulaire.
   - 'CARTE_SEJOUR' pour un titre / carte de séjour.

2. **POUR PASSEPORT, CNI, PERMIS, CARTE CONSULAIRE & CARTE DE SÉJOUR** :
   - **nom** : Nom de famille exact (SURNAME). Ne jamais inclure le prénom !
   - **prenom** : Prénom(s) exacts (GIVEN NAMES). Ne jamais inclure le nom !
   - **dateNaissance** : Format YYYY-MM-DD.
   - **lieuNaissance** : Ville/Lieu de naissance.
   - **numeroPiece** : Numéro officiel du document (N° CNI, N° Passeport, N° Permis, N° Titre de Séjour, N° Carte Consulaire).
   - **nin** : Numéro d'Identification National à 13-14 chiffres si présent.
   - **dateDelivrance** et **dateExpiration** : Format YYYY-MM-DD.
   - **sexe** ('M' ou 'F') et **taille** (en cm).
   - **nationalite** : Pays d'origine/nationalité.
   - **centreEnregistrement** : Consulat/Ambassade/Préfecture émettrice.
   - **mrzLine1**, **mrzLine2**, **mrzLine3** : Les lignes MRZ au bas du document si présentes.

3. **POUR CARTE GRISE / VÉHICULE** :
   - **immatriculation** : Numéro de plaque d'immatriculation (ex: "DK-1234-AB", "1234 AB 01").
   - **numeroPiece** : Mettre l'immatriculation du véhicule.
   - **marque** : Marque du véhicule (ex: Toyota, Peugeot, Renault, Mitsubishi).
   - **modele** : Modèle (ex: Hilux, Corolla, Duster, Canter).
   - **couleur** : Couleur du véhicule si mentionnée (ex: Blanc, Gris, Noir).
   - **typeVehicule** : Genre du véhicule (ex: Voiture, Camion, Moto, Bus).
   - **nom** et **prenom** : Nom et Prénom du titulaire du véhicule si indiqués.`;

  const MODES_GEMINI = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b'
  ];

  let lastError = null;

  for (const modelName of MODES_GEMINI) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
          temperature: 0.0,
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
