#!/usr/bin/env node
/**
 * Generate every icon and social image from the brand source art.
 *
 *   node scripts/build-icons.mjs
 *
 * Sources (the only hand-authored art in the repo):
 *   image/Icon-only-master.png                  1318x1193 mark, transparent
 *   image/Primary-horizontal-logo-with-tagline  2172x724 lockup, transparent
 *
 * The brand set also ships App-icon.png, Maskable-PWA-icon.png and
 * Favicon.png as pre-rendered 1254² tiles. Two of them are NOT used here, and
 * the reason matters: App-icon and Maskable-PWA-icon are drawn as a rounded
 * tile on a WHITE field. A maskable icon is cropped by the launcher to a
 * circle or squircle, so those white corners would appear as white arcs
 * around the mark. They are fine as reference art and wrong as sources.
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
const ICON = path.join(ROOT, 'image/Icon-only-master.png');
const LOGO = path.join(ROOT, 'image/Primary-horizontal-logo-with-tagline.png');

/**
 * The ground behind the mark on opaque icons — see fullBleedIcon.
 *
 * Deep Ink, the same `--hp-nav` the app's navigation rail uses. Chosen by
 * measurement rather than taste, against the purse body #027c6b:
 *
 *   #047f6e  mean of the mark's own green   1.04:1   invisible
 *   #02594e  the brand sheet's favicon teal 1.61:1   weak at 16px
 *   #132238  Deep Ink                       3.12:1   clears 3:1
 *
 * A jade mark on a jade ground has almost no edge — at favicon size the purse
 * dissolves into its tile and only the coin survives. DESIGN-SYSTEM §4.3 asks
 * for a measured ratio on every surface, and 3:1 is what WCAG 1.4.11 wants of
 * a graphical object. Deep Ink is also an approved ground in the brand sheet's
 * own "Dark / Ink" favicon row, so this is the designer's option, not a new one.
 */
const TILE_GROUND = '#132238';
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
 * The mark itself is a transparent coin purse with no tile of its own, so it
 * is composited onto a flat `TILE_GROUND`. A blurred copy of the artwork was
 * tried as a ground on the previous mark and is worse: the coin smears into a
 * yellow bloom that looks like a rendering fault.
 *
 * `inset` is the fraction of the canvas the mark occupies. It must stay inside
 * the centre 80% for maskable, because everything outside that can be cropped
 * away by the launcher.
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
  // Bounded on BOTH axes, not just height. The previous lockup was square, so
  // a height of 500 gave a width of 500 and fitted comfortably. This one is
  // roughly 3:1 — scaling it to 500 tall makes it ~1500 wide, which overflows
  // the 1200px card and makes sharp refuse the composite outright.
  //
  // `inside` scales down to fit the box and never enlarges, so the lockup
  // keeps its aspect ratio with a clear margin on every side.
  const art = await sharp(LOGO)
    .trim({ threshold: 1 })
    .resize(Math.round(W * 0.72), Math.round(H * 0.52), {
      fit: 'inside',
      withoutEnlargement: true,
    })
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
  // Maskable: the mark must survive a circular crop, so it sits at 80%.
  fullBleedIcon(512, 0.8, path.join(icons, 'icon-maskable-512.png')),
  // iOS applies only a modest corner radius, so the mark can run wider.
  fullBleedIcon(180, 0.94, path.join(ROOT, 'app/apple-icon.png')),
  ico([16, 32, 48], path.join(ROOT, 'app/favicon.ico')),
  social(path.join(ROOT, 'app/opengraph-image.png')),
]);

// X reads twitter-image; without it the card falls back to og:image anyway,
// but declaring it keeps the summary_large_image card predictable.
await sharp(path.join(ROOT, 'app/opengraph-image.png')).toFile(
  path.join(ROOT, 'app/twitter-image.png'),
);

console.log('icons + social images written from image/Icon-only-master.png');
