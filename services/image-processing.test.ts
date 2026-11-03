import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

vi.mock('server-only', () => ({}));

import {
  DISPLAY_MAX_DIMENSION,
  ImageProcessingError,
  normaliseForOcr,
  OCR_MAX_DIMENSION,
  processImage,
  THUMB_MAX_DIMENSION,
} from './image-processing.service';

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

describe('processImage', { timeout: 30_000 }, () => {
  it('makes both renditions from one decode, sized and without metadata', async () => {
    const out = await processImage(await png(3000, 2000));
    expect([out.width, out.height]).toEqual([DISPLAY_MAX_DIMENSION, 1200]);
    expect(out.displaySize).toBe(out.display.length);

    const thumb = await sharp(out.thumbnail).metadata();
    expect(thumb.format).toBe('webp');
    expect([thumb.width, thumb.height]).toEqual([THUMB_MAX_DIMENSION, 240]);
    expect(thumb.exif).toBeUndefined();
  });

  it('refuses an image over the pixel limit before decoding it', async () => {
    await expect(processImage(await png(8000, 7000))).rejects.toThrow(
      ImageProcessingError,
    );
  });
});
