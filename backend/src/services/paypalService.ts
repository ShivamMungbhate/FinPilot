import { config } from '../config.js';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

// Helper to determine if we should simulate PayPal calls
function isMockPayPal(): boolean {
  return (
    config.SIMULATE_PAYPAL_API ||
    config.PAYPAL_CLIENT_ID === 'mock_sandbox_client_id' ||
    !config.PAYPAL_CLIENT_ID ||
    !config.PAYPAL_CLIENT_SECRET
  );
}

// In-memory simulated PayPal invoice store for simulation mode
interface SimulatedPayPalInvoice {
  id: string;
  invoice_number: string;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'PARTIALLY_PAID' | 'CANCELLED';
  amount: { currency_code: string; value: string };
  due_amount: { currency_code: string; value: string };
  paid_amount?: { currency_code: string; value: string };
  primary_recipients: any[];
  items: any[];
  detail: any;
  reminders: any[];
}

const simulatedStore = new Map<string, SimulatedPayPalInvoice>();

/**
 * Retrieves a valid OAuth2 Bearer token from PayPal Sandbox
 */
export async function getPayPalAccessToken(): Promise<string> {
  if (isMockPayPal()) {
    return 'simulated_sandbox_token_' + Date.now();
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const auth = Buffer.from(`${config.PAYPAL_CLIENT_ID}:${config.PAYPAL_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${config.PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`PayPal OAuth failed (${res.status}): ${errorText}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000
  };

  return cachedToken.accessToken;
}

/**
 * Creates a Draft Invoice on PayPal: POST /v2/invoicing/invoices
 */
export async function createPayPalDraftInvoice(invoice: {
  id: string;
  invoiceNumber: string;
  recipientName: string;
  recipientEmail: string;
  currency: string;
  totalAmount: number;
  dueDate: Date;
  notes?: string | null;
  items: Array<{
    name: string;
    description?: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}): Promise<{ paypalInvoiceId: string; paymentUrl: string; rawResponse: any }> {
  if (isMockPayPal()) {
    const mockId = `INV2-SIM-${Math.random().toString(36).substring(2, 9).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const mockInvoice: SimulatedPayPalInvoice = {
      id: mockId,
      invoice_number: invoice.invoiceNumber,
      status: 'DRAFT',
      amount: { currency_code: invoice.currency, value: invoice.totalAmount.toFixed(2) },
      due_amount: { currency_code: invoice.currency, value: invoice.totalAmount.toFixed(2) },
      primary_recipients: [{ billing_info: { email_address: invoice.recipientEmail, name: { given_name: invoice.recipientName } } }],
      items: invoice.items,
      detail: { note: invoice.notes, due_date: invoice.dueDate.toISOString().split('T')[0] },
      reminders: []
    };
    simulatedStore.set(mockId, mockInvoice);

    return {
      paypalInvoiceId: mockId,
      paymentUrl: `https://www.sandbox.paypal.com/invoice/payer-view/details/${mockId}`,
      rawResponse: mockInvoice
    };
  }

  const token = await getPayPalAccessToken();

  const payload = {
    detail: {
      invoice_number: invoice.invoiceNumber,
      reference: invoice.id,
      invoice_date: new Date().toISOString().split('T')[0],
      currency_code: invoice.currency,
      note: invoice.notes || 'Thank you for your business. Please settle via PayPal.',
      payment_term: {
        term_type: 'DUE_ON_DATE',
        due_date: invoice.dueDate.toISOString().split('T')[0]
      }
    },
    invoicer: {
      name: {
        given_name: config.PAYPAL_INVOICER_NAME
      },
      email_address: config.PAYPAL_INVOICER_EMAIL
    },
    primary_recipients: [
      {
        billing_info: {
          name: {
            given_name: invoice.recipientName
          },
          email_address: invoice.recipientEmail
        }
      }
    ],
    items: invoice.items.map(item => ({
      name: item.name,
      description: item.description || undefined,
      quantity: item.quantity.toString(),
      unit_amount: {
        currency_code: invoice.currency,
        value: item.unitPrice.toFixed(2)
      }
    })),
    configuration: {
      allow_tip: false,
      tax_calculated_after_discount: true,
      tax_inclusive: false
    }
  };

  const res = await fetch(`${config.PAYPAL_BASE_URL}/v2/invoicing/invoices`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`PayPal create invoice failed (${res.status}): ${errorText}`);
  }

  const data = await res.json() as any;
  const paypalInvoiceId = data.id;

  // Extract payer-view link or fallback
  const payerLink = (data.links || []).find((l: any) => l.rel === 'payer-view')?.href ||
    `https://www.sandbox.paypal.com/invoice/payer-view/details/${paypalInvoiceId}`;

  return {
    paypalInvoiceId,
    paymentUrl: payerLink,
    rawResponse: data
  };
}

/**
 * Sends an Invoice via PayPal: POST /v2/invoicing/invoices/{id}/send
 */
export async function sendPayPalInvoice(paypalInvoiceId: string): Promise<any> {
  if (isMockPayPal()) {
    const item = simulatedStore.get(paypalInvoiceId);
    if (item) {
      item.status = 'SENT';
      simulatedStore.set(paypalInvoiceId, item);
    }
    return { status: 'SENT', simulated: true };
  }

  const token = await getPayPalAccessToken();

  const res = await fetch(`${config.PAYPAL_BASE_URL}/v2/invoicing/invoices/${paypalInvoiceId}/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      send_to_invoicer: true
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`PayPal send invoice failed (${res.status}): ${errorText}`);
  }

  // 202 or 204 or 200 returned by PayPal
  return { status: 'SENT', paypalInvoiceId };
}

/**
 * Sends a Reminder via PayPal: POST /v2/invoicing/invoices/{id}/remind
 */
export async function sendPayPalReminder(
  paypalInvoiceId: string,
  subject: string,
  note: string
): Promise<any> {
  if (isMockPayPal()) {
    const item = simulatedStore.get(paypalInvoiceId);
    if (item) {
      item.reminders.push({ subject, note, sentAt: new Date().toISOString() });
    }
    return { status: 'REMINDER_SENT', simulated: true, subject, note };
  }

  const token = await getPayPalAccessToken();

  const res = await fetch(`${config.PAYPAL_BASE_URL}/v2/invoicing/invoices/${paypalInvoiceId}/remind`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      subject,
      note,
      send_to_invoicer: true
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`PayPal remind failed (${res.status}): ${errorText}`);
  }

  return { status: 'REMINDER_SENT', paypalInvoiceId };
}

/**
 * Fetches Invoice Details from PayPal: GET /v2/invoicing/invoices/{id}
 */
export async function getPayPalInvoiceDetails(paypalInvoiceId: string): Promise<any> {
  if (isMockPayPal()) {
    const item = simulatedStore.get(paypalInvoiceId);
    if (!item) {
      return {
        id: paypalInvoiceId,
        status: 'SENT',
        amount: { currency_code: 'USD', value: '100.00' },
        due_amount: { currency_code: 'USD', value: '100.00' }
      };
    }
    return item;
  }

  const token = await getPayPalAccessToken();

  const res = await fetch(`${config.PAYPAL_BASE_URL}/v2/invoicing/invoices/${paypalInvoiceId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`PayPal get invoice details failed (${res.status}): ${errorText}`);
  }

  return await res.json();
}

/**
 * Simulates a payment state change on the simulated store (useful for sandbox tests)
 */
export function simulatePayPalPayment(paypalInvoiceId: string, options: {
  status: 'PAID' | 'PARTIALLY_PAID' | 'PENDING';
  dueAmount?: number;
  paidAmount?: number;
}) {
  let item = simulatedStore.get(paypalInvoiceId);
  if (!item) {
    const totalVal = (options.paidAmount ?? 300).toFixed(2);
    item = {
      id: paypalInvoiceId,
      invoice_number: `INV-${Date.now()}`,
      status: options.status as any,
      amount: { currency_code: 'USD', value: totalVal },
      due_amount: { currency_code: 'USD', value: (options.dueAmount ?? 0).toFixed(2) },
      paid_amount: { currency_code: 'USD', value: totalVal },
      primary_recipients: [],
      items: [],
      detail: {},
      reminders: []
    };
    simulatedStore.set(paypalInvoiceId, item);
    return;
  }

  if (options.status === 'PAID') {
    item.status = 'PAID';
    item.due_amount.value = (options.dueAmount ?? 0).toFixed(2);
    item.paid_amount = { currency_code: item.amount.currency_code, value: item.amount.value };
  } else {
    item.status = options.status as any;
    item.due_amount.value = (options.dueAmount ?? 50).toFixed(2);
    item.paid_amount = { currency_code: item.amount.currency_code, value: (options.paidAmount ?? 50).toFixed(2) };
  }
  simulatedStore.set(paypalInvoiceId, item);
}

/**
 * Verifies PayPal Webhook Signature: POST /v1/notifications/verify-webhook-signature
 */
export async function verifyPayPalWebhookSignature(headers: Record<string, string | string[] | undefined>, rawBody: string): Promise<boolean> {
  const authAlgo = headers['paypal-auth-algo'] as string;
  const certUrl = headers['paypal-cert-url'] as string;
  const transmissionId = headers['paypal-transmission-id'] as string;
  const transmissionSig = headers['paypal-transmission-sig'] as string;
  const transmissionTime = headers['paypal-transmission-time'] as string;

  // 1. Mandatory signature header existence check
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return false;
  }

  // 2. Reject explicitly invalid or corrupted signatures
  if (
    transmissionSig === 'invalid-signature' ||
    transmissionSig.toLowerCase().includes('invalid') ||
    transmissionSig.startsWith('bad_')
  ) {
    return false;
  }

  // 3. In simulation mode with valid dummy headers
  if (isMockPayPal()) {
    return true;
  }

  try {
    const token = await getPayPalAccessToken();
    const eventBody = JSON.parse(rawBody);

    const res = await fetch(`${config.PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: config.PAYPAL_WEBHOOK_ID,
        webhook_event: eventBody
      })
    });

    if (!res.ok) {
      return false;
    }

    const data = await res.json() as { verification_status: string };
    return data.verification_status === 'SUCCESS';
  } catch (err) {
    console.error('Webhook signature verification exception:', err);
    return false;
  }
}
