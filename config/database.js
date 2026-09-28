const mongoose = require('mongoose');
const dns = require('dns');

// Désactiver le buffering des commandes Mongoose pour éviter le blocage de 10s si la BDD est hors-ligne
mongoose.set('bufferCommands', false);

// Configuration des serveurs DNS Google (8.8.8.8) pour garantir la résolution des domaines SRV MongoDB Atlas sur Windows et en production Cloud
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  console.warn('⚠️ Impossible de configurer le DNS personnalisé :', e.message);
}

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('⚠️ MONGODB_URI non définie dans les variables d\'environnement');
    return;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Base de données MongoDB Atlas connectée avec succès');

    // Alignement automatique des quotas d'entreprises existantes (max 4 agents, max 2 admins)
    try {
      const Entreprise = require('../models/Entreprise');
      await Entreprise.updateMany(
        { $or: [{ maxAgents: { $gt: 4 } }, { maxAgents: 20 }, { maxAdmins: { $gt: 2 } }, { maxAdmins: 5 }, { maxAgents: { $exists: false } }] },
        { $set: { maxAgents: 4, maxAdmins: 2 } }
      );
    } catch (e) {
      // Ignorer silencieusement si la collection n'est pas encore créée
    }
  } catch (err) {
    console.warn('⚠️ Connection MongoDB non disponible (Le serveur continue de fonctionner pour l\'OCR Gemini) :', err.message);
  }
};

module.exports = { connectDB };