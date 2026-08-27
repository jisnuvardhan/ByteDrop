type RateLimitBucket = { startedAt: number; count: number };
const buckets = new Map<string, RateLimitBucket>();
const MAX_BUCKETS = 2_000;

export function cleanupRateLimitBuckets(now = Date.now(), windowMs = 60_000): number {
  let removed = 0;
  buckets.forEach((bucket, key) => {
    if (now - bucket.startedAt >= windowMs) {
      buckets.delete(key);
      removed += 1;
    }
  });
  return removed;
}

export function consumeRateLimit(key: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  cleanupRateLimitBuckets(now, windowMs);
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    if (buckets.size >= MAX_BUCKETS) cleanupRateLimitBuckets(now, windowMs);
    if (buckets.size >= MAX_BUCKETS) return false;
    buckets.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function clearRateLimitBucketsForTests(): void {
  buckets.clear();
}

const DEFAULT_CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"] as const;

function normalizeOrigin(value: string): string | null {
  if (value === "*") return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getAllowedCorsOrigins(): readonly string[] {
  const configured = process.env.BYTE_DROP_CORS_ORIGINS?.split(",").map((origin) => normalizeOrigin(origin.trim())).filter((origin): origin is string => Boolean(origin));
  return configured && configured.length > 0 ? Array.from(new Set(configured)) : DEFAULT_CORS_ORIGINS;
}

export const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=()",
} as const;

type HeaderResponse = { setHeader: (name: string, value: string) => unknown };

export function applySecurityHeaders(res: HeaderResponse): void {
  const headers = process.env.NODE_ENV === "development"
    ? {
        ...securityHeaders,
        "Content-Security-Policy": "default-src 'self'; connect-src 'self' ws://localhost:3000 ws://127.0.0.1:3000 wss://localhost:3000 wss://127.0.0.1:3000; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      }
    : securityHeaders;
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
}

export function isTrustedOrigin(origin: string | undefined, allowedOrigins: readonly string[] = getAllowedCorsOrigins()): boolean {
  return origin === undefined || allowedOrigins.includes(origin);
}

export function privacySafeError(): { error: string } {
  return { error: "Unable to process the request. Please try again." };
}

export function hasSafeJsonDepth(value: unknown, maxDepth = 6, depth = 0): boolean {
  if (depth > maxDepth) return false;
  if (value === null || typeof value !== "object") return true;
  if (Array.isArray(value)) return value.length <= 1000 && value.every((item) => hasSafeJsonDepth(item, maxDepth, depth + 1));
  return Object.entries(value).length <= 40 && Object.values(value).every((item) => hasSafeJsonDepth(item, maxDepth, depth + 1));
}

export function isSafeProviderPayload(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length > 500 || !hasSafeJsonDepth(value, 5)) return false;
  try { return JSON.stringify(value).length <= 256_000; } catch { return false; }
}

export function getRateLimitBucketCountForTests(): number {
  return buckets.size;
}
