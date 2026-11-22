export const API_WINDOW_MS = 60_000;
export const API_READ_LIMIT = 120;
export const API_WRITE_LIMIT = 60;

export interface ApiRateResult {
  limited: boolean;
  retryAfter?: number;
}

interface ApiRateBucket {
  startedAt: number;
  reads: number;
  writes: number;
}

/** Creates an isolated per-user API rate limiter; clock injection keeps tests deterministic. */
export function createApiRateLimiter(now: () => number = Date.now) {
  const buckets = new Map<string, ApiRateBucket>();

  return function checkApiRate(userId: string | number, method: string): ApiRateResult {
    const key = String(userId);
    const currentTime = now();
    let bucket = buckets.get(key);
    if (!bucket || currentTime - bucket.startedAt >= API_WINDOW_MS) {
      bucket = { startedAt: currentTime, reads: 0, writes: 0 };
      buckets.set(key, bucket);
    }

    const isWrite = method !== 'GET' && method !== 'HEAD';
    if (isWrite) bucket.writes += 1;
    else bucket.reads += 1;

    const used = isWrite ? bucket.writes : bucket.reads;
    const limit = isWrite ? API_WRITE_LIMIT : API_READ_LIMIT;
    if (used > limit) {
      return {
        limited: true,
        retryAfter: Math.max(1, Math.ceil((bucket.startedAt + API_WINDOW_MS - currentTime) / 1000))
      };
    }

    if (buckets.size > 5000) {
      for (const [id, value] of buckets) {
        if (currentTime - value.startedAt >= API_WINDOW_MS) buckets.delete(id);
      }
    }
    return { limited: false };
  };
}
