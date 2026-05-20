const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const utilisateurSchema = new mongoose.Schema({
  nom:                 { type: String, required: true, maxlength: 100 },
  prenom:              { type: String, maxlength: 100, default: '' },
  email:               { type: String, required: true, unique: true, lowercase: true },
  motDePasse:          { type: String, required: true },
  role:                { type: String, enum: ['AGENT', 'ADMIN'], default: 'AGENT' },
  isActif:             { type: Boolean, default: true },
  telephone:           { type: String, maxlength: 30, default: '' },
  departement:         { type: String, maxlength: 100, default: '' },
  poste:               { type: String, maxlength: 100, default: '' },
  niveauAccreditation: { type: String, maxlength: 50, default: '' },
  dateArrivee:         { type: Date, default: null },
}, { timestamps: true });

utilisateurSchema.pre('save', async function (next) {
  if (!this.isModified('motDePasse')) return next();
  this.motDePasse = await bcrypt.hash(this.motDePasse, 10);
  next();
});

utilisateurSchema.methods.verifierMotDePasse = function (motDePasse) {
  return bcrypt.compare(motDePasse, this.motDePasse);
};

module.exports = mongoose.model('Utilisateur', utilisateurSchema);