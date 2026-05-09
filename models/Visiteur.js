const mongoose = require('mongoose');

const visiteurSchema = new mongoose.Schema({
  nom:           { type: String, required: true, maxlength: 100 },
  prenom:        { type: String, required: true, maxlength: 100 },
  dateNaissance: { type: Date, default: null },
  numeroPiece:   { type: String, required: true, unique: true },
  typePiece:     { type: String, enum: ['CNI', 'PASSEPORT', 'PERMIS', 'CARTE_SEJOUR'], default: 'CNI' },
}, { timestamps: true });

module.exports = mongoose.model('Visiteur', visiteurSchema);