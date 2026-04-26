const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const utilisateurSchema = new mongoose.Schema({
  nom:        { type: String, required: true, maxlength: 100 },
  email:      { type: String, required: true, unique: true, lowercase: true },
  motDePasse: { type: String, required: true },
  role:       { type: String, enum: ['AGENT', 'ADMIN'], default: 'AGENT' },
  isActif:    { type: Boolean, default: true },
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