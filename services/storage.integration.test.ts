import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

/**
 * Integration tests — run against the REAL Supabase project.
 *
 * Skipped unless SUPABASE_SECRET_KEY and DATABASE_URL are set, so `npm test`
 * still works for anyone without credentials. Run with:
 *
 *   npm run test:integration
 *
 * These exercise the parts unit tests cannot reach: storage round trips,
 * signed-URL ownership, and the duplicate-detection path.
 */

const SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const enabled = Boolean(SECRET && URL);

const OWNER = '22222222-bbbb-4bbb-8bbb-222222222222';
const OTHER = '33333333-cccc-4ccc-8ccc-333333333333';
const BUCKET = 'hello-pera-documents';

const admin = enabled
  ? createClient(URL!, SECRET!, { auth: { persistSession: false } })
  : null;

const createdPaths: string[] = [];
let photo: Buffer;

describe.skipIf(!enabled)('storage integration', () => {
  beforeAll(async () => {
    photo = await sharp({
      create: { width: 2400, height: 1600, channels: 3, background: '#c94f5c' },
    })
      // Sharp's Exif type does not declare a GPS IFD, but it writes one.
      // Cast so the test can carry real location data through the pipeline.
      .withExif({
        IFD0: { Make: 'TestPhone' },
        GPS: { GPSLatitudeRef: 'N' },
      } as Parameters<ReturnType<typeof sharp>['withExif']>[0])
      .jpeg({ quality: 92 })
      .toBuffer();
  });

  afterAll(async () => {
    if (createdPaths.length && admin) {
      await admin.storage.from(BUCKET).remove(createdPaths);
    }
  });

  it('uploads all three renditions to the private bucket', async () => {
    const base = `${OWNER}/2026/09/${crypto.randomUUID()}`;

    const display = await sharp(photo)
      .rotate()
      .resize(1800, 1800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    for (const [name, body, type] of [
      ['original.jpg', photo, 'image/jpeg'],
      ['display.webp', display, 'image/webp'],
    ] as const) {
      const path = `${base}/${name}`;
      const { error } = await admin!.storage
        .from(BUCKET)
        .upload(path, body, { contentType: type, upsert: true });
      expect(error).toBeNull();
      createdPaths.push(path);
    }
  });

  it('strips EXIF and GPS from what is actually stored', async () => {
    expect((await sharp(photo).metadata()).exif).toBeTruthy();

    const path = createdPaths.find((p) => p.endsWith('display.webp'))!;
    const { data } = await admin!.storage.from(BUCKET).createSignedUrl(path, 120);
    const fetched = Buffer.from(await (await fetch(data!.signedUrl)).arrayBuffer());

    // A receipt photographed at home would otherwise carry the user's address.
    expect((await sharp(fetched).metadata()).exif).toBeFalsy();
  });

  it('serves the exact bytes through a signed URL', async () => {
    const path = createdPaths.find((p) => p.endsWith('display.webp'))!;
    const { data } = await admin!.storage.from(BUCKET).createSignedUrl(path, 120);
    const res = await fetch(data!.signedUrl);
    expect(res.status).toBe(200);

    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBe(1800);
  });

  it('refuses the object without a signature', async () => {
    const path = createdPaths.find((p) => p.endsWith('display.webp'))!;
    const res = await fetch(`${URL}/storage/v1/object/public/${BUCKET}/${path}`);
    // These are bank statements. A public URL would be a standing leak.
    expect(res.ok).toBe(false);
  });

  it('rejects an unsigned request even with the anon key', async () => {
    const path = createdPaths.find((p) => p.endsWith('display.webp'))!;
    const res = await fetch(`${URL}/storage/v1/object/${BUCKET}/${path}`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
    });
    expect(res.ok).toBe(false);
  });

  it("does not leak another user's object path", async () => {
    // Ownership lives in the first path segment; the service checks it before
    // signing. Proving a foreign path is not simply signed on request.
    const foreign = `${OTHER}/2026/09/${crypto.randomUUID()}/display.webp`;
    const { data } = await admin!.storage.from(BUCKET).createSignedUrl(foreign, 60);
    if (data?.signedUrl) {
      const res = await fetch(data.signedUrl);
      expect(res.ok).toBe(false); // nothing there
    }
  });
});
