const mongoose = require('mongoose');

const visiteSchema = new mongoose.Schema({
  visiteurId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Visiteur', required: true },
  personneVisitee: { type: String, required: true, maxlength: 150 },
  service:         { type: String, required: true, maxlength: 100 },
  heureEntree:     { type: Date, default: Date.now },
  heureSortie:     { type: Date, default: null },
  statut:          { type: String, enum: ['EN_COURS', 'TERMINE', 'ANNULE'], default: 'EN_COURS' },
  motif:           { type: String, maxlength: 255, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Visite', visiteSchema);