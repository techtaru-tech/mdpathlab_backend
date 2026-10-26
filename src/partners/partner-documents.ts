import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { diskStorage } from 'multer';
import { IMAGE_OR_DOCUMENT_EXTENSIONS } from '../common/upload-safety.js';

// Registration and identity documents are personal data: /uploads/partner-documents/ is in PROTECTED_PREFIXES
// (common/signed-upload-urls.ts), so a file is only ever reachable through a signed, expiring link.
const UPLOAD_DIR = join(process.cwd(), 'uploads', 'partner-documents');
// diskStorage never creates its destination — same pattern as prescriptions.controller.ts.
mkdirSync(UPLOAD_DIR, { recursive: true });

export const partnerDocumentStorage = diskStorage({
  destination: UPLOAD_DIR,
  // The stored extension comes from the declared type, never the client's filename; resolveUploadType then
  // corrects it from the file's real bytes (or deletes the file).
  filename: (_req, file, cb) => cb(null, randomUUID() + (IMAGE_OR_DOCUMENT_EXTENSIONS[file.mimetype] ?? '.bin')),
});
