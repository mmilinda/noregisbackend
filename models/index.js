const Visiteur    = require('./Visiteur');
const Visite      = require('./Visite');
const Document    = require('./Document');
const Utilisateur = require('./Utilisateur');

// ================================
// ASSOCIATIONS (via references en MongoDB)
// ================================

// Un visiteur peut avoir plusieurs visites
// Visite a une référence vers Visiteur via visiteurId (voir Visite.js)

// Un visiteur peut avoir plusieurs documents
// Document a une référence vers Visiteur via visiteurId (voir Document.js)

module.exports = {
  Visiteur,
  Visite,
  Document,
  Utilisateur,
};
