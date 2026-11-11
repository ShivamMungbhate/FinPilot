import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from backend directory or root
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  AI_SERVICE_URL: z.string().default('http://localhost:5002'),
  AI_MOCK_SERVICE_URL: z.string().default('http://localhost:5001'),
  AI_SERVICE_TOKEN: z.string().default('finpilot-internal-ai-token-2026'),
  
  // Auth & Session Configuration
  SESSION_SECRET: z.string().optional(),
  SHOW_DEMO_LOGIN: z.coerce.boolean().default(true),
  ENABLE_PAYMENT_SIMULATION: z.coerce.boolean().default(false),
  DEMO_MODE: z.coerce.boolean().optional(),
  DEMO_USER_EMAIL: z.string().default('demo@finpilot.dev'),
  DEMO_USER_PASSWORD: z.string().default('finpilot123'),
  NODE_ENV: z.string().default('development'),

  // PayPal Sandbox Configuration
  PAYPAL_ENV: z.enum(['sandbox', 'live']).default('sandbox'),
  PAYPAL_BASE_URL: z.string().default('https://api-m.sandbox.paypal.com'),
  PAYPAL_CLIENT_ID: z.string().default('mock_sandbox_client_id'),
  PAYPAL_CLIENT_SECRET: z.string().default('mock_sandbox_secret'),
  PAYPAL_WEBHOOK_ID: z.string().default('mock_webhook_id'),
  PAYPAL_INVOICER_NAME: z.string().default('FinPilot Freelance Studio'),
  PAYPAL_INVOICER_EMAIL: z.string().default('freelancer@example.com'),

  // Policy Engine Defaults
  MAX_INVOICE_AMOUNT: z.coerce.number().default(10000),
  DUPLICATE_WINDOW_HOURS: z.coerce.number().default(24),
  MAX_REMINDERS_PER_INVOICE: z.coerce.number().default(3),
  MIN_DAYS_BETWEEN_REMINDERS: z.coerce.number().default(3),

  // Allow simulated PayPal for offline/test environments
  SIMULATE_PAYPAL_API: z.coerce.boolean().default(false)
});

const parsed = ConfigSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.format());
  process.exit(1);
}

// Enforce production security rules for SESSION_SECRET
const isProduction = (process.env.NODE_ENV || parsed.data.NODE_ENV) === 'production';
let sessionSecret = process.env.SESSION_SECRET || parsed.data.SESSION_SECRET;

if (isProduction) {
  if (!sessionSecret || sessionSecret.length < 32 || sessionSecret === 'finpilot-session-secret-key-at-least-32-chars-long!') {
    console.error('❌ FATAL: In production (NODE_ENV=production), SESSION_SECRET must be explicitly provided in the environment and must be at least 32 characters long.');
    process.exit(1);
  }
} else {
  sessionSecret = sessionSecret || 'finpilot-session-secret-key-at-least-32-chars-long!';
}

// Derive split flags: SHOW_DEMO_LOGIN and ENABLE_PAYMENT_SIMULATION
const showDemoLogin = process.env.SHOW_DEMO_LOGIN !== undefined
  ? parsed.data.SHOW_DEMO_LOGIN
  : (parsed.data.DEMO_MODE !== undefined ? parsed.data.DEMO_MODE : true);

const enablePaymentSimulation = process.env.ENABLE_PAYMENT_SIMULATION !== undefined
  ? parsed.data.ENABLE_PAYMENT_SIMULATION
  : (parsed.data.DEMO_MODE !== undefined ? parsed.data.DEMO_MODE : false);

export const config = {
  ...parsed.data,
  SESSION_SECRET: sessionSecret,
  SHOW_DEMO_LOGIN: showDemoLogin,
  ENABLE_PAYMENT_SIMULATION: enablePaymentSimulation
};

export type Config = typeof config;
