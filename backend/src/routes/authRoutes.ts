import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { getClientIp } from '../utils/ip.js';

const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

// Basic in-memory rate limiter: 5 attempts per 60 seconds per IP
interface RateLimitRecord {
  count: number;
  resetAt: number;
}
const rateLimits = new Map<string, RateLimitRecord>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimits.get(ip);

  if (!record || now > record.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }

  if (record.count >= 5) {
    return false;
  }

  record.count += 1;
  return true;
}

export const authRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {

  /**
   * GET /api/auth/config
   * Public configuration for the login page (demo hints if SHOW_DEMO_LOGIN=true)
   */
  server.get('/config', async (_request, reply) => {
    return reply.send({
      showDemoLogin: config.SHOW_DEMO_LOGIN,
      enablePaymentSimulation: config.ENABLE_PAYMENT_SIMULATION,
      demoEmail: config.SHOW_DEMO_LOGIN ? config.DEMO_USER_EMAIL : null,
      demoPassword: config.SHOW_DEMO_LOGIN ? config.DEMO_USER_PASSWORD : null,
      demoMode: config.SHOW_DEMO_LOGIN
    });
  });

  /**
   * POST /api/auth/login
   * Authenticates user with rate limiting and issues a signed httpOnly session cookie
   */
  server.post('/login', async (request, reply) => {
    const ip = getClientIp(request);
    if (!checkRateLimit(ip)) {
      return reply.status(429).send({
        error: 'Too many login attempts. Please wait 60 seconds and try again.'
      });
    }

    const parseResult = LoginRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const { email, password } = parseResult.data;

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Check user in database
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    // Auto-provision demo user if SHOW_DEMO_LOGIN is active and user does not exist yet
    if (!user && config.SHOW_DEMO_LOGIN && normalizedEmail === config.DEMO_USER_EMAIL.toLowerCase().trim()) {
      const passwordHash = await bcrypt.hash(config.DEMO_USER_PASSWORD, 10);
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash
        }
      });
    }

    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    // Set signed httpOnly session cookie
    const sessionPayload = JSON.stringify({ userId: user.id, email: user.email });
    reply.setCookie('finpilot_session', sessionPayload, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      signed: true,
      maxAge: 86400 * 7 // 7 days
    });

    return reply.send({
      user: {
        id: user.id,
        email: user.email
      }
    });
  });

  /**
   * POST /api/auth/logout
   * Clears the signed session cookie
   */
  server.post('/logout', async (_request, reply) => {
    reply.clearCookie('finpilot_session', { path: '/' });
    return reply.send({ success: true, message: 'Logged out successfully' });
  });

  /**
   * GET /api/auth/me
   * Validates existing session and returns current user profile
   */
  server.get('/me', async (request, reply) => {
    const rawCookie = request.cookies.finpilot_session;
    if (!rawCookie) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'No active session' });
    }

    const unsigned = request.unsignCookie(rawCookie);
    if (!unsigned.valid || !unsigned.value) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired session' });
    }

    try {
      const session = JSON.parse(unsigned.value) as { userId: string; email: string };
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { id: true, email: true, createdAt: true }
      });

      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'User not found' });
      }

      return reply.send({ user });
    } catch {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Corrupted session' });
    }
  });

};
