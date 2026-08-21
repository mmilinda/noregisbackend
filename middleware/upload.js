const multer = require('multer');
const path = require('path');
const fs = require('fs');

const isServerless = !!process.env.VERCEL || process.env.NODE_ENV === 'production';

let storage;

if (isServerless) {
  // Sur Vercel (environnement Serverless avec système de fichier en lecture seule) : stockage en mémoire
  storage = multer.memoryStorage();
} else {
  // En local : stockage sur disque dans uploads/
  const uploadDir = process.env.UPLOAD_DIR || 'uploads';
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `scan_${unique}${path.extname(file.originalname)}`);
    },
  });
}

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format de fichier non accepté (JPEG, PNG, WebP, PDF uniquement)'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 },
});

module.exports = upload;