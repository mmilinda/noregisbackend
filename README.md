# 🪪 NoregisBackend — Système de Gestion des Visiteurs & OCR IA (Google Gemini Vision)

[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-blue.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-brightgreen.svg)](https://www.mongodb.com/cloud/atlas)
[![AI Engine](https://img.shields.io/badge/AI_OCR-Google_Gemini_3.6_Flash-orange.svg)](https://aistudio.google.com/)
[![Socket.io](https://img.shields.io/badge/RealTime-Socket.io-black.svg)](https://socket.io/)
[![Deployment](https://img.shields.io/badge/Deployment-Render_/_Vercel-purple.svg)](https://render.com)

**NoregisBackend** est une API REST hautement performante et résiliente conçue pour la gestion d'accès, le badgeage des visiteurs et le contrôle de sécurité. Il intègre un moteur d'IA générative visuelle (**Google Gemini 3.6 Flash Vision**) capable d'analyser en temps réel les pièces d'identité officielles de tous les pays africains et internationaux.

---

## 🌟 Fonctionnalités Clés

- 🤖 **OCR IA Universel (Google Gemini 3.6 Flash)** : 
  - Extraction automatique des cartes d'identité (**CNI CEDEAO Sénégal, Côte d'Ivoire, Mali, etc.**), Passeports (norme ICAO), Permis de conduire, Cartes de séjour & consulaires.
  - Extraction spécifique : **NIN (Numéro d'Identification National)**, **Taille (en cm)**, **Lieu de Naissance**, **Adresse de Domicile**, Nom, Prénom, Sexe, Dates et Nationalité.
  - Fonctionnement **100% en mémoire RAM (Buffer)** : 0 écriture sur disque requise en environnement Serverless (Vercel / Render).
- ⚡ **Résilience & Tolérance aux Pannes** :
  - Démarrage serveur non-bloquant.
  - Configuration de résolveurs DNS Google (`8.8.8.8`) pour la résolution instantanée des clusters cloud MongoDB Atlas SRV.
- 📡 **Notifications Temps Réel (Socket.io)** :
  - Alerte instantanée des agents d'accueil et des gardiens lors d'un scan QR public ou d'une entrée.
- 🔐 **Sécurité & Authentification** :
  - Authentification JWT avec gestion des rôles (`ADMIN`, `AGENT`).
- 📖 **Documentation Interactive** :
  - Documentation Swagger UI disponible sur `/api-docs`.

---

## 📁 Structure du Projet

```text
NoregisBackend/
├── server.js                        ← Point d'entrée principal Express & Socket.io
├── package.json
├── vercel.json                      ← Configuration pour déploiement Vercel Serverless
├── .env.example                     ← Modèle des variables d'environnement
├── config/
│   └── database.js                  ← Connexion MongoDB Atlas (Tolérante aux pannes & DNS Google)
├── models/
│   ├── index.js
│   ├── Visiteur.js                  ← Schéma Visiteur (NIN, Taille, Lieu Naissance, Domicile...)
│   ├── Visite.js                    ← Schéma Historique des Visites
│   ├── Document.js                  ← Métadonnées des scans
│   ├── Utilisateur.js               ← Utilisateurs (Agents / Admins)
│   └── DemandeModification.js
├── controllers/
│   ├── authController.js            ← Inscription / Connexion JWT
│   ├── visiteurController.js        ← CRUD Visiteurs
│   ├── visiteController.js          ← Gestion Entrées / Sorties
│   ├── scanController.js            ← Controller de scan OCR principal
│   ├── publicScanController.js      ← Controller de scan QR public (Non-bloquant)
│   ├── searchController.js          ← Recherche avancée & filtres
│   ├── demandeController.js
│   └── extraction/
│       ├── index.js                 ← Index des extracteurs OCR
│       └── geminiExtractor.js       ← Moteur d'extraction IA Google Gemini 3.6 Flash
├── routes/
│   ├── auth.js
│   ├── visiteurs.js
│   ├── visites.js
│   ├── scan.js
│   ├── publicScan.js
│   ├── search.js
│   └── demandes.js
├── middleware/
│   ├── auth.js                      ← Vérification Token JWT & Rôles
│   └── upload.js                    ← Multer (MemoryStorage sur Cloud, DiskStorage en local)
└── uploads/                         ← Stockage local temporaire (hors production)
```

---

## 🚀 Installation & Démarrage en Local

### 1. Prérequis
- [Node.js](https://nodejs.org/) v18+ 
- Un compte [Google AI Studio](https://aistudio.google.com/) (pour la clé d'API Gemini gratuite)
- Une base de données [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)

### 2. Cloner & Installer
```bash
git clone https://github.com/mmilinda/noregisbackend.git
cd noregisbackend
npm install
```

### 3. Configurer les Variables d'Environnement
Copiez le fichier exemple et remplissez vos identifiants :
```bash
cp .env.example .env
```

Dans `.env` :
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb+srv://utilisateur:motdepasse@cluster0.xxxxx.mongodb.net/registre_visiteurs?retryWrites=true&w=majority
JWT_SECRET=votre_secret_jwt_super_securise
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 4. Démarrer le Serveur
```bash
# Mode développement
npm run dev

# Mode production
npm start
```
Le serveur démarrera sur `http://localhost:3000`. La documentation Swagger sera accessible sur `http://localhost:3000/api-docs`.

---

## ☁️ Déploiement en Production

### 🟣 Déploiement sur Render.com
1. Créez un **Web Service** sur [Render](https://render.com) lié à votre dépôt GitHub.
2. Définissez **Build Command** : `npm install`
3. Définissez **Start Command** : `node server.js`
4. Ajoutez les variables d'environnement dans **Settings ➔ Environment** :
   - `GEMINI_API_KEY` : *(Votre clé Google Gemini)*
   - `MONGODB_URI` : *(Votre chaîne de connexion MongoDB Atlas Cloud)*
   - `JWT_SECRET` : *(Votre secret JWT)*
   - `NODE_ENV` : `production`

---

## 📡 API — Endpoints Principaux

### 🔑 Authentification
| Méthode | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Connexion Agent / Admin et génération du Token JWT |
| `POST` | `/api/auth/register` | Inscription d'un nouvel agent |
| `GET` | `/api/auth/me` | Profil de l'utilisateur connecté |

### 🪪 Scan OCR & Extraction d'Identité
| Méthode | Endpoint | Auth Requise | Description |
|---|---|---|---|
| `POST` | `/api/scan` | 🔒 Oui (JWT) | Scan d'image d'identité via Google Gemini Vision (Multipart / Base64) |
| `POST` | `/api/public-scan` | 🔓 Non (Public) | Scan QR public avec notif Socket.io instantanée |

### 👥 Visiteurs
| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/visiteurs` | Liste des visiteurs enregistrés |
| `POST` | `/api/visiteurs` | Création manuelle d'un visiteur |
| `GET` | `/api/visiteurs/:id` | Détails d'un visiteur |
| `PUT` | `/api/visiteurs/:id` | Modification d'un visiteur |

### 🚪 Visites & Présences
| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/visites` | Historique global des visites |
| `GET` | `/api/visites/en-cours` | Liste des visiteurs actuellement présents sur site |
| `POST` | `/api/visites/entree` | Enregistrer l'entrée d'un visiteur |
| `POST` | `/api/visites/sortie/:id` | Enregistrer la sortie d'un visiteur |

---

## 💡 Exemple de Réponse OCR Gemini Vision (`/api/scan`)

```json
{
  "success": true,
  "message": "Scan terminé avec succès via GEMINI_VISION.",
  "infosExtraites": {
    "nom": "DIOP",
    "prenom": "Mamadou",
    "nin": "1751199500123",
    "numeroPiece": "1751199500123",
    "typePiece": "CARTE_IDENTITE_CEDEAO",
    "dateNaissance": "1995-04-12",
    "lieuNaissance": "Dakar",
    "sexe": "M",
    "taille": 175,
    "adresseDomicile": "Villa 45, Quartier HLM, Dakar",
    "centreEnregistrement": "Dakar Centre",
    "nationalite": "Sénégalaise",
    "dateDelivrance": "2020-01-15",
    "dateExpiration": "2030-01-14",
    "formatDetecte": "GEMINI_VISION"
  }
}
```

---

## 📄 Licence

Ce projet est sous licence MIT — Libre pour toute réutilisation et déploiement.
