import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jsQR from 'jsqr';
import { toBuffer } from 'qrcode';
import sharp from 'sharp';
import { upiLinkFromPoster, writePlainQr } from './plain-qr.js';

const LINK = 'upi://pay?ba=rpy.qrmdpathlabs123@icici&mc=8071&pa=rpy.qrmdpathlabs123@icici&pn=Mdpathlabs&am=399.00&tr=qr_TEST123';

/** A stand-in for Razorpay's poster: the QR small, off-centre, on a large coloured background. */
async function poster(content: string) {
  const qr = await toBuffer(content, { type: 'png', width: 260, margin: 2 });
  return sharp({ create: { width: 700, height: 1500, channels: 3, background: { r: 30, g: 90, b: 230 } } })
    .composite([{ input: qr, left: 220, top: 380 }])
    .jpeg()
    .toBuffer();
}

const serving = (body: Buffer, ok = true) => (async () => ({ ok, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) })) as unknown as typeof fetch;

// Image decoding is slow under jest on a cold start.
jest.setTimeout(60_000);

describe('plain UPI QR', () => {
  it('reads the UPI link out of the full Razorpay image', async () => {
    expect(await upiLinkFromPoster('https://rzp.io/x.png', serving(await poster(LINK)))).toBe(LINK);
  });

  it('accepts only a UPI payment link', async () => {
    expect(await upiLinkFromPoster('https://rzp.io/x.png', serving(await poster('https://evil.example/pay')))).toBeNull();
  });

  it('gives up (caller falls back to the full image) when the image is missing or has no QR', async () => {
    expect(await upiLinkFromPoster('https://rzp.io/x.png', serving(Buffer.from(''), false))).toBeNull();
    const blank = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#fff' } }).png().toBuffer();
    expect(await upiLinkFromPoster('https://rzp.io/x.png', serving(blank))).toBeNull();
  });

  it('writes a QR-only PNG that scans to the same link', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'qr-'));
    try {
      const path = await writePlainQr(LINK, 'qr_TEST/../123', dir);
      expect(path).toBe('/uploads/collection-qr/qr_TEST123.png');
      const { data, info } = await sharp(await readFile(join(dir, 'collection-qr', 'qr_TEST123.png'))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(info.width).toBe(info.height); // just the square code, nothing around it
      expect(jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height)?.data).toBe(LINK);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
