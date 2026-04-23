const Tesseract = require('tesseract.js');
const { Document } = require('../models');
const path = require('path');
const fs   = require('fs');

// ================================
// SCANNER UNE IMAGE
// ================================
const scannerImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucune image reçue.' });
    }

    const cheminFichier = req.file.path;

    // Sauvegarder le document en base
    const document = await Document.create({
      nomFichier:    req.file.filename,
      cheminFichier: cheminFichier,
      typeMime:      req.file.mimetype,
      tailleFichier: req.file.size,
    });

    // Lancer l'OCR avec Tesseract
    console.log('🔍 OCR en cours...');
    const { data: { text } } = await Tesseract.recognize(
      cheminFichier,
      'fra+eng', // Langue : français + anglais
      { logger: () => {} }
    );

    // Extraire les informations depuis le texte brut
    const infosExtraites = extraireInfosPiece(text);

    res.json({
      success: true,
      message: 'Scan terminé.',
      document: {
        id:            document.id,
        nomFichier:    document.nomFichier,
        cheminFichier: document.cheminFichier,
      },
      infosExtraites,
      texteRaw: text, // Pour debug si besoin
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ================================
// EXTRACTION DES INFOS (regex)
// ================================
const extraireInfosPiece = (texte) => {
  const texteNormalise = texte.toUpperCase().replace(/\s+/g, ' ');

  const infos = {
    nom:          null,
    prenom:       null,
    numeroPiece:  null,
    typePiece:    null,
    dateNaissance: null,
  };

  // Détecter le type de pièce
  if (texteNormalise.includes('PASSEPORT'))       infos.typePiece = 'PASSEPORT';
  else if (texteNormalise.includes('PERMIS'))      infos.typePiece = 'PERMIS';
  else if (texteNormalise.includes('CARTE NATIONALE') ||
           texteNormalise.includes('CNI'))         infos.typePiece = 'CNI';
  else                                             infos.typePiece = 'CNI';

  // Extraire le numéro de pièce (format SN + chiffres ou lettres)
  const regexNumero = /(?:N[°º]?|NO\.?|NUMBER)[\s:]*([A-Z0-9]{6,15})/i;
  const matchNumero = texte.match(regexNumero);
  if (matchNumero) infos.numeroPiece = matchNumero[1].trim();

  // Extraire la date de naissance
  const regexDate = /(?:N[ÉE]{1,2}[\s(]*LE|DATE\s+DE\s+NAISSANCE|D\.O\.B)[\s:]*(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4})/i;
  const matchDate = texte.match(regexDate);
  if (matchDate) {
    const [jour, mois, annee] = matchDate[1].split(/[\/\-\.]/);
    infos.dateNaissance = `${annee}-${mois}-${jour}`;
  }

  // Extraire NOM et PRÉNOM via lignes MRZ (Machine Readable Zone)
  const lignesMRZ = texte.match(/[A-Z<]{20,}/g);
  if (lignesMRZ && lignesMRZ.length >= 1) {
    const ligneMRZ = lignesMRZ[0].replace(/</g, ' ').trim();
    const parties  = ligneMRZ.split('  ').filter(Boolean);
    if (parties.length >= 2) {
      infos.nom    = parties[0].trim();
      infos.prenom = parties[1].trim();
    }
  }

  // Fallback : chercher NOM et PRÉNOM en clair
  if (!infos.nom) {
    const regexNom = /(?:NOM|SURNAME|NAME)[\s:]*([A-ZÉÈÀÙÂÊÎÔÛÇ\- ]+)/i;
    const m = texte.match(regexNom);
    if (m) infos.nom = m[1].trim();
  }

  if (!infos.prenom) {
    const regexPrenom = /(?:PRÉNOM|PRENOM|GIVEN NAME|FIRST NAME)[\s:]*([A-ZÉÈÀÙÂÊÎÔÛÇ\- ]+)/i;
    const m = texte.match(regexPrenom);
    if (m) infos.prenom = m[1].trim();
  }

  return infos;
};

module.exports = { scannerImage };
