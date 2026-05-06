const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const uploadDir = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, `scan_${Date.now()}${path.extname(file.originalname)}`),
});

const fileFilter = (req, file, cb) => {
  const typesAcceptes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  typesAcceptes.includes(file.mimetype)
    ? cb(null, true)
    : cb(new Error('Format non accepté.'), false);
};

module.exports = multer({
  storage,
  fileFilter,
  // ✅ Augmenté à 10MB pour supporter les photos de caméra mobile
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 },
});
