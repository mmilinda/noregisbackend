const mongoose = require('mongoose');

const visiteurSchema = new mongoose.Schema({
  // Identité
  nom:              { type: String, required: true, maxlength: 100 },
  prenom:           { type: String, required: true, maxlength: 100 },
  dateNaissance:    { type: Date, default: null },
  lieuNaissance:    { type: String, maxlength: 100, default: null },
  sexe:             { type: String, enum: ['M', 'F', null], default: null },
  taille:           { type: Number, min: 50, max: 300, default: null },

  // Pièce d'identité
  numeroPiece:      { type: String, required: true, index: true },
  nin:              { type: String, maxlength: 50, default: null, index: true },
  codePays:         { type: String, maxlength: 10, default: null },
  typePiece:        { 
    type: String, 
    enum: ['CNI', 'PASSEPORT', 'PERMIS', 'CARTE_SEJOUR', 'CARTE_IDENTITE_CEDEAO', 'CARTE_CONSULAIRE'], 
    default: 'CNI' 
  },
  dateDelivrance:   { type: Date, default: null },
  dateExpiration:   { type: Date, default: null },
  centreEnregistrement: { type: String, maxlength: 200, default: null },

  // Contact & Adresse
  telephone:        { type: String, maxlength: 30, default: null },
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

visiteurSchema.pre('validate', function(next) {
  // Normalisation du sexe : Seuls 'M' et 'F' sont acceptés, sinon null (ex: pour Permis où le sexe est absent)
  if (this.sexe) {
    const s = String(this.sexe).toUpperCase().trim();
    if (s === 'M' || s.startsWith('M') || s.includes('HOMME') || s.includes('MASCULIN')) {
      this.sexe = 'M';
    } else if (s === 'F' || s.startsWith('F') || s.includes('FEMME') || s.includes('FEMININ')) {
      this.sexe = 'F';
    } else {
      this.sexe = null;
    }
  } else {
    this.sexe = null;
  }

  // Normalisation du typePiece (ex: "Permis de Conduire" -> "PERMIS")
  if (this.typePiece) {
    const tp = String(this.typePiece).toUpperCase().trim();
    if (tp.includes('PERMIS') || tp.includes('DRIVER') || tp.includes('CONDUIRE')) {
      this.typePiece = 'PERMIS';
    } else if (tp.includes('PASSPORT') || tp.includes('PASSEPORT')) {
      this.typePiece = 'PASSEPORT';
    } else if (tp.includes('CONSULAIRE')) {
      this.typePiece = 'CARTE_CONSULAIRE';
    } else if (tp.includes('SEJOUR') || tp.includes('SÉJOUR')) {
      this.typePiece = 'CARTE_SEJOUR';
    } else if (tp.includes('CEDEAO')) {
      this.typePiece = 'CARTE_IDENTITE_CEDEAO';
    } else if (!['CNI', 'PASSEPORT', 'PERMIS', 'CARTE_SEJOUR', 'CARTE_IDENTITE_CEDEAO', 'CARTE_CONSULAIRE'].includes(tp)) {
      this.typePiece = 'CNI';
    } else {
      this.typePiece = tp;
    }
  } else {
    this.typePiece = 'CNI';
  }

  if (typeof next === 'function') next();
});

module.exports = mongoose.model('Visiteur', visiteurSchema);