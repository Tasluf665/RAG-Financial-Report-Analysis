import multer from 'multer';

const MAX_PDF_SIZE_MB = parseInt(process.env.MAX_PDF_SIZE_MB || '50', 10);
const MAX_UPLOAD_FILES = parseInt(process.env.MAX_UPLOAD_FILES || '10', 10);

const storage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_PDF_SIZE_MB * 1024 * 1024,
    files: MAX_UPLOAD_FILES
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});
