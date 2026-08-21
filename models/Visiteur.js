const mongoose = require('mongoose');

const visiteurSchema = new mongoose.Schema({
  // Identité
  nom:              { type: String, required: true, maxlength: 100 },
  prenom:           { type: String, required: true, maxlength: 100 },
  dateNaissance:    { type: Date, default: null },
  lieuNaissance:    { type: String, maxlength: 100, default: null },
  sexe:             { type: String, enum: ['M', 'F'], default: null },
  taille:           { type: Number, min: 50, max: 300, default: null },

  // Pièce d'identité
  numeroPiece:      { type: String, required: true, unique: true },
  nin:              { type: String, maxlength: 50, default: null },
  codePays:         { type: String, maxlength: 10, default: null },
  typePiece:        { 
    type: String, 
    enum: ['CNI', 'PASSEPORT', 'PERMIS', 'CARTE_SEJOUR', 'CARTE_IDENTITE_CEDEAO', 'CARTE_CONSULAIRE'], 
    default: 'CNI' 
  },
  dateDelivrance:   { type: Date, default: null },
  dateExpiration:   { type: Date, default: null },
  centreEnregistrement: { type: String, maxlength: 200, default: null },

  // Adresse
  adresseDomicile:  { type: String, maxlength: 255, default: null },

  // Données Électorales & Géographiques
  numeroElecteur:   { type: String, maxlength: 100, default: null },
  region:           { type: String, maxlength: 100, default: null },
  departement:      { type: String, maxlength: 100, default: null },
  arrondissement:   { type: String, maxlength: 100, default: null },
  commune:          { type: String, maxlength: 100, default: null },
  lieuDeVote:       { type: String, maxlength: 200, default: null },
  bureauDeVote:     { type: String, maxlength: 50, default: null },

}, { timestamps: true });

module.exports = mongoose.model('Visiteur', visiteurSchema);