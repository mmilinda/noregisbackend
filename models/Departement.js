const mongoose = require('mongoose');

const departementSchema = new mongoose.Schema({
  nom:          { type: String, required: true, maxlength: 100 },
  code:         { type: String, maxlength: 30, default: '' },
  description:  { type: String, maxlength: 255, default: '' },
  entrepriseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entreprise', required: true, index: true },
  statut:       { type: String, enum: ['ACTIF', 'DESACTIVE'], default: 'ACTIF' },
}, { timestamps: true });

// Unicité du nom par entreprise
departementSchema.index({ entrepriseId: 1, nom: 1 }, { unique: true });

module.exports = mongoose.model('Departement', departementSchema);
