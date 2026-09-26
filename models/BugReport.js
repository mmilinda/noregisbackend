const mongoose = require('mongoose');

const reponseSchema = new mongoose.Schema({
  auteurId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Utilisateur', required: true },
  nomAuteur:  { type: String, default: '' },
  roleAuteur: { type: String, default: '' },
  message:    { type: String, required: true },
  createdAt:  { type: Date, default: Date.now }
});

const bugReportSchema = new mongoose.Schema({
  titre:                { type: String, required: true, maxlength: 200 },
  description:          { type: String, required: true },
  priorite:             { type: String, enum: ['BASSE', 'MOYENNE', 'HAUTE', 'CRITIQUE'], default: 'MOYENNE' },
  statut:               { type: String, enum: ['OUVERT', 'EN_COURS', 'RESOLU', 'FERME'], default: 'OUVERT' },
  signaleParId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Utilisateur', required: true, index: true },
  roleSignaleur:        { type: String, default: 'AGENT' },
  nomSignaleur:         { type: String, default: '' },
  entrepriseId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Entreprise', default: null, index: true },
  entrepriseNom:        { type: String, default: '' },
  transmisAuSuperAdmin: { type: Boolean, default: true },
  reponseSuperAdmin:    { type: String, default: '' },
  reponses:             [reponseSchema]
}, { timestamps: true });

module.exports = mongoose.model('BugReport', bugReportSchema);
