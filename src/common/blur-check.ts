import sharp from 'sharp';

/**
 * How sharp a photo is, for rejecting blurry prescription photos at upload time.
 *
 * The photo is scaled to a fixed size and turned grey, then the Laplacian (how quickly brightness changes from one
 * pixel to the next) is measured in a grid of tiles. Writing on a sharp photo gives strong, sudden changes; a
 * blurry photo smears them out. A prescription is mostly blank paper, so the score is taken from the tiles with the
 * most detail (the 90th percentile tile) rather than the whole page — a sharp photo with a little writing must
 * still pass.
 *
 * Returns null when the image can't be read (e.g. HEIC on this build) — the caller then lets it through.
 */
export async function sharpnessScore(path: string): Promise<number | null> {
  let data: Buffer;
  let width: number;
  let height: number;
  try {
    const out = await sharp(path, { failOn: 'none' })
      .rotate()
      .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: false })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    data = out.data;
    width = out.info.width;
    height = out.info.height;
  } catch {
    return null;
  }
  if (width < 50 || height < 50) return null;

  const GRID = 8;
  const tileW = Math.floor((width - 2) / GRID);
  const tileH = Math.floor((height - 2) / GRID);
  const variances: number[] = [];
  for (let ty = 0; ty < GRID; ty++) {
    for (let tx = 0; tx < GRID; tx++) {
      let sum = 0;
      let sumSq = 0;
      let n = 0;
      const y0 = 1 + ty * tileH;
      const x0 = 1 + tx * tileW;
      for (let y = y0; y < y0 + tileH; y++) {
        const row = y * width;
        for (let x = x0; x < x0 + tileW; x++) {
          const i = row + x;
          const lap = data[i - width]! + data[i + width]! + data[i - 1]! + data[i + 1]! - 4 * data[i]!;
          sum += lap;
          sumSq += lap * lap;
          n++;
        }
      }
      const mean = sum / n;
      variances.push(sumSq / n - mean * mean);
    }
  }
  variances.sort((a, b) => a - b);
  return Math.round(variances[Math.floor(variances.length * 0.9)]!);
}
