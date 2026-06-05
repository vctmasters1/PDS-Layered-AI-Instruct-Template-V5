import multer from 'multer';
import path from 'path';
import { RICH_EXTENSIONS } from '../services/text-extractor.js';

const ALLOWED_EXTENSIONS = new Set(['.md', '.txt']);

// Broader set for the "other" skills-analysis drop zone — anything text-readable
const ALLOWED_EXTENSIONS_OTHER = new Set([
  '.md', '.txt', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.cs', '.cpp', '.c', '.h',
  '.html', '.css', '.scss', '.json', '.yaml', '.yml', '.toml', '.xml',
  '.sh', '.bash', '.ps1', '.sql', '.graphql', '.proto', '.swift', '.kt',
  '.eml', '.csv',
]);

const MAX_SIZE_BYTES     = 2 * 1024 * 1024;  // 2 MB — plain text/code
const MAX_SIZE_RICH      = 15 * 1024 * 1024; // 15 MB — docs, PDFs, images

// Use memory storage — the file-store service decides where to write.
const storage = multer.memoryStorage();

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Only .md and .txt files are allowed. Got: ${ext}`));
  }
}

function fileFilterOther(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS_OTHER.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${ext}. Upload a text-based file (code, email, document, etc.)`));
  }
}

function fileFilterRich(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (RICH_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${ext}. Accepted: documents (.docx, .pdf), images (.jpg, .png, .webp, …), or any text/code file.`));
  }
}

export const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter,
});

export const uploadOther = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES },
  fileFilter: fileFilterOther,
});

// Rich uploader: accepts docs, images, and all text formats. Converts to text at the route layer.
export const uploadRich = multer({
  storage,
  limits: { fileSize: MAX_SIZE_RICH },
  fileFilter: fileFilterRich,
});
