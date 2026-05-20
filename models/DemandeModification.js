const mongoose = require('mongoose');

const demandeModificationSchema = new mongoose.Schema({
  utilisateur: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: true,
  },
  modifications: {
    type: Object,  // ex: { telephone: '+226 70 00 00 00', departement: 'RH' }
    required: true,
  },
  motif: {
    type: String,
    maxlength: 500,
    default: '',
  },
  statut: {
    type: String,
    enum: ['en_attente', 'approuve', 'rejete'],
    default: 'en_attente',
  },
  traiteePar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    default: null,
  },
  motifRejet: {
    type: String,
    maxlength: 500,
    default: '',
  },
}, { timestamps: true });

module.exports = mongoose.model('DemandeModification', demandeModificationSchema);
