import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

vi.mock('server-only', () => ({}));

import { normaliseForOcr, OCR_MAX_DIMENSION } from './image-processing.service';

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#88aacc' } })
    .withMetadata({ exif: { IFD0: { Copyright: 'test' } } })
    .png()
    .toBuffer();

describe('normaliseForOcr', { timeout: 30_000 }, () => {
  it("resizes to the reader's limit and re-encodes as JPEG without metadata", async () => {
    const out = await normaliseForOcr(await png(3000, 2000));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('jpeg');
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(OCR_MAX_DIMENSION);
    expect(meta.exif).toBeUndefined();
  });

  it('never enlarges a small image', async () => {
    const meta = await sharp(await normaliseForOcr(await png(800, 600))).metadata();
    expect([meta.width, meta.height]).toEqual([800, 600]);
  });

  it('is stable on its own output, so a re-read sends the same image', async () => {
    const once = await normaliseForOcr(await png(3000, 2000));
    const twice = await sharp(await normaliseForOcr(once)).metadata();
    expect([twice.width, twice.height]).toEqual([OCR_MAX_DIMENSION, 1717]);
  });
});
