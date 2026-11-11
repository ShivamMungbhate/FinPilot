import Fastify from 'fastify';
import cors from '@fastify/cors';
import rawBody from 'fastify-raw-body';
import fastifyCookie from '@fastify/cookie';
import bcrypt from 'bcryptjs';
import { prisma } from './db.js';
import { config } from './config.js';
import { getActivePolicyConfig } from './services/policyEngine.js';
import { authRoutes } from './routes/authRoutes.js';
import { invoiceRoutes } from './routes/invoiceRoutes.js';
import { webhookRoutes } from './routes/webhookRoutes.js';
import { auditRoutes } from './routes/auditRoutes.js';
import { policyRoutes } from './routes/policyRoutes.js';

const server = Fastify({
  trustProxy: true,
  logger: {
    level: process.env.NODE_ENV === 'test' ? 'silent' : 'info'
  }
});

async function main() {
  // Register rawBody for PayPal webhook verification
  await server.register(rawBody, {
    field: 'rawBody',
    global: false,
    encoding: 'utf8',
    runFirst: true,
    routes: ['/api/webhooks/paypal']
  });

  // Gracefully handle empty JSON bodies without throwing FST_ERR_CTP_EMPTY_JSON_BODY
  server.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const strBody = typeof body === 'string' ? body : (body ? body.toString('utf8') : '');
    if (!strBody || strBody.trim() === '') {
      done(null, {});
      return;
    }
    try {
      const json = JSON.parse(strBody);
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // Cookie parsing & signing
  await server.register(fastifyCookie, {
    secret: config.SESSION_SECRET
  });

  // CORS configured with credentials strictly restricted to FRONTEND_URL (no arbitrary reflection)
  const configuredOrigin = (config.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  const allowedOrigins = new Set([
    configuredOrigin,
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ]);

  await server.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, server-to-server, CLI, test suites)
      if (!origin) {
        return cb(null, true);
      }
      const normalized = origin.replace(/\/$/, '');
      if (allowedOrigins.has(normalized)) {
        return cb(null, true);
      }
      return cb(new Error(`CORS origin '${origin}' is not permitted`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });

  // Health check with webhook readiness inspection (without revealing secrets)
  const getHealthStatus = () => {
    const isWebhookConfigured = Boolean(
      config.PAYPAL_WEBHOOK_ID &&
      config.PAYPAL_WEBHOOK_ID !== 'mock_webhook_id' &&
      config.PAYPAL_CLIENT_ID &&
      config.PAYPAL_CLIENT_ID !== 'mock_sandbox_client_id'
    );

    return {
      status: 'ok',
      service: 'finpilot-backend',
      timestamp: new Date().toISOString(),
      paypalEnv: config.PAYPAL_ENV,
      aiServiceUrl: config.AI_SERVICE_URL,
      webhookVerification: {
        configured: isWebhookConfigured,
        webhookIdPresent: Boolean(config.PAYPAL_WEBHOOK_ID && config.PAYPAL_WEBHOOK_ID.trim().length > 0),
        simulationMode: config.ENABLE_PAYMENT_SIMULATION
      }
    };
  };

  server.get('/health', async () => getHealthStatus());
  server.get('/api/health', async () => getHealthStatus());

  // Global Authentication Hook for /api routes
  server.addHook('onRequest', async (request, reply) => {
    const url = request.url.split('?')[0];

    // Exempt CORS preflight
    if (request.method === 'OPTIONS') {
      return;
    }

    // Exempt public routes
    if (
      url === '/health' ||
      url === '/api/health' ||
      url === '/api/auth/login' ||
      url === '/api/auth/config' ||
      url === '/api/webhooks/paypal' ||
      (config.ENABLE_PAYMENT_SIMULATION && url === '/api/webhooks/simulate')
    ) {
      return;
    }

    // Check signed session cookie
    const rawCookie = request.cookies.finpilot_session;
    let sessionUser: { userId: string; email: string } | null = null;

    if (rawCookie) {
      const unsigned = request.unsignCookie(rawCookie);
      if (unsigned.valid && unsigned.value) {
        try {
          sessionUser = JSON.parse(unsigned.value);
        } catch {}
      }
    }

    // Also support Authorization header Bearer token or direct token for CLI/test harnesses
    if (!sessionUser && request.headers.authorization?.startsWith('Bearer ')) {
      const token = request.headers.authorization.substring(7);
      try {
        sessionUser = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
      } catch {}
    }

    if (!sessionUser) {
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required. Please log in.'
      });
    }

    // Attach user to request context
    (request as any).user = sessionUser;
  });

  // Register routes
  await server.register(authRoutes, { prefix: '/api/auth' });
  await server.register(invoiceRoutes, { prefix: '/api/invoices' });
  await server.register(webhookRoutes, { prefix: '/api/webhooks' });
  await server.register(auditRoutes, { prefix: '/api/audit-logs' });
  await server.register(policyRoutes, { prefix: '/api/policy' });

  // Initialize DB policy config and ensure demo user exists idempotently
  try {
    await getActivePolicyConfig();
    const demoEmail = (config.DEMO_USER_EMAIL || 'demo@finpilot.dev').toLowerCase().trim();
    const existingDemoUser = await prisma.user.findUnique({ where: { email: demoEmail } });
    if (!existingDemoUser) {
      const passwordHash = await bcrypt.hash(config.DEMO_USER_PASSWORD || 'finpilot123', 10);
      await prisma.user.create({
        data: {
          email: demoEmail,
          passwordHash
        }
      });
      console.log(`👤 Demo user created on bootstrap: ${demoEmail}`);
    }
    console.log('🛡️ Policy configuration verified');
  } catch (err) {
    console.warn('⚠️ Note on database bootstrap:', err);
  }

  // Start server
  server.listen({ port: config.PORT, host: config.HOST }, (err, address) => {
    if (err) {
      server.log.error(err);
      process.exit(1);
    }
    console.log(`🚀 FinPilot Backend running at ${address}`);
  });
}

main().catch((err) => {
  console.error('Fatal initialization error:', err);
  process.exit(1);
});
