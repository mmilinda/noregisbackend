require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { connectDB } = require('./config/database');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/visiteurs', require('./routes/visiteurs'));
app.use('/api/visites',   require('./routes/visites'));
app.use('/api/scan',      require('./routes/scan'));
app.use('/api/search',    require('./routes/search'));

app.get('/', (req, res) => {
  res.json({ message: 'Registre Visiteurs API — OK', version: '1.0.0' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Erreur serveur',
  });
});

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Erreur démarrage :', err.message);
    process.exit(1);
  }
})();