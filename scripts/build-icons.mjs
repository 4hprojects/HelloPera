#!/usr/bin/env node
/**
 * Generate every icon and social image from the brand source art.
 *
 *   node scripts/build-icons.mjs
 *
 * Sources (the only hand-authored art in the repo):
 *   image/HelloPeraIcon.png   1254² app mark  — rounded tile, transparent corners
 *   image/HelloPeraLogo.png   1254² lockup    — mark + wordmark + "Plan | Track | Grow"
 *
 * Outputs are committed, not built on demand: a favicon that only exists after
 * a postinstall step is a favicon that is missing in someone's checkout.
 * Re-run this whenever the source art changes.
 */
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const ICON = path.join(ROOT, 'image/HelloPeraIcon.png');
const LOGO = path.join(ROOT, 'image/HelloPeraLogo.png');

/** Mean of the tile's own outer ring — see fullBleedIcon. */
const TILE_GROUND = '#10704c';
/** Page background — the ground the lockup was drawn to sit on. */
const MIST = '#f4f8f7';

/** Transparent-corner icon, for contexts that respect the tile's own shape. */
async function transparentIcon(size, out) {
  await sharp(ICON)
    .resize(size, size, { fit: 'contain', background: '#0000' })
    .png()
    .toFile(out);
}

/**
 * Full-bleed opaque icon.
 *
 * Both targets here are masked again by the platform — iOS rounds the
 * home-screen icon, Android crops maskable icons to whatever shape the
 * launcher prefers — so the icon has to arrive opaque and edge to edge, with
 * the mark inside the centre 80% safe zone.
 *
 * The tile cannot simply be zoomed until its own corners leave the canvas:
 * its corner radius is 23% of its width, so the zoom needed to clear the curve
 * would crop the growth arrow and the sparkles. It sits on a flat ground
 * instead, `TILE_GROUND`, which is the mean of the tile's own outer ring — the
 * one colour that cannot read as a seam in any particular direction. A blurred
 * copy of the artwork was tried here first and is worse: the coin smears into
 * a yellow bloom that looks like a rendering fault.
 *
 * `inset` is the fraction of the canvas the tile occupies.
 */
async function fullBleedIcon(size, inset, out) {
  const tile = Math.round(size * inset);
  const art = await sharp(ICON)
    .resize(tile, tile, { fit: 'contain', background: '#0000' })
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: TILE_GROUND },
  })
    .composite([{ input: art, gravity: 'centre' }])
    .png()
    .toFile(out);
}

/**
 * ICO container. Each entry embeds a whole PNG — the Vista-era form every
 * current browser reads — so there is no BMP encoder to get wrong.
 * A 256px entry writes its dimension byte as 0, which is how ICO says 256.
 */
async function ico(sizes, out) {
  const pngs = await Promise.all(
    sizes.map((s) =>
      sharp(ICON).resize(s, s, { fit: 'contain', background: '#0000' }).png().toBuffer(),
    ),
  );

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(sizes.length, 4);

  let offset = 6 + sizes.length * 16;
  const entries = sizes.map((size, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette size — 0 for truecolour
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(pngs[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += pngs[i].length;
    return e;
  });

  await writeFile(out, Buffer.concat([header, ...entries, ...pngs]));
}

/**
 * 1200x630 social card: the lockup centred on the page ground.
 *
 * The source is a square canvas with generous transparent margins, so it is
 * trimmed first — otherwise the artwork centres its padding rather than
 * itself and sits visibly high in the card.
 */
async function social(out) {
  const W = 1200;
  const H = 630;
  const art = await sharp(LOGO)
    .trim({ threshold: 1 })
    .resize(null, 500, { fit: 'contain' })
    .toBuffer();
  await sharp({
    create: { width: W, height: H, channels: 4, background: MIST },
  })
    .composite([{ input: art, gravity: 'centre' }])
    .png()
    .toFile(out);
}

const icons = path.join(ROOT, 'public/icons');
await mkdir(icons, { recursive: true });

await Promise.all([
  transparentIcon(192, path.join(icons, 'icon-192.png')),
  transparentIcon(512, path.join(icons, 'icon-512.png')),
  // Maskable: the mark must survive a circular crop, so the tile sits at 80%.
  fullBleedIcon(512, 0.8, path.join(icons, 'icon-maskable-512.png')),
  // iOS applies only a modest corner radius, so the tile can run wider.
  fullBleedIcon(180, 0.94, path.join(ROOT, 'app/apple-icon.png')),
  ico([16, 32, 48], path.join(ROOT, 'app/favicon.ico')),
  social(path.join(ROOT, 'app/opengraph-image.png')),
]);

// X reads twitter-image; without it the card falls back to og:image anyway,
// but declaring it keeps the summary_large_image card predictable.
await sharp(path.join(ROOT, 'app/opengraph-image.png')).toFile(
  path.join(ROOT, 'app/twitter-image.png'),
);

console.log('icons + social images written from image/HelloPera{Icon,Logo}.png');
