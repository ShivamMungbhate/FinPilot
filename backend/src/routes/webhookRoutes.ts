import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../db.js';
import { config } from '../config.js';
import {
  verifyPayPalWebhookSignature,
  getPayPalInvoiceDetails,
  simulatePayPalPayment
} from '../services/paypalService.js';
import { createAuditLog } from '../services/auditService.js';
import { SimulateWebhookSchema } from '../types.js';
import { getClientIp } from '../utils/ip.js';

export const webhookRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {

  /**
   * POST /api/webhooks/paypal
   * Official PayPal Invoicing Webhook Endpoint
   * Handles INVOICING.INVOICE.PAID with signature verification and re-fetch validation
   */
  server.post('/paypal', async (request, reply) => {
    // 1. Verify Webhook Signature
    const rawBody = (request as any).rawBody || JSON.stringify(request.body);
    const isValidSignature = await verifyPayPalWebhookSignature(request.headers, rawBody);

    if (!isValidSignature) {
      server.log.warn('PayPal webhook signature verification failed');
      await createAuditLog({
        action: 'WEBHOOK_SIGNATURE_FAILED',
        actor: 'PAYPAL_WEBHOOK',
        details: { headers: request.headers },
        ipAddress: getClientIp(request)
      });
      return reply.status(400).send({ error: 'Invalid PayPal webhook signature' });
    }

    const event = request.body as any;
    const eventType = event.event_type;
    const resource = event.resource;

    // Determine PayPal Invoice ID from resource payload
    let paypalInvoiceId: string | undefined = resource?.id;
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED' && resource?.supplementary_data?.related_ids?.invoice_id) {
      paypalInvoiceId = resource.supplementary_data.related_ids.invoice_id;
    }

    if (!paypalInvoiceId) {
      server.log.info({ eventType }, 'Webhook received without identifiable invoice ID');
      return reply.status(200).send({ received: true });
    }

    // Find the associated invoice in our database
    const invoice = await prisma.invoice.findFirst({
      where: { paypalInvoiceId }
    });

    if (!invoice) {
      server.log.warn(`Webhook received for unknown PayPal Invoice ID: ${paypalInvoiceId}`);
      return reply.status(200).send({ received: true, note: 'Invoice not found in local database' });
    }

    // Idempotency Guard: If invoice is ALREADY marked PAID, ignore duplicate webhook
    // without triggering duplicate state transitions or duplicate audit entries.
    if (invoice.status === 'PAID') {
      server.log.info({ paypalInvoiceId }, 'Invoice is already marked as PAID. Duplicate webhook ignored for idempotency.');
      return reply.status(200).send({
        status: 'DUPLICATE_IGNORED',
        invoiceStatus: 'PAID',
        message: 'Invoice is already marked as PAID. Webhook event ignored for idempotency.'
      });
    }

    // 2. Handle INVOICING.INVOICE.PAID (and related payment captures)
    if (eventType === 'INVOICING.INVOICE.PAID' || eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      await createAuditLog({
        invoiceId: invoice.id,
        action: 'WEBHOOK_PAID_RECEIVED',
        actor: 'PAYPAL_WEBHOOK',
        details: {
          eventType,
          paypalInvoiceId,
          incomingResourceStatus: resource?.status
        },
        ipAddress: getClientIp(request)
      });

      // 3. MANDATORY SECURITY RE-FETCH:
      // Re-fetch the live invoice from PayPal to confirm status and full amount
      let verifiedInvoiceData: any;
      try {
        verifiedInvoiceData = await getPayPalInvoiceDetails(paypalInvoiceId);
      } catch (err: any) {
        server.log.error(err, 'Failed to re-fetch invoice from PayPal during webhook processing');
        return reply.status(500).send({ error: 'Failed to verify invoice with PayPal API' });
      }

      const verifiedStatus = verifiedInvoiceData.status;
      const dueAmount = parseFloat(verifiedInvoiceData.due_amount?.value || '0');
      const paidAmount = parseFloat(verifiedInvoiceData.paid_amount?.value || verifiedInvoiceData.amount?.value || '0');

      server.log.info({
        paypalInvoiceId,
        verifiedStatus,
        dueAmount,
        paidAmount,
        expectedTotal: invoice.totalAmount
      }, 'Re-fetched PayPal Invoice Verification Results');

      // 4. Mark paid ONLY if status AND amount confirm it
      // Events also fire for partial/pending payments!
      const isConfirmedFullyPaid =
        verifiedStatus === 'PAID' &&
        dueAmount <= 0.00 &&
        paidAmount >= (invoice.totalAmount - 0.01);

      const isSimulated = request.headers['x-finpilot-simulated'] === 'true' ||
        (request.headers['paypal-transmission-sig'] as string) === 'sim-sig';

      if (isConfirmedFullyPaid) {
        // State Machine Transition: SENT or OVERDUE -> PAID
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: 'PAID',
            paypalStatus: 'PAID',
            paidAt: new Date()
          }
        });

        await createAuditLog({
          invoiceId: invoice.id,
          action: 'INVOICE_PAID',
          actor: 'PAYPAL_WEBHOOK',
          details: {
            simulated: isSimulated,
            simulationNotice: isSimulated
              ? 'SIMULATED PAYMENT: Dispatched via developer simulation endpoint. Not a real PayPal settlement.'
              : undefined,
            verifiedStatus,
            dueAmount,
            paidAmount,
            previousStatus: invoice.status,
            message: isSimulated
              ? 'Invoice marked as PAID via simulated webhook event (SIMULATED)'
              : 'Invoice fully verified and marked as PAID via PayPal re-fetch confirmation'
          },
          ipAddress: getClientIp(request)
        });

        return reply.status(200).send({
          status: 'SUCCESS',
          invoiceStatus: 'PAID',
          verifiedStatus,
          message: 'Invoice marked PAID after confirmation'
        });
      } else {
        // Did not meet full payment criteria (Partial payment or Pending settlement)
        await createAuditLog({
          invoiceId: invoice.id,
          action: 'PAYMENT_PARTIAL_OR_UNCONFIRMED',
          actor: 'PAYPAL_WEBHOOK',
          details: {
            verifiedStatus,
            dueAmount,
            paidAmount,
            expectedTotal: invoice.totalAmount,
            rejectionReason: verifiedStatus !== 'PAID'
              ? `PayPal status is '${verifiedStatus}', expected 'PAID'`
              : `Due amount is $${dueAmount.toFixed(2)}, expected $0.00`
          },
          ipAddress: getClientIp(request)
        });

        return reply.status(200).send({
          status: 'UNCONFIRMED',
          currentStatus: invoice.status,
          verifiedStatus,
          dueAmount,
          message: 'Payment received but did not satisfy full payment criteria. Status not changed.'
        });
      }
    }

    return reply.status(200).send({ received: true });
  });

  /**
   * POST /api/webhooks/paypal/simulate
   * Developer / QA Simulation endpoint for sandbox testing
   * Only registered when ENABLE_PAYMENT_SIMULATION=true (default false)
   */
  if (config.ENABLE_PAYMENT_SIMULATION) {
    server.post('/simulate', async (request, reply) => {
      const parseResult = SimulateWebhookSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid simulation payload', details: parseResult.error.errors });
      }

      const { paypalInvoiceId, eventType, paidStatus, dueAmount, paidAmount } = parseResult.data;

      // Simulate state change in local PayPal mock store
      simulatePayPalPayment(paypalInvoiceId, {
        status: paidStatus as any,
        dueAmount,
        paidAmount
      });

      // Record explicit SIMULATION notice in the immutable audit log
      const localInvoice = await prisma.invoice.findFirst({
        where: { paypalInvoiceId }
      });

      if (localInvoice) {
        await createAuditLog({
          invoiceId: localInvoice.id,
          action: 'WEBHOOK_SIMULATION_TRIGGERED',
          actor: 'PAYPAL_WEBHOOK',
          details: {
            simulated: true,
            simulationNotice: 'SIMULATED EVENT: Payment event was simulated via developer simulation endpoint (ENABLE_PAYMENT_SIMULATION=true)',
            paypalInvoiceId,
            eventType,
            paidStatus,
            dueAmount,
            paidAmount
          },
          ipAddress: getClientIp(request)
        });
      }

      // Formulate realistic PayPal webhook payload
      const simulatedEvent = {
        id: `WH-SIM-${Date.now()}`,
        event_version: '1.0',
        create_time: new Date().toISOString(),
        event_type: eventType,
        resource_type: 'invoices',
        resource: {
          id: paypalInvoiceId,
          status: paidStatus,
          due_amount: { currency_code: 'USD', value: dueAmount.toFixed(2) },
          paid_amount: { currency_code: 'USD', value: (paidAmount ?? (paidStatus === 'PAID' ? 500 : 50)).toFixed(2) }
        }
      };

      // Forward to internal webhook handler with synthetic headers
      const res = await server.inject({
        method: 'POST',
        url: '/api/webhooks/paypal',
        headers: {
          'content-type': 'application/json',
          'paypal-auth-algo': 'SHA256withRSA',
          'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-SIM',
          'paypal-transmission-id': `sim-trans-${Date.now()}`,
          'paypal-transmission-sig': 'sim-sig',
          'paypal-transmission-time': new Date().toISOString(),
          'x-finpilot-simulated': 'true'
        },
        payload: simulatedEvent
      });

      return reply.status(res.statusCode).send(JSON.parse(res.body));
    });
  }

};
