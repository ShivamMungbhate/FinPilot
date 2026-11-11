import { FastifyRequest } from 'fastify';

/**
 * Extracts the real client IP address behind reverse proxies (Render, Cloudflare, Next.js).
 * Parses the first hop of X-Forwarded-For, falls back to X-Real-IP, and finally request.ip.
 */
export function getClientIp(request: FastifyRequest | { headers: Record<string, any>; ip?: string }): string {
  const xForwardedFor = request.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const raw = Array.isArray(xForwardedFor) ? xForwardedFor[0] : String(xForwardedFor);
    const firstHop = raw.split(',')[0].trim();
    if (firstHop) {
      return firstHop;
    }
  }

  const xRealIp = request.headers['x-real-ip'];
  if (xRealIp && typeof xRealIp === 'string') {
    return xRealIp.trim();
  }

  return request.ip || '127.0.0.1';
}
