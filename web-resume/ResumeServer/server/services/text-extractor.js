import path from 'path';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { llm } from './llm-client.js';

// Plain text / code formats — returned as-is
const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.cs', '.cpp', '.c', '.h',
  '.html', '.css', '.scss', '.json', '.yaml', '.yml', '.toml', '.xml',
  '.sh', '.bash', '.ps1', '.sql', '.graphql', '.proto', '.swift', '.kt',
  '.eml', '.csv',
]);

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif',
]);

const IMAGE_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.tiff': 'image/tiff', '.tif': 'image/tiff',
};

export const RICH_EXTENSIONS = new Set([
  ...TEXT_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  '.docx', '.pdf',
]);

/**
 * Extract plain text from a file buffer.
 * - Text/code: decoded as UTF-8
 * - .docx: mammoth raw text extraction
 * - .pdf: pdf-parse text extraction
 * - Images: LLM vision OCR
 * @returns {Promise<string>}
 */
export async function extractText(buffer, originalFilename) {
  const ext = path.extname(originalFilename).toLowerCase();

  if (TEXT_EXTENSIONS.has(ext)) {
    return buffer.toString('utf8');
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value.trim()) throw new Error('Could not extract text from the .docx file.');
    return result.value;
  }

  if (ext === '.pdf') {
    const data = await pdfParse(buffer);
    if (!data.text.trim()) throw new Error('Could not extract text from the PDF — it may be image-only. Try uploading as an image instead.');
    return data.text;
  }

  if (IMAGE_EXTENSIONS.has(ext)) {
    const mime = IMAGE_MIME[ext] ?? 'image/jpeg';
    const base64 = buffer.toString('base64');
    return llm.vision(base64, mime);
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

/**
 * Derive the on-disk storage filename.
 * Binary/image formats are stored as .txt after extraction.
 * .md files keep their extension. Everything else becomes .txt.
 */
export function storageFilename(sanitizedName) {
  const ext = path.extname(sanitizedName).toLowerCase();
  const base = sanitizedName.slice(0, sanitizedName.length - ext.length);
  if (ext === '.md') return `${base}.md`;
  return `${base}.txt`;
}
