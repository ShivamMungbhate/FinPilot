import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../db.js';
import { getActivePolicyConfig, evaluateInvoicePolicy } from '../services/policyEngine.js';
import { UpdatePolicySchema } from '../types.js';
import { createAuditLog } from '../services/auditService.js';

export const policyRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {

  /**
   * GET /api/policy
   * Retrieve active policy rules
   */
  server.get('/', async (request, reply) => {
    const policy = await getActivePolicyConfig();
    return reply.send({ policy });
  });

  /**
   * PUT /api/policy
   * Update active policy rules
   */
  server.put('/', async (request, reply) => {
    const parseResult = UpdatePolicySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid policy payload',
        details: parseResult.error.errors
      });
    }

    const { maxAmountLimit, duplicateWindowHours, maxRemindersPerInvoice, minDaysBetweenReminders } = parseResult.data;

    const updated = await prisma.policyConfig.upsert({
      where: { id: 'default' },
      update: {
        maxAmountLimit,
        duplicateWindowHours,
        maxRemindersPerInvoice,
        minDaysBetweenReminders
      },
      create: {
        id: 'default',
        maxAmountLimit,
        duplicateWindowHours,
        maxRemindersPerInvoice,
        minDaysBetweenReminders
      }
    });

    await createAuditLog({
      action: 'POLICY_CONFIG_UPDATED',
      actor: 'FREELANCER',
      details: { newConfig: updated },
      ipAddress: request.ip
    });

    return reply.send({
      message: 'Policy configuration updated',
      policy: updated
    });
  });

  /**
   * POST /api/policy/evaluate
   * Dry-run evaluate an amount and recipient against the policy
   */
  server.post('/evaluate', async (request, reply) => {
    const { recipientEmail, totalAmount } = request.body as { recipientEmail: string; totalAmount: number };
    if (!recipientEmail || typeof totalAmount !== 'number') {
      return reply.status(400).send({ error: 'recipientEmail and totalAmount are required' });
    }

    const result = await evaluateInvoicePolicy({
      recipientEmail,
      totalAmount,
      actor: 'FREELANCER'
    });

    return reply.send(result);
  });

};
