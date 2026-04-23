# Registre des Visiteurs — Backend Node.js

## Structure du projet

```
registre-backend/
├── server.js               ← Point d'entrée
├── package.json
├── .env.example            ← Copier en .env et remplir
├── database.sql            ← Script SQL à exécuter une fois
├── config/
│   └── database.js         ← Connexion MySQL
├── models/
│   ├── index.js            ← Associations entre tables
│   ├── Visiteur.js
│   ├── Visite.js
│   ├── Document.js
│   └── Utilisateur.js
├── controllers/
│   ├── authController.js
│   ├── visiteurController.js
│   ├── visiteController.js
│   ├── scanController.js
│   └── searchController.js
├── routes/
│   ├── auth.js
│   ├── visiteurs.js
│   ├── visites.js
│   ├── scan.js
│   └── search.js
├── middleware/
│   ├── auth.js             ← Vérification JWT
│   └── upload.js           ← Gestion des fichiers
└── uploads/                ← Photos scannées (auto-créé)
```

## Installation

```bash
# 1. Installer les dépendances
npm install

# 2. Configurer l'environnement
cp .env.example .env
# Modifier .env avec tes paramètres MySQL

# 3. Créer la base de données
mysql -u root -p < database.sql

# 4. Démarrer le serveur
npm run dev
```

## API — Liste des endpoints

### Authentification
| Méthode | URL | Description |
|---------|-----|-------------|
| POST | `/api/auth/login` | Connexion |
| POST | `/api/auth/register` | Créer un agent |
| GET | `/api/auth/me` | Mon profil |

### Visiteurs
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/visiteurs` | Liste des visiteurs |
| POST | `/api/visiteurs` | Créer un visiteur |
| GET | `/api/visiteurs/:id` | Un visiteur |
| PUT | `/api/visiteurs/:id` | Modifier |

### Visites
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/visites` | Historique |
| GET | `/api/visites/en-cours` | Présents maintenant |
| POST | `/api/visites/entree` | Enregistrer entrée |
| POST | `/api/visites/sortie/:id` | Enregistrer sortie |

### Scan OCR
| Méthode | URL | Description |
|---------|-----|-------------|
| POST | `/api/scan` | Scanner une pièce |

### Recherche
| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/api/search?query=Diallo` | Recherche par nom |
| GET | `/api/search?statut=EN_COURS` | Filtre par statut |
| GET | `/api/search?dateDebut=2024-01-01` | Filtre par date |

## Exemple d'utilisation

### 1. Se connecter
```bash
POST /api/auth/login
{ "email": "admin@securite.sn", "motDePasse": "password" }
```

### 2. Scanner une pièce
```bash
POST /api/scan
Authorization: Bearer <token>
Content-Type: multipart/form-data
Body: image = [fichier.jpg]
```

### 3. Enregistrer une entrée
```bash
POST /api/visites/entree
Authorization: Bearer <token>
{
  "visiteurId": 1,
  "personneVisitee": "M. Ba",
  "service": "Comptabilité"
}
```

### 4. Enregistrer une sortie
```bash
POST /api/visites/sortie/1
Authorization: Bearer <token>
```
