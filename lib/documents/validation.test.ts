import { describe, expect, it } from 'vitest';
import {
  buildObjectPath,
  detectType,
  extensionFor,
  MAX_IMAGE_BYTES,
  sanitiseFilename,
  validateDimensions,
  validateUpload,
} from '@/lib/documents/validation';

/** Minimal real headers for each format. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const HEIC = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
]);

describe('detectType', () => {
  it('identifies each supported format by its bytes', () => {
    expect(detectType(JPEG)).toBe('image/jpeg');
    expect(detectType(PNG)).toBe('image/png');
    expect(detectType(WEBP)).toBe('image/webp');
    expect(detectType(PDF)).toBe('application/pdf');
    expect(detectType(HEIC)).toBe('image/heic');
  });

  it('rejects unknown content', () => {
    expect(detectType(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
    expect(detectType(new Uint8Array(0))).toBeNull();
  });

  it('rejects a RIFF container that is not WebP', () => {
    // "RIFF....WAVE" — a WAV file, not an image.
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(detectType(wav)).toBeNull();
  });

  it('is not fooled by a truncated signature', () => {
    expect(detectType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectType(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
  });
});

describe('validateUpload — the extension is not evidence', () => {
  it('accepts a genuine image', () => {
    const r = validateUpload({ bytes: JPEG, size: 1024, declaredMimeType: 'image/jpeg' });
    expect(r).toMatchObject({ ok: true, type: 'image/jpeg', isPdf: false });
  });

  it('rejects a script renamed to .png', () => {
    // Browsers derive the MIME from the extension, so this is exactly what a
    // shell script called payload.png would look like on arrival.
    const script = new TextEncoder().encode('#!/bin/sh\nrm -rf /\n');
    const r = validateUpload({
      bytes: script,
      size: script.length,
      declaredMimeType: 'image/png',
      filename: 'payload.png',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects an executable claiming to be a PDF', () => {
    const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    const r = validateUpload({
      bytes: elf,
      size: 8,
      declaredMimeType: 'application/pdf',
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a PDF declared as an image', () => {
    const r = validateUpload({ bytes: PDF, size: 1024, declaredMimeType: 'image/png' });
    expect(r.ok).toBe(false);
  });

  it('accepts a PDF declared correctly', () => {
    const r = validateUpload({
      bytes: PDF,
      size: 1024,
      declaredMimeType: 'application/pdf',
    });
    expect(r).toMatchObject({ ok: true, isPdf: true });
  });

  it('trusts the bytes when no MIME is declared at all', () => {
    expect(validateUpload({ bytes: PNG, size: 100 }).ok).toBe(true);
  });

  it('rejects an empty file', () => {
    expect(validateUpload({ bytes: new Uint8Array(0), size: 0 }).ok).toBe(false);
  });
});

describe('size limits reflect the platform, not a preference', () => {
  it('is 8 MB, below nginx 10 MB cap with room for multipart overhead', () => {
    expect(MAX_IMAGE_BYTES).toBe(8 * 1024 * 1024);
    expect(MAX_IMAGE_BYTES).toBeLessThan(10 * 1024 * 1024);
  });

  it('accepts a file at the limit and rejects one past it', () => {
    expect(validateUpload({ bytes: JPEG, size: MAX_IMAGE_BYTES }).ok).toBe(true);
    const over = validateUpload({ bytes: JPEG, size: MAX_IMAGE_BYTES + 1 });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.message).toContain('8 MB');
  });
});

describe('validateDimensions', () => {
  it('rejects a decompression bomb', () => {
    expect(validateDimensions(50_000, 50_000)?.ok).toBe(false);
  });

  it('allows normal photographs', () => {
    expect(validateDimensions(4032, 3024)).toBeNull();
  });

  it('ignores unknown dimensions', () => {
    expect(validateDimensions(undefined, undefined)).toBeNull();
  });
});

describe('buildObjectPath', () => {
  it('puts the owner uuid first so ownership is legible from the path', () => {
    const path = buildObjectPath({
      userId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
      documentId: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
      filename: 'display.webp',
      at: new Date('2026-09-13T00:00:00Z'),
    });
    expect(path).toBe(
      'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa/2026/09/bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb/display.webp',
    );
    expect(path.split('/')[0]).toBe('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');
  });

  it('zero-pads the month', () => {
    const path = buildObjectPath({
      userId: 'u',
      documentId: 'd',
      filename: 'thumb.webp',
      at: new Date('2026-01-05T00:00:00Z'),
    });
    expect(path).toContain('/2026/01/');
  });
});

describe('sanitiseFilename', () => {
  it('strips directory components', () => {
    expect(sanitiseFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitiseFilename('C:\\Users\\me\\receipt.jpg')).toBe('receipt.jpg');
  });

  it('strips control characters', () => {
    expect(sanitiseFilename('receipt\u0000.jpg')).toBe('receipt.jpg');
  });

  it('keeps ordinary names intact', () => {
    expect(sanitiseFilename('gcash-payment-sep12.png')).toBe('gcash-payment-sep12.png');
  });

  it('handles missing names', () => {
    expect(sanitiseFilename(null)).toBeNull();
    expect(sanitiseFilename('   ')).toBeNull();
  });

  it('caps absurd lengths', () => {
    expect(sanitiseFilename('a'.repeat(500))?.length).toBe(200);
  });
});

describe('extensionFor', () => {
  it('maps every supported type', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('application/pdf')).toBe('pdf');
    expect(extensionFor('image/heic')).toBe('heic');
  });
});
