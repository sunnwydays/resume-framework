const WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS = 55;

const requestLog = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(key: string): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const entry = requestLog.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    requestLog.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.windowStart + WINDOW_MS - now) / 1000),
    };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}
