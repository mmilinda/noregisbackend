const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  visiteurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Visiteur',
    default: null,
  },
  nomFichier: {
    type: String,
    required: true,
    maxlength: 255,
  },
  cheminFichier: {
    type: String,
    required: true,
    maxlength: 500,
  },
  typeMime: {
    type: String,
    required: true,
    maxlength: 50,
  },
  tailleFichier: {
    type: Number,
    required: true,
  },
  estArchive: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

const Document = mongoose.model('Document', documentSchema);

module.exports = Document;
