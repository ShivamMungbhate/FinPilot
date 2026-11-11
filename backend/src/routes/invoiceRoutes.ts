import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../db.js';
import {
  CreateProposalRequestSchema,
  UpdateProposalRequestSchema,
  ApproveInvoiceRequestSchema,
  SendReminderRequestSchema
} from '../types.js';
import { parseInvoiceWithAI, generateReminderWithAI } from '../services/aiClient.js';
import { validateTransition } from '../services/stateMachine.js';
import { evaluateInvoicePolicy, evaluateReminderPolicy } from '../services/policyEngine.js';
import {
  createPayPalDraftInvoice,
  sendPayPalInvoice,
  sendPayPalReminder,
  getPayPalInvoiceDetails
} from '../services/paypalService.js';
import { createAuditLog } from '../services/auditService.js';
import { checkAIRateLimit } from '../services/aiRateLimiter.js';
import { getClientIp } from '../utils/ip.js';

export const invoiceRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {

  /**
   * POST /api/invoices/parse
   * Freelancer submits plain text prompt -> AI service drafts proposal -> DB stores as PROPOSED
   */
  server.post('/parse', async (request, reply) => {
    const parseResult = CreateProposalRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parseResult.error.errors
      });
    }

    const { prompt } = parseResult.data;

    // AI Rate Limiter per user and per IP to protect Gemini API quota
    const userId = (request as any).user?.userId || 'anonymous';
    const ip = getClientIp(request);
    const rateLimit = checkAIRateLimit(userId, ip);
    if (!rateLimit.allowed) {
      return reply.status(429).send({
        error: 'Rate limit exceeded',
        message: rateLimit.message,
        retryAfter: rateLimit.retryAfterSeconds
      });
    }

    // 1. Call separate AI mock service (Endpoint 1)
    let aiProposal;
    try {
      aiProposal = await parseInvoiceWithAI(prompt);
    } catch (err: any) {
      server.log.error(err, 'Failed to call AI service');
      const errStr = (err.message || '').toLowerCase();
      const isQuota = errStr.includes('429') || errStr.includes('quota') || errStr.includes('resource_exhausted');
      return reply.status(isQuota ? 429 : 502).send({
        error: isQuota ? 'AI quota limit reached' : 'AI service unreachable or failed',
        message: isQuota
          ? 'AI quota limit reached (Gemini rate limit). Please wait a few moments and try again.'
          : (err.message || 'AI service temporarily unavailable. Please try again in a few moments.')
      });
    }

    // Calculate total
    const totalAmount = aiProposal.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);

    // Generate unique invoice number: INV-YYYY-XXXX
    const currentYear = new Date().getFullYear();
    const count = await prisma.invoice.count();
    const invoiceNumber = `INV-${currentYear}-${String(count + 101).padStart(4, '0')}`;

    // Safe fallbacks for extracted fields
    const recipientName = aiProposal.recipientName?.trim() || 'Valued Client';
    const recipientEmail = aiProposal.recipientEmail?.trim() || 'client@example.com';

    let targetDueDate = aiProposal.dueDate ? new Date(aiProposal.dueDate) : new Date();
    if (isNaN(targetDueDate.getTime())) {
      targetDueDate = new Date();
      targetDueDate.setDate(targetDueDate.getDate() + 14);
    }

    // 2. Evaluate Policy Engine
    const policyResult = await evaluateInvoicePolicy({
      recipientEmail,
      totalAmount,
      actor: 'SYSTEM'
    });

    // 3. Save to database in state: PROPOSED
    const invoice = await prisma.invoice.create({
      data: {
        userId: userId === 'anonymous' ? null : userId,
        invoiceNumber,
        recipientName,
        recipientEmail,
        currency: aiProposal.currency || 'USD',
        totalAmount,
        status: 'PROPOSED',
        dueDate: targetDueDate,
        notes: aiProposal.notes,
        rawPrompt: prompt,
        confidenceScore: aiProposal.confidenceScore,
        items: {
          create: aiProposal.items.map(item => ({
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice
          }))
        }
      },
      include: {
        items: true
      }
    });

    // 4. Log Audit Action
    await createAuditLog({
      invoiceId: invoice.id,
      action: 'INVOICE_PROPOSED',
      actor: 'FREELANCER',
      details: {
        prompt,
        extractedInvoiceNumber: invoiceNumber,
        totalAmount,
        policyAllowed: policyResult.allowed,
        policyViolations: policyResult.violations
      },
      ipAddress: request.ip
    });

    return reply.status(201).send({
      invoice,
      policy: policyResult
    });
  });

  /**
   * GET /api/invoices
   * List invoices with filters
   */
  server.get('/', async (request, reply) => {
    const { status, search } = request.query as { status?: string; search?: string };

    const where: any = {};
    const userId = (request as any).user?.userId;
    if (userId) {
      where.OR = [
        { userId },
        { userId: null }
      ];
    }
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search } },
        { recipientName: { contains: search } },
        { recipientEmail: { contains: search } }
      ];
    }

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        _count: {
          select: { auditLogs: true }
        }
      }
    });

    // Auto-check overdue status for SENT invoices
    const now = new Date();
    for (const inv of invoices) {
      if (inv.status === 'SENT' && new Date(inv.dueDate) < now) {
        await prisma.invoice.update({
          where: { id: inv.id },
          data: { status: 'OVERDUE' }
        });
        inv.status = 'OVERDUE';
        await createAuditLog({
          invoiceId: inv.id,
          action: 'STATUS_CHANGED_OVERDUE',
          actor: 'SYSTEM',
          details: { dueDate: inv.dueDate, checkedAt: now }
        });
      }
    }

    return reply.send({ invoices });
  });

  /**
   * GET /api/invoices/:id
   * Get single invoice with full audit history and policy validation
   */
  server.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        items: true,
        auditLogs: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!invoice) {
      return reply.status(404).send({ error: 'Invoice not found' });
    }

    // Evaluate live policy status
    const policyResult = await evaluateInvoicePolicy({
      invoiceId: invoice.id,
      recipientEmail: invoice.recipientEmail,
      totalAmount: invoice.totalAmount
    });

    return reply.send({
      invoice,
      policy: policyResult
    });
  });

  /**
   * PUT /api/invoices/:id
   * Freelancer edits draft proposal (allowed only in PROPOSED state)
   */
  server.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseResult = UpdateProposalRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parseResult.error.errors
      });
    }

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return reply.status(404).send({ error: 'Invoice not found' });
    }

    if (invoice.status !== 'PROPOSED') {
      return reply.status(400).send({
        error: `Invoice cannot be edited while in '${invoice.status}' state. Only PROPOSED invoices can be modified.`
      });
    }

    const { recipientName, recipientEmail, dueDate, currency, notes, items } = parseResult.data;
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    // Re-check policy with updated values
    const policyResult = await evaluateInvoicePolicy({
      invoiceId: id,
      recipientEmail,
      totalAmount,
      actor: 'FREELANCER'
    });

    // Delete old items and insert updated ones in transaction
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      return tx.invoice.update({
        where: { id },
        data: {
          recipientName,
          recipientEmail,
          dueDate: new Date(dueDate),
          currency,
          notes,
          totalAmount,
          items: {
            create: items.map(i => ({
              name: i.name,
              description: i.description,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              total: i.quantity * i.unitPrice
            }))
          }
        },
        include: { items: true }
      });
    });

    await createAuditLog({
      invoiceId: id,
      action: 'INVOICE_PROPOSAL_EDITED',
      actor: 'FREELANCER',
      details: {
        updatedFields: { recipientName, recipientEmail, dueDate, totalAmount },
        policyAllowed: policyResult.allowed,
        policyViolations: policyResult.violations
      },
      ipAddress: request.ip
    });

    return reply.send({
      invoice: updatedInvoice,
      policy: policyResult
    });
  });

  /**
   * POST /api/invoices/:id/approve
   * Freelancer explicitly approves the invoice proposal
   * State Machine: PROPOSED -> APPROVED
   */
  server.post('/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const bodyResult = ApproveInvoiceRequestSchema.safeParse(request.body || {});
    const { overrideWarnings } = bodyResult.success ? bodyResult.data : { overrideWarnings: false };

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!invoice) {
      return reply.status(404).send({ error: 'Invoice not found' });
    }

    // 1. Strict State Machine Validation
    try {
      validateTransition(invoice.status as any, 'APPROVED', 'Freelancer approval step');
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }

    // 2. Policy Engine Verification
    const policyResult = await evaluateInvoicePolicy({
      invoiceId: invoice.id,
      recipientEmail: invoice.recipientEmail,
      totalAmount: invoice.totalAmount,
      actor: 'FREELANCER'
    });

    if (!policyResult.allowed && !overrideWarnings) {
      return reply.status(422).send({
        error: 'Invoice approval blocked by Policy Engine',
        violations: policyResult.violations,
        requiresOverride: true
      });
    }

    // 3. Transition to APPROVED
    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAt: new Date()
      },
      include: { items: true }
    });

    // 4. Log Audit
    await createAuditLog({
      invoiceId: id,
      action: 'INVOICE_APPROVED',
      actor: 'FREELANCER',
      details: {
        overrideWarnings,
        policyViolations: policyResult.violations,
        approvedTotal: updatedInvoice.totalAmount
      },
      ipAddress: request.ip
    });

    return reply.send({
      message: 'Invoice approved successfully',
      invoice: updatedInvoice
    });
  });

  /**
   * POST /api/invoices/:id/create-paypal
   * Creates the draft invoice in PayPal Sandbox
   * State Machine: APPROVED -> CREATED
   */
  server.post('/:id/create-paypal', async (request, reply) => {
    const { id } = request.params as { id: string };

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!invoice) {
      return reply.status(404).send({ error: 'Invoice not found' });
    }

    // Strict State Machine: Must be APPROVED
    try {
      validateTransition(invoice.status as any, 'CREATED', 'Creating PayPal draft requires prior approval');
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }

    // Create Draft on PayPal Sandbox
    try {
      const paypalRes = await createPayPalDraftInvoice({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        recipientName: invoice.recipientName,
        recipientEmail: invoice.recipientEmail,
        currency: invoice.currency,
        totalAmount: invoice.totalAmount,
        dueDate: invoice.dueDate,
        notes: invoice.notes,
        items: invoice.items
      });

      const updatedInvoice = await prisma.invoice.update({
        where: { id },
        data: {
          status: 'CREATED',
          paypalInvoiceId: paypalRes.paypalInvoiceId,
          paypalPaymentUrl: paypalRes.paymentUrl,
          paypalStatus: 'DRAFT'
        },
        include: { items: true }
      });

      await createAuditLog({
        invoiceId: id,
        action: 'PAYPAL_DRAFT_CREATED',
        actor: 'SYSTEM',
        details: {
          paypalInvoiceId: paypalRes.paypalInvoiceId,
          paymentUrl: paypalRes.paymentUrl
        },
        ipAddress: request.ip
      });

      return reply.send({
        message: 'PayPal draft created successfully',
        invoice: updatedInvoice
      });
    } catch (err: any) {
      server.log.error(err, 'Failed to create PayPal draft');
      return reply.status(502).send({
        error: 'PayPal API Error',
        message: err.message
      });
    }
  });

  /**
   * POST /api/invoices/:id/send
   * Freelancer explicitly clicks "Send Invoice" from UI
   * State Machine: CREATED -> SENT
   */
  server.post('/:id/send', async (request, reply) => {
    const { id } = request.params as { id: string };

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!invoice) {
      return reply.status(404).send({ error: 'Invoice not found' });
    }

    if (!invoice.paypalInvoiceId) {
      return reply.status(400).send({
        error: 'Invoice cannot be sent because no PayPal Invoice ID is attached. Please create the PayPal draft first.'
      });
    }

    // Strict State Machine: Must be CREATED
    try {
      validateTransition(invoice.status as any, 'SENT', 'Sending invoice to client');
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }

    try {
      await sendPayPalInvoice(invoice.paypalInvoiceId);

      const updatedInvoice = await prisma.invoice.update({
        where: { id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          paypalStatus: 'SENT'
        },
        include: { items: true }
      });

      await createAuditLog({
        invoiceId: id,
        action: 'INVOICE_SENT',
        actor: 'FREELANCER',
        details: {
          paypalInvoiceId: invoice.paypalInvoiceId,
          recipientEmail: invoice.recipientEmail,
          sentAt: updatedInvoice.sentAt
        },
        ipAddress: request.ip
      });

      return reply.send({
        message: 'Invoice successfully dispatched to recipient via PayPal',
        invoice: updatedInvoice
      });
    } catch (err: any) {
      server.log.error(err, 'Failed to send PayPal invoice');
      return reply.status(502).send({
        error: 'PayPal API Error sending invoice',
        message: err.message
      });
    }
  });

  /**
   * POST /api/invoices/:id/remind
   * Dispatches reminder via PayPal with AI drafted copy
   * Policy governed: max reminder limits, cooldown days
   */
  server.post('/:id/remind', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parseBody = SendReminderRequestSchema.safeParse(request.body || {});
    const { tone, customNote } = parseBody.success ? parseBody.data : { tone: undefined, customNote: undefined };

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return reply.status(404).send({ error: 'Invoice not found' });
    }

    if (!invoice.paypalInvoiceId) {
      return reply.status(400).send({ error: 'Invoice does not have a PayPal ID' });
    }

    // 1. Policy check: limits & cooldown
    const policyResult = await evaluateReminderPolicy(id);
    if (!policyResult.allowed) {
      return reply.status(422).send({
        error: 'Reminder blocked by policy',
        violations: policyResult.violations
      });
    }

    // Calculate days overdue
    const now = new Date();
    const daysOverdue = Math.max(0, Math.floor((now.getTime() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24)));

    // AI Rate Limiter per user and per IP to protect Gemini API quota
    const userId = (request as any).user?.userId || 'anonymous';
    const ip = getClientIp(request);
    const rateLimit = checkAIRateLimit(userId, ip);
    if (!rateLimit.allowed) {
      return reply.status(429).send({
        error: 'Rate limit exceeded',
        message: rateLimit.message,
        retryAfter: rateLimit.retryAfterSeconds
      });
    }

    // 2. Call AI service (Endpoint 2) for dynamic reminder copy
    let reminderCopy;
    try {
      reminderCopy = await generateReminderWithAI({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        recipientName: invoice.recipientName,
        recipientEmail: invoice.recipientEmail,
        amount: invoice.totalAmount,
        currency: invoice.currency,
        dueDate: invoice.dueDate.toISOString().split('T')[0],
        daysOverdue,
        reminderCount: invoice.reminderCount + 1,
        tone
      });
    } catch (err: any) {
      // Fallback if AI service is unavailable
      reminderCopy = {
        subject: `Reminder: Invoice ${invoice.invoiceNumber} is past due`,
        message: customNote || `Hi ${invoice.recipientName}, please remit payment for invoice ${invoice.invoiceNumber} ($${invoice.totalAmount.toFixed(2)} ${invoice.currency}) at your earliest convenience.`,
        tone: 'gentle' as const,
        suggestedFollowUpDays: 3,
        reminderCount: invoice.reminderCount + 1
      };
    }

    // 3. Dispatch reminder via PayPal API
    try {
      const subject = reminderCopy.subject;
      const note = customNote || reminderCopy.message;

      await sendPayPalReminder(invoice.paypalInvoiceId, subject, note);

      // 4. Update reminder count and timestamp
      const updatedInvoice = await prisma.invoice.update({
        where: { id },
        data: {
          reminderCount: { increment: 1 },
          lastReminderAt: new Date()
        }
      });

      // 5. Log in audit table
      await createAuditLog({
        invoiceId: id,
        action: 'REMINDER_SENT',
        actor: 'FREELANCER',
        details: {
          reminderNumber: updatedInvoice.reminderCount,
          subject,
          notePreview: note.substring(0, 150),
          tone: reminderCopy.tone
        },
        ipAddress: request.ip
      });

      return reply.send({
        message: 'Reminder successfully dispatched',
        invoice: updatedInvoice,
        reminderDetails: reminderCopy
      });
    } catch (err: any) {
      server.log.error(err, 'Failed to send reminder via PayPal');
      return reply.status(502).send({
        error: 'PayPal API Error sending reminder',
        message: err.message
      });
    }
  });

  /**
   * POST /api/invoices/:id/sync
   * Re-fetches invoice details directly from PayPal API to ensure local state matches
   */
  server.post('/:id/sync', async (request, reply) => {
    const { id } = request.params as { id: string };

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return reply.status(404).send({ error: 'Invoice not found' });
    }

    if (!invoice.paypalInvoiceId) {
      return reply.status(400).send({ error: 'No PayPal Invoice ID on record' });
    }

    try {
      const paypalData = await getPayPalInvoiceDetails(invoice.paypalInvoiceId);

      // Check if status on PayPal is PAID and confirm zero due balance
      const paypalStatus = paypalData.status;
      const dueAmountVal = parseFloat(paypalData.due_amount?.value || '0');
      let newStatus = invoice.status;

      if (paypalStatus === 'PAID' && dueAmountVal === 0.0) {
        if (invoice.status !== 'PAID') {
          newStatus = 'PAID';
          await prisma.invoice.update({
            where: { id },
            data: {
              status: 'PAID',
              paypalStatus: 'PAID',
              paidAt: new Date()
            }
          });

          await createAuditLog({
            invoiceId: id,
            action: 'INVOICE_PAID',
            actor: 'SYSTEM',
            details: {
              source: 'MANUAL_OR_POLL_SYNC',
              paypalStatus,
              dueAmount: dueAmountVal
            }
          });
        }
      } else if (invoice.status === 'SENT' && new Date(invoice.dueDate) < new Date()) {
        newStatus = 'OVERDUE';
        await prisma.invoice.update({
          where: { id },
          data: { status: 'OVERDUE' }
        });
      }

      return reply.send({
        message: 'Invoice synced with PayPal',
        currentStatus: newStatus,
        paypalDetails: paypalData
      });
    } catch (err: any) {
      server.log.error(err, 'PayPal sync failed');
      return reply.status(502).send({
        error: 'Failed to sync with PayPal',
        message: err.message
      });
    }
  });

};
