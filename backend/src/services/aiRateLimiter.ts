/**
 * In-memory sliding-window rate limiter for AI-backed endpoints
 * Protects Google Gemini API quota per user and per IP.
 */

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const userBuckets = new Map<string, RateLimitBucket>();
const ipBuckets = new Map<string, RateLimitBucket>();

// Default: 10 AI requests per 60-second window
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;

export interface AIRateLimitResult {
  allowed: boolean;
  message?: string;
  retryAfterSeconds?: number;
}

export function checkAIRateLimit(userId: string, ip: string): AIRateLimitResult {
  const now = Date.now();

  // Helper to check and increment bucket
  function evaluateBucket(map: Map<string, RateLimitBucket>, key: string): { ok: boolean; retryAfter: number } {
    const bucket = map.get(key);

    if (!bucket || now >= bucket.resetAt) {
      map.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return { ok: true, retryAfter: 0 };
    }

    if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      return { ok: false, retryAfter };
    }

    bucket.count += 1;
    return { ok: true, retryAfter: 0 };
  }

  // 1. Check IP bucket
  const ipCheck = evaluateBucket(ipBuckets, ip);
  if (!ipCheck.ok) {
    return {
      allowed: false,
      retryAfterSeconds: ipCheck.retryAfter,
      message: `AI request limit reached for this IP. To protect API quota, please wait ${ipCheck.retryAfter} seconds before trying again.`
    };
  }

  // 2. Check User bucket (if user ID exists)
  if (userId && userId !== 'anonymous') {
    const userCheck = evaluateBucket(userBuckets, userId);
    if (!userCheck.ok) {
      return {
        allowed: false,
        retryAfterSeconds: userCheck.retryAfter,
        message: `AI request limit reached for your account. To protect API quota, please wait ${userCheck.retryAfter} seconds before generating more proposals or reminders.`
      };
    }
  }

  return { allowed: true };
}

// Clean up stale buckets periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of userBuckets.entries()) {
    if (now >= v.resetAt) userBuckets.delete(k);
  }
  for (const [k, v] of ipBuckets.entries()) {
    if (now >= v.resetAt) ipBuckets.delete(k);
  }
}, 5 * 60 * 1000).unref();
