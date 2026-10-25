import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export type Limiter = { limit(key: string): Promise<{ success: boolean }> };

/** Fixed-window in-memory limiter. Per instance, so dev/test only: production uses Upstash. */
export function memoryLimiter(max: number, windowMs: number, now: () => number = Date.now): Limiter {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    async limit(key) {
      const t = now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= t) {
        hits.set(key, { count: 1, resetAt: t + windowMs });
        return { success: true };
      }
      entry.count += 1;
      return { success: entry.count <= max };
    },
  };
}

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

const cache = new Map<string, Limiter>();

/** `max` requests per `windowSec` seconds, per key. Upstash when configured, memory otherwise. */
export function getLimiter(name: string, max: number, windowSec: number): Limiter {
  const cacheKey = `${name}:${max}:${windowSec}`;
  const existing = cache.get(cacheKey);
  if (existing) return existing;

  const r = getRedis();
  if (!r && process.env.NODE_ENV === 'production') {
    throw new Error('UPSTASH_REDIS_REST_URL / _TOKEN must be set in production');
  }
  const limiter: Limiter = r
    ? new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
        prefix: `rl:${name}`,
      })
    : memoryLimiter(max, windowSec * 1000);
  cache.set(cacheKey, limiter);
  return limiter;
}
