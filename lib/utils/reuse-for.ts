/**
 * Run `work` at most once per `ttlMs`, sharing the result with every caller in
 * between, including callers that arrive while it is still running.
 *
 * For unauthenticated probes (HP-032) whose answer is the same for everyone:
 * a flood of requests then costs one run per window per instance, with no
 * rate-limit lookup of its own. A rejection is not kept, so the next caller
 * runs `work` again.
 */
export function reuseFor<T>(ttlMs: number, work: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  let settledAt = 0;
  return () => {
    if (pending && (settledAt === 0 || Date.now() - settledAt < ttlMs)) return pending;
    settledAt = 0;
    const run = work().then(
      (value) => {
        settledAt = Date.now();
        return value;
      },
      (error) => {
        if (pending === run) pending = null;
        throw error;
      },
    );
    pending = run;
    return run;
  };
}
