import { open, unlink } from 'fs/promises';

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
