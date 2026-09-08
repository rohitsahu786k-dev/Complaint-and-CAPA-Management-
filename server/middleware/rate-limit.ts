import type { NextFunction, Request, Response } from "express";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix: string;
  message?: string;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function clientKey(req: Request, prefix: string) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0];
  const ip = raw?.trim() || req.ip || req.socket.remoteAddress || "unknown";
  return `${prefix}:${ip}`;
}

function sweepExpired(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Lightweight per-instance request throttling for public authentication endpoints.
 * Account-level failed-login locking is enforced separately in auth.service.ts.
 * This layer limits burst abuse before expensive password hashing/email work runs.
 */
export function createRateLimit(options: RateLimitOptions) {
  const windowMs = Math.max(1_000, options.windowMs);
  const max = Math.max(1, options.max);

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    sweepExpired(now);

    const key = clientKey(req, options.keyPrefix);
    const existing = buckets.get(key);
    const bucket = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + windowMs } : existing;
    bucket.count += 1;
    buckets.set(key, bucket);

    const remaining = Math.max(0, max - bucket.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        message: options.message || "Too many requests. Please try again later."
      });
    }

    return next();
  };
}
