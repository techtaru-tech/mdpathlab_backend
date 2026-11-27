import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import jsQR from 'jsqr';
import { toBuffer } from 'qrcode';
import sharp from 'sharp';

/** Public (not signed) uploads folder for the plain QR images. */
export const PLAIN_QR_DIR = 'collection-qr';

/**
 * Razorpay only returns its branded poster (logo, banner, app strip) for a UPI QR. The phlebotomist app should show
 * just the code, so: read the UPI link out of the poster and draw a clean QR from that same link. The payment still
 * goes to the same Razorpay QR, so auto-confirmation is unchanged. Returns null when the poster can't be read.
 */
export async function upiLinkFromPoster(posterUrl: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const res = await fetchImpl(posterUrl, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const code = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height);
  const link = code?.data?.trim();
  // Only a UPI payment link is accepted, so nothing else can ever end up on the QR we show.
  return link && /^upi:\/\/pay\?/i.test(link) ? link : null;
}

/** Writes the clean QR PNG to uploads/collection-qr/<name>.png and returns its /uploads path. */
export async function writePlainQr(link: string, name: string, uploadsDir = join(process.cwd(), 'uploads')): Promise<string> {
  const png = await toBuffer(link, { type: 'png', width: 640, margin: 2, errorCorrectionLevel: 'M' });
  const dir = join(uploadsDir, PLAIN_QR_DIR);
  await mkdir(dir, { recursive: true });
  const file = `${name.replace(/[^A-Za-z0-9_-]/g, '')}.png`;
  await writeFile(join(dir, file), png);
  return `/uploads/${PLAIN_QR_DIR}/${file}`;
}
