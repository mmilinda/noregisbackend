const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// Créer le dossier uploads s'il n'existe pas
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuration du stockage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `scan_${timestamp}${ext}`);
  },
});

// Filtre : seulement images et PDF
const fileFilter = (req, file, cb) => {
  const typesAcceptes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (typesAcceptes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format non accepté. Utilisez JPG, PNG, WEBP ou PDF.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5 MB max
  },
});

module.exports = upload;
