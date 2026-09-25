const mongoose = require('mongoose');

const entrepriseSchema = new mongoose.Schema({
  nom:          { type: String, required: true, maxlength: 100 },
  code:         { type: String, required: true, unique: true, uppercase: true, trim: true },
  adresse:      { type: String, maxlength: 255, default: '' },
  telephone:    { type: String, maxlength: 30, default: '' },
  emailContact: { type: String, maxlength: 100, default: '' },
  statut:       { type: String, enum: ['ACTIF', 'SUSPENDU', 'DESACTIVE'], default: 'ACTIF' },
}, { timestamps: true });

module.exports = mongoose.model('Entreprise', entrepriseSchema);
