const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const utilisateurSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: true,
    maxlength: 100,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  motDePasse: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['AGENT', 'ADMIN'],
    default: 'AGENT',
  },
  isActif: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Hash automatique du mot de passe avant sauvegarde
utilisateurSchema.pre('save', async function (next) {
  if (!this.isModified('motDePasse')) return next();
  try {
    this.motDePasse = await bcrypt.hash(this.motDePasse, 10);
    next();
  } catch (error) {
    next(error);
  }
});

// Méthode pour vérifier le mot de passe
utilisateurSchema.methods.verifierMotDePasse = async function (motDePasse) {
  return bcrypt.compare(motDePasse, this.motDePasse);
};

const Utilisateur = mongoose.model('Utilisateur', utilisateurSchema);

module.exports = Utilisateur;

