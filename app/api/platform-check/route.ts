import sharp from 'sharp';

/**
 * Platform verification probe — Phase 00 §20.
 *
 * Exists to answer one question that a green build cannot: does Sharp's
 * native binary actually LOAD and RUN inside HelloDeploy's container?
 *
 * The production image is node:22-alpine — musl libc, not glibc — and ships
 * `.next/standalone`, which only carries file-traced dependencies. Locally
 * both work. Neither could be tested against Alpine here (no Docker access),
 * so this route closes that gap on the first real deploy.
 *
 * If this returns ok:false in production, the Phase 04 image pipeline moves
 * to a WASM codec (@jsquash/webp) — see PLATFORM-HELLODEPLOY.md note A.
 *
 * PHASE-14: reviewed against §29-§32 and KEPT, despite the Phase 00 note above
 * saying to remove it.
 *
 * It answers a different question from the health endpoints. `/api/health` is
 * liveness and `/api/health/ready` is readiness — both about whether this
 * instance can serve a request right now, and both deliberately independent of
 * image processing. This is a one-off *deployment* verification: does the musl
 * binary load in the container that was actually built. Uploading a real
 * document would also exercise Sharp, but only once the database, storage and
 * auth are all working, which is exactly when you least want a compound
 * signal.
 *
 * `docs/PLATFORM-HELLODEPLOY.md` cites it for that purpose. It costs one route
 * and answers a question nothing else does.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();

  try {
    // Generate a source image rather than reading one from disk, so the probe
    // has no filesystem dependency of its own.
    const source = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: '#138A72' },
    })
      .png()
      .toBuffer();

    // Exercise exactly the operations Phase 04 needs: auto-rotate, resize
    // without upscaling, and encode WebP at the configured qualities.
    const display = await sharp(source)
      .rotate()
      .resize(1800, 1800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    const thumbnail = await sharp(source)
      .rotate()
      .resize(360, 360, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();

    const meta = await sharp(display).metadata();

    return Response.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      runtime: {
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        libvips: sharp.versions.vips,
      },
      sharp: {
        sourcePngBytes: source.length,
        displayWebpBytes: display.length,
        thumbnailWebpBytes: thumbnail.length,
        displayFormat: meta.format ?? null,
        displayWidth: meta.width ?? null,
        displayHeight: meta.height ?? null,
      },
    });
  } catch (error) {
    // Safe error only — no stack trace to the client (Phase 00 §24).
    const message = error instanceof Error ? error.message : 'unknown error';
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'platform-check failed',
        error: message,
        platform: `${process.platform}-${process.arch}`,
        timestamp: new Date().toISOString(),
      }),
    );
    return Response.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        runtime: {
          node: process.version,
          platform: `${process.platform}-${process.arch}`,
        },
        error: message,
        hint:
          'Sharp failed to load or run. On Alpine this usually means the musl binary ' +
          'is missing from .next/standalone. Fallback: @jsquash/webp (WASM). ' +
          'See docs/PLATFORM-HELLODEPLOY.md note A.',
      },
      { status: 500 },
    );
  }
}
