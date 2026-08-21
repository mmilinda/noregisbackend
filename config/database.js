const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('⚠️ MONGODB_URI non définie dans .env');
    return;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    console.log('✅ Base de données MongoDB connectée avec succès');
  } catch (err) {
    console.warn('⚠️ Impossible de se connecter à MongoDB (Le serveur continue de fonctionner pour les scans) :', err.message);
  }
};

module.exports = { connectDB };