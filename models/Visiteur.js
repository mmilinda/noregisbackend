const mongoose = require('mongoose');

const visiteurSchema = new mongoose.Schema({
  // Identité
  nom:              { type: String, required: true, maxlength: 100 },
  prenom:           { type: String, required: true, maxlength: 100 },
  dateNaissance:    { type: Date, default: null },
  lieuNaissance:    { type: String, maxlength: 100, default: null },
  sexe:             { 
    type: String, 
    enum: ['M', 'F', null], 
    default: null,
    set: function(v) {
      if (!v) return null;
      const s = String(v).toUpperCase().trim();
      if (s === 'M' || s.startsWith('M') || s.includes('HOMME') || s.includes('MASCULIN')) return 'M';
      if (s === 'F' || s.startsWith('F') || s.includes('FEMME') || s.includes('FEMININ')) return 'F';
      return null;
    }
  },
  taille:           { type: Number, min: 50, max: 300, default: null },

  // Pièce d'identité
  numeroPiece:      { 
    type: String, 
    required: true, 
    index: true,
    set: function(v) {
      if (!v || !String(v).trim() || String(v).toLowerCase() === 'null' || String(v).toLowerCase() === 'undefined') {
        return `SP_${Date.now().toString().slice(-6)}`;
      }
      return String(v).trim();
    }
  },
  nin:              { type: String, maxlength: 50, default: null, index: true },
  codePays:         { type: String, maxlength: 10, default: null },
  typePiece:        { 
    type: String, 
    enum: [
      'CNI', 'PASSEPORT', 'Passeport', 'PERMIS', 'Permis', 'Permis de Conduire',
      'CARTE_SEJOUR', 'Carte de Séjour', 'Carte de séjour',
      'CARTE_IDENTITE_CEDEAO', 'Carte d\'Identité CEDEAO',
      'CARTE_CONSULAIRE', 'Carte Consulaire',
      'CARTE_GRISE', 'Carte Grise', 'SANS_PIECE', 'Sans pièce d\'identité', 'Sans Pièce', 'NO_ID', 'AUTRE'
    ], 
    default: 'CNI',
    set: function(v) {
      if (!v) return 'CNI';
      const tp = String(v).toUpperCase().trim();
      if (tp.includes('SANS') || tp.includes('NO_ID') || tp.includes('AUCUN')) return 'SANS_PIECE';
      if (tp.includes('PERMIS') || tp.includes('DRIVER') || tp.includes('CONDUIRE')) return 'PERMIS';
      if (tp.includes('PASSPORT') || tp.includes('PASSEPORT')) return 'PASSEPORT';
      if (tp.includes('CONSULAIRE')) return 'CARTE_CONSULAIRE';
      if (tp.includes('SEJOUR') || tp.includes('SÉJOUR')) return 'CARTE_SEJOUR';
      if (tp.includes('CEDEAO')) return 'CARTE_IDENTITE_CEDEAO';
      if (tp.includes('GRISE')) return 'CARTE_GRISE';
      if (['CNI', 'PASSEPORT', 'PERMIS', 'CARTE_SEJOUR', 'CARTE_IDENTITE_CEDEAO', 'CARTE_CONSULAIRE', 'CARTE_GRISE', 'SANS_PIECE', 'AUTRE'].includes(tp)) return tp;
      return 'CNI';
    }
  },
  dateDelivrance:   { type: Date, default: null },
  dateExpiration:   { type: Date, default: null },
  centreEnregistrement: { type: String, maxlength: 200, default: null },

  // Rattachement Multi-tenant
  entrepriseId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Entreprise', default: null, index: true },
  creeParAgentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Utilisateur', default: null, index: true },

  // Contact & Adresse
  telephone:        { type: String, maxlength: 30, default: null },
  adresseDomicile:  { type: String, maxlength: 255, default: null },

  // Données Électorales & Géographiques
  numeroElecteur:   { type: String, maxlength: 100, default: null },
  region:           { type: String, maxlength: 100, default: null },
  departement:      { type: String, maxlength: 100, default: null },
  arrondissement:   { type: String, maxlength: 100, default: null },
  commune:          { type: String, maxlength: 100, default: null },
  lieuDeVote:       { type: String, maxlength: 200, default: null },
  bureauDeVote:     { type: String, maxlength: 50, default: null },

}, { timestamps: true });

module.exports = mongoose.model('Visiteur', visiteurSchema);