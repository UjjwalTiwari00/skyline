import 'server-only';

/**
 * Fixed-cost sliding-window rate limiter, in memory.
 *
 * Deliberately not Redis: this guards a demo enquiry form, and adding a
 * network dependency would make the POST slower and give the form a new way
 * to fail. The trade-off is explicit — on a multi-instance deploy each
 * instance keeps its own counter, so the effective limit is
 * `limit x instances`. For abuse that actually matters this belongs in
 * middleware backed by a shared store, which is noted in the README.
 *
 * State is module-scoped, so it survives between requests on a warm instance
 * and resets on a cold start.
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;

/** Stops a flood of unique IPs growing the map without bound. */
const MAX_TRACKED_KEYS = 10_000;

const hits = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the next request would be allowed. */
  retryAfter: number;
}

export function checkRateLimit(
  key: string,
  { windowMs = WINDOW_MS, max = MAX_REQUESTS } = {},
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  const timestamps = (hits.get(key) ?? []).filter((t) => t > cutoff);

  if (timestamps.length >= max) {
    const oldest = timestamps[0] ?? now;
    hits.set(key, timestamps);
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    };
  }

  timestamps.push(now);
  hits.set(key, timestamps);

  // Cheap amortised cleanup: only sweep when the map is actually large.
  if (hits.size > MAX_TRACKED_KEYS) {
    for (const [k, v] of hits) {
      if (v.every((t) => t <= cutoff)) hits.delete(k);
    }
  }

  return { allowed: true, remaining: max - timestamps.length, retryAfter: 0 };
}

/**
 * Best-effort client IP.
 *
 * Vercel sets x-forwarded-for; the leftmost entry is the client. This is
 * spoofable in general, which is why it is paired with the honeypot rather
 * than relied on alone.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Test seam — the limiter is module state and would otherwise leak across tests. */
export function resetRateLimits(): void {
  hits.clear();
}
