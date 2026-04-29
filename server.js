require('dotenv').config();
const express       = require('express');
const cors          = require('cors');
const path          = require('path');
const http          = require('http');
const { Server }    = require('socket.io');
const { connectDB } = require('./config/database');
const swaggerUi     = require('swagger-ui-express');
const swaggerOutput = require('./swagger-output.json');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// Rendre io accessible dans tous les controllers
app.set('io', io);

io.on('connection', (socket) => {
  console.log('🟢 Socket connecté :', socket.id);
  socket.on('disconnect', () => console.log('🔴 Socket déconnecté :', socket.id));
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api-docs',   swaggerUi.serve, swaggerUi.setup(swaggerOutput));
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
  res.status(err.status || 500).json({ success: false, message: err.message || 'Erreur serveur' });
});

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await connectDB();
    server.listen(PORT, () => {
      console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Erreur démarrage :', err.message);
    process.exit(1);
  }
})();
