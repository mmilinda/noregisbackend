const mongoose = require('mongoose');

const visiteSchema = new mongoose.Schema({
  visiteurId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Visiteur', required: true },
  agentId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Utilisateur', default: null, index: true },
  entrepriseId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Entreprise', default: null, index: true },
  personneVisitee: { type: String, required: true, maxlength: 150 },
  service:         { type: String, required: true, maxlength: 100 },
  heureEntree:     { type: Date, default: null },
  heureSortie:     { type: Date, default: null },
  dateRendezVous:  { type: Date, default: null },
  statut:          { type: String, enum: ['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE'], default: 'EN_COURS' },
  motif:           { type: String, maxlength: 255, default: null },
  notes:           { type: String, maxlength: 500, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Visite', visiteSchema);