import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { parseInvoicePrompt } from './parser.js';
import { generateReminderText } from './reminder.js';

const server = Fastify({
  logger: true
});

server.register(cors, {
  origin: '*'
});

const ParseInvoiceSchema = z.object({
  text: z.string().min(1, 'Prompt text is required'),
  referenceDate: z.string().optional()
});

const GenerateReminderSchema = z.object({
  invoiceId: z.string().min(1),
  invoiceNumber: z.string().optional(),
  recipientName: z.string().min(1),
  recipientEmail: z.string().optional(),
  amount: z.number().positive(),
  currency: z.string().optional().default('USD'),
  dueDate: z.string(),
  daysOverdue: z.number().int().default(0),
  reminderCount: z.number().int().default(1),
  tone: z.enum(['gentle', 'firm', 'urgent']).optional()
});

// Health check
server.get('/health', async () => {
  return { status: 'ok', service: 'finpilot-ai-mock-service', timestamp: new Date().toISOString() };
});

// Endpoint 1: Parse plain-text into invoice draft proposal
server.post('/v1/parse-invoice', async (request, reply) => {
  const parseResult = ParseInvoiceSchema.safeParse(request.body);
  if (!parseResult.success) {
    return reply.status(400).send({
      error: 'Invalid input',
      details: parseResult.error.errors
    });
  }

  const { text, referenceDate } = parseResult.data;
  const proposal = parseInvoicePrompt(text, referenceDate);
  return reply.send(proposal);
});

// Backward compatibility alias
server.post('/parse-invoice', async (request, reply) => {
  return server.inject({
    method: 'POST',
    url: '/v1/parse-invoice',
    payload: request.body as any
  }).then(res => reply.status(res.statusCode).send(JSON.parse(res.body)));
});

// Endpoint 2: Generate dynamic, tailored reminder message
server.post('/v1/generate-reminder', async (request, reply) => {
  const parseResult = GenerateReminderSchema.safeParse(request.body);
  if (!parseResult.success) {
    return reply.status(400).send({
      error: 'Invalid input',
      details: parseResult.error.errors
    });
  }

  const reminder = generateReminderText(parseResult.data);
  return reply.send(reminder);
});

// Backward compatibility alias
server.post('/generate-reminder', async (request, reply) => {
  return server.inject({
    method: 'POST',
    url: '/v1/generate-reminder',
    payload: request.body as any
  }).then(res => reply.status(res.statusCode).send(JSON.parse(res.body)));
});

const PORT = parseInt(process.env.AI_SERVICE_PORT || '5001', 10);
const HOST = process.env.AI_SERVICE_HOST || '0.0.0.0';

server.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  console.log(`🤖 FinPilot Mock AI Service running on ${address}`);
});
