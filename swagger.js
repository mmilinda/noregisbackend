const swaggerAutogen = require('swagger-autogen')();

const doc = {
  info: {
    title: 'Registre Visiteurs API',
    description: 'Documentation automatique de l\'API de gestion des visiteurs',
    version: '1.0.0',
  },
  host: 'noregisbackend.onrender.com',
  schemes: ['https'],
  securityDefinitions: {
    BearerAuth: {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description: 'Entrez votre token JWT : Bearer <token>',
    },
  },
  definitions: {
    LoginInput: {
      email: 'admin@example.com',
      motDePasse: 'motdepasse123',
    },
    RegisterInput: {
      nom: 'Jean Dupont',
      email: 'jean@example.com',
      motDePasse: 'motdepasse123',
      role: 'AGENT',
    },
    VisiteurInput: {
      nom: 'Dupont',
      prenom: 'Jean',
      dateNaissance: '1990-05-15',
      numeroPiece: 'CNI123456',
      typePiece: 'CNI',
    },
    EntreeInput: {
      visiteurId: '664f1a2b3c4d5e6f7a8b9c0d',
      personneVisitee: 'Mme Koné',
      service: 'Ressources Humaines',
      motif: 'Entretien d\'embauche',
    },
    Visiteur: {
      _id: '664f1a2b3c4d5e6f7a8b9c0d',
      nom: 'Dupont',
      prenom: 'Jean',
      dateNaissance: '1990-05-15',
      numeroPiece: 'CNI123456',
      typePiece: 'CNI',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    Visite: {
      _id: '664f1a2b3c4d5e6f7a8b9c0e',
      visiteurId: '664f1a2b3c4d5e6f7a8b9c0d',
      personneVisitee: 'Mme Koné',
      service: 'Ressources Humaines',
      heureEntree: '2024-01-01T08:00:00.000Z',
      heureSortie: null,
      statut: 'EN_COURS',
      motif: 'Entretien d\'embauche',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    Utilisateur: {
      _id: '664f1a2b3c4d5e6f7a8b9c0f',
      nom: 'Admin',
      email: 'admin@example.com',
      role: 'ADMIN',
      isActif: true,
    },
    ErrorResponse: {
      success: false,
      message: 'Une erreur est survenue',
    },
    SuccessResponse: {
      success: true,
      message: 'Opération réussie',
    },
  },
};

const outputFile  = './swagger-output.json';
const routes = [
  './routes/auth.js',
  './routes/visiteurs.js',
  './routes/visites.js',
  './routes/scan.js',
  './routes/search.js',
];

swaggerAutogen(outputFile, routes, doc);