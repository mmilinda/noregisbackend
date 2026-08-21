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
  } catch (err) {
    console.warn('⚠️ Connection MongoDB non disponible (Le serveur continue de fonctionner pour l\'OCR Gemini) :', err.message);
  }
};

module.exports = { connectDB };