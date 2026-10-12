import { open, rename, unlink } from 'fs/promises';

// File types a patient/phlebotomist may upload, with the ONLY extension each is stored under. The extension on
// disk (and so the Content-Type the file is later served with) comes from this map, never from the client's
// filename — otherwise an "image" named rx.html would be saved and served back as a web page.
export const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const IMAGE_OR_DOCUMENT_EXTENSIONS: Record<string, string> = {
  ...IMAGE_EXTENSIONS,
  'image/heic': '.heic',
  'image/heif': '.heif',
  'application/pdf': '.pdf',
};

// Résumés on the Careers page: PDF, Word (.docx) and old Word (.doc).
export const RESUME_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/msword': '.doc',
};

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'heif']);

/** True when the first bytes really are the declared file type (a client can claim any mimetype). */
export function bytesMatchType(head: Buffer, mimetype: string): boolean {
  switch (mimetype) {
    case 'image/jpeg':
      return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case 'image/png':
      return head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/webp':
      return head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP';
    case 'application/pdf':
      return head.length >= 5 && head.toString('latin1', 0, 5) === '%PDF-';
    case 'image/heic':
    case 'image/heif':
      return head.length >= 12 && head.toString('latin1', 4, 8) === 'ftyp' && HEIF_BRANDS.has(head.toString('latin1', 8, 12));
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
    case 'application/msword':
      return head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    default:
      return false;
  }
}

/**
 * Checks a file multer already saved. On any mismatch the file is deleted and false is returned, so a rejected
 * upload never stays on disk.
 */
export async function verifySavedUpload(path: string, mimetype: string): Promise<boolean> {
  let ok = false;
  try {
    const handle = await open(path, 'r');
    try {
      const head = Buffer.alloc(16);
      const { bytesRead } = await handle.read(head, 0, 16, 0);
      ok = bytesMatchType(head.subarray(0, bytesRead), mimetype);
    } finally {
      await handle.close();
    }
  } catch {
    ok = false;
  }
  if (!ok) await unlink(path).catch(() => undefined);
  return ok;
}

export async function discardUpload(path: string | undefined): Promise<void> {
  if (path) await unlink(path).catch(() => undefined);
}

/**
 * Works out what a saved upload really is from its first bytes, ignoring the content type the client claimed —
 * mobile HTTP clients often send every file as application/octet-stream. If the bytes are one of the allowed
 * types, the file is renamed to that type's extension and its real type is returned; otherwise it is deleted
 * and null is returned. A page or script dressed up as an image matches nothing, so it is still rejected.
 */
export async function resolveUploadType(
  file: { path: string; filename: string },
  allowed: Record<string, string>,
): Promise<{ mimetype: string; filename: string; path: string } | null> {
  let head = Buffer.alloc(0);
  try {
    const handle = await open(file.path, 'r');
    try {
      const buf = Buffer.alloc(16);
      const { bytesRead } = await handle.read(buf, 0, 16, 0);
      head = buf.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch {
    head = Buffer.alloc(0);
  }
  const mimetype = Object.keys(allowed).find((t) => bytesMatchType(head, t));
  if (!mimetype) {
    await unlink(file.path).catch(() => undefined);
    return null;
  }
  const ext = allowed[mimetype]!;
  if (file.filename.endsWith(ext)) return { mimetype, filename: file.filename, path: file.path };
  const filename = file.filename.replace(/\.[^.]*$/, '') + ext;
  const path = file.path.slice(0, file.path.length - file.filename.length) + filename;
  await rename(file.path, path);
  return { mimetype, filename, path };
}
