const mongoose = require('mongoose');
const dns = require('dns');

// Configuration des serveurs DNS Google (8.8.8.8) pour garantir la résolution des domaines SRV MongoDB Atlas sur Windows et en production Cloud
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
  console.warn('⚠️ Impossible de configurer le DNS personnalisé :', e.message);
}

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('⚠️ MONGODB_URI non définie dans .env');
    return;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log('✅ Base de données MongoDB Atlas connectée avec succès');
  } catch (err) {
    console.warn('⚠️ Impossible de se connecter à MongoDB (Le serveur continue de fonctionner pour les scans) :', err.message);
  }
};

module.exports = { connectDB };