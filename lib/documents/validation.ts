/**
 * Upload validation — Phase 04 §15, §16, §17, §53.
 *
 * The client-supplied MIME type is a claim, not evidence. Browsers derive it
 * from the file extension, and an attacker sets it to whatever they like. So
 * every check here reads the actual bytes.
 */

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** The larger of the two, for checks made before the file type is known. */
export const MAX_UPLOAD_BYTES = Math.max(MAX_IMAGE_BYTES, MAX_PDF_BYTES);

/**
 * Above HelloDeploy's 10 MB proxy limit on purpose.
 *
 * nginx sets `client_max_body_size 10m` on every deployed app, so files never
 * pass through HelloPera's own requests: the browser uploads straight to
 * Supabase Storage with a signed upload URL, and the server then reads the
 * stored bytes back and checks them here (PLATFORM-HELLODEPLOY.md note B).
 *
 * Images are this large only briefly. After the first successful read — or
 * after seven days unread — the original is replaced with the OCR-grade JPEG
 * (`normaliseForOcr`), which is all the reader ever uses.
 *
 * PDFs stay as uploaded: the container cannot render them. 20 MB keeps a PDF
 * under the provider's 32 MB request limit after base64 encoding.
 */
export function maxBytesFor(isPdf: boolean): number {
  return isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
}

export const MAX_IMAGE_DIMENSION = 12_000;

export type DetectedType =
  'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'application/pdf';

export const SUPPORTED_TYPES: readonly DetectedType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
];

function startsWith(
  bytes: Uint8Array,
  signature: readonly number[],
  offset = 0,
): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

/**
 * Identify a file by its magic bytes.
 *
 * Returns null for anything unrecognised — including a file whose extension
 * and declared MIME say "image/png" but whose bytes say otherwise.
 */
export function detectType(bytes: Uint8Array): DetectedType | null {
  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'image/png';

  // WebP: "RIFF" .... "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && asciiAt(bytes, 8, 4) === 'WEBP') {
    return 'image/webp';
  }

  // HEIC/HEIF: ISO-BMFF box, "ftyp" at offset 4, brand at 8.
  if (asciiAt(bytes, 4, 4) === 'ftyp') {
    const brand = asciiAt(bytes, 8, 4);
    if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) {
      return 'image/heic';
    }
  }

  // PDF: "%PDF-"
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';

  return null;
}

export type ValidationResult =
  { ok: true; type: DetectedType; isPdf: boolean } | { ok: false; message: string };

export function validateUpload(params: {
  bytes: Uint8Array;
  size: number;
  declaredMimeType?: string | null;
  filename?: string | null;
}): ValidationResult {
  const { bytes, size, declaredMimeType } = params;

  if (size === 0) return { ok: false, message: 'That file is empty.' };

  const detected = detectType(bytes);
  if (!detected) {
    return {
      ok: false,
      message: 'That file type is not supported. Upload a JPEG, PNG, WebP, HEIC or PDF.',
    };
  }

  const isPdf = detected === 'application/pdf';
  const limit = maxBytesFor(isPdf);
  if (size > limit) {
    const mb = Math.round(limit / 1024 / 1024);
    return {
      ok: false,
      message: `That ${isPdf ? 'PDF' : 'image'} is larger than ${mb} MB. Try a smaller file.`,
    };
  }

  // A mismatch between claimed and actual kind is worth rejecting outright:
  // it is usually a renamed file, occasionally something deliberate.
  if (declaredMimeType) {
    const declaredIsImage = declaredMimeType.startsWith('image/');
    if (declaredIsImage !== detected.startsWith('image/')) {
      return {
        ok: false,
        message:
          'That file does not match its extension. Upload it again with the correct type.',
      };
    }
  }

  return { ok: true, type: detected, isPdf };
}

/** Guard against decompression bombs — a small file can declare enormous dimensions. */
export function validateDimensions(
  width?: number,
  height?: number,
): ValidationResult | null {
  if (!width || !height) return null;
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return {
      ok: false,
      message: `That image is too large (${width}x${height}). The maximum is ${MAX_IMAGE_DIMENSION}px on a side.`,
    };
  }
  return null;
}

/**
 * Storage object path.
 *
 * First segment is the owner's uuid, so ownership is legible from the path
 * itself. Everything is generated — a user-supplied filename here would be a
 * traversal, and `../` in a storage key is not theoretical.
 */
export function buildObjectPath(params: {
  userId: string;
  documentId: string;
  filename: string;
  at?: Date;
}): string {
  const at = params.at ?? new Date();
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `${params.userId}/${year}/${month}/${params.documentId}/${params.filename}`;
}

const EXTENSIONS: Record<DetectedType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

export function extensionFor(type: DetectedType): string {
  return EXTENSIONS[type];
}

/**
 * Filenames are rendered as text, never as markup, and never used in a path.
 * Strips directory components and control characters.
 */
export function sanitiseFilename(name: string | null | undefined): string | null {
  if (!name) return null;
  const base = name.split(/[/\\]/).pop() ?? name;
  const cleaned = base.replace(/[\x00-\x1f\x7f]/g, '').trim();
  return cleaned.slice(0, 200) || null;
}
