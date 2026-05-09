// models/Visiteur.js
const mongoose = require('mongoose');

const visiteurSchema = new mongoose.Schema({
  nom:           { type: String, required: true, maxlength: 100 },
  prenom:        { type: String, required: true, maxlength: 100 },
  dateNaissance: { type: Date, default: null },
  numeroPiece:   { type: String, required: true, unique: true },
  typePiece:     { 
    type: String, 
    enum: ['CNI', 'PASSEPORT', 'PERMIS', 'CARTE_SEJOUR'], 
    default: 'CNI' 
  },
}, { timestamps: true });

// Middleware pre-save : normalise le typePiece avant validation
visiteurSchema.pre('save', function(next) {
  const mapping = {
    'Carte Nationale d\'Identité': 'CNI',
    "Carte Nationale d'Identité": 'CNI',
    'Carte Nationale d’Identité': 'CNI',
    'Passeport': 'PASSEPORT',
    'Permis de conduire': 'PERMIS',
    'Carte de séjour': 'CARTE_SEJOUR',
  };
  if (mapping[this.typePiece]) {
    this.typePiece = mapping[this.typePiece];
  }
  next();
});

module.exports = mongoose.model('Visiteur', visiteurSchema);