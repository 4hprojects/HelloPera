import 'server-only';

import sharp, { type Metadata } from 'sharp';
import { createHash } from 'node:crypto';
import { validateDimensions } from '@/lib/documents/validation';

/**
 * Image processing — Phase 04 §19–25.
 *
 * Everything happens in memory. HelloDeploy's container filesystem is
 * ephemeral and is never the system of record (§5), so writing temp files
 * would add cleanup obligations for no benefit at these sizes.
 */

/** Configurable, centralised (§69). Never scatter these across components. */
export const DISPLAY_MAX_DIMENSION = 1800;
export const DISPLAY_WEBP_QUALITY = 85;
export const THUMB_MAX_DIMENSION = 360;
export const THUMB_WEBP_QUALITY = 75;

export type ProcessedImage = {
  display: Buffer;
  thumbnail: Buffer;
  width: number;
  height: number;
  displaySize: number;
  thumbnailSize: number;
};

export class ImageProcessingError extends Error {}

export function hashContent(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Produce the display and thumbnail renditions.
 *
 * Three things happen here that matter beyond resizing:
 *
 *   - `rotate()` with no argument applies the EXIF orientation and then drops
 *     the tag. Without it, phone photos appear sideways for every user whose
 *     viewer honours the tag differently.
 *   - Metadata is NOT carried over, which removes GPS coordinates. A receipt
 *     photographed at home otherwise carries the user's home address (§25).
 *   - `withoutEnlargement` prevents upscaling a small screenshot into a larger,
 *     blurrier file.
 */
export async function processImage(bytes: Uint8Array): Promise<ProcessedImage> {
  let metadata: Metadata;
  try {
    metadata = await sharp(bytes).metadata();
  } catch {
    throw new ImageProcessingError('We could not read that image.');
  }

  const dimensionError = validateDimensions(metadata.width, metadata.height);
  if (dimensionError && !dimensionError.ok) {
    throw new ImageProcessingError(dimensionError.message);
  }

  try {
    const display = await sharp(bytes)
      .rotate()
      .resize(DISPLAY_MAX_DIMENSION, DISPLAY_MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: DISPLAY_WEBP_QUALITY })
      .toBuffer();

    const thumbnail = await sharp(bytes)
      .rotate()
      .resize(THUMB_MAX_DIMENSION, THUMB_MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: THUMB_WEBP_QUALITY })
      .toBuffer();

    const out = await sharp(display).metadata();

    return {
      display,
      thumbnail,
      width: out.width ?? 0,
      height: out.height ?? 0,
      displaySize: display.length,
      thumbnailSize: thumbnail.length,
    };
  } catch (error) {
    throw new ImageProcessingError(
      error instanceof Error && error.message.includes('unsupported')
        ? 'That image format is not supported.'
        : 'We could not process that image.',
    );
  }
}

/**
 * Page count for a PDF, read from the raw bytes.
 *
 * HelloDeploy's image is built from a platform-generated Dockerfile, so
 * poppler and pdfium are unavailable — HelloPera cannot render or parse PDFs
 * properly (PLATFORM-HELLODEPLOY.md row I3). Counting `/Type /Page` markers is
 * a heuristic, which is why the result is advisory and may be null.
 */
export function estimatePdfPageCount(bytes: Uint8Array): number | null {
  try {
    const text = Buffer.from(bytes).toString('latin1');
    const matches = text.match(/\/Type\s*\/Page[^s]/g);
    const count = matches?.length ?? 0;
    return count > 0 ? count : null;
  } catch {
    return null;
  }
}
