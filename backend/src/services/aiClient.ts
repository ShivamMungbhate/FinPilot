import { config } from '../config.js';
import {
  ParsedInvoiceResponseSchema,
  GeneratedReminderResponseSchema
} from '../types.js';

export interface ParsedInvoiceResponse {
  recipientName: string;
  recipientEmail: string;
  items: Array<{
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  currency: string;
  dueDate: string;
  notes: string;
  confidenceScore: number;
  rawPrompt: string;
  entities?: Record<string, any> | null;
}

export interface GeneratedReminderResponse {
  subject: string;
  message: string;
  tone: 'gentle' | 'firm' | 'urgent';
  suggestedFollowUpDays: number;
  reminderCount: number;
  generatedAt?: string | null;
}

/**
 * Helper to call AI service with automatic fallback to mock service if primary is unreachable
 */
async function callAiServiceWithFallback<T>(
  endpointPath: string,
  payload: any
): Promise<T> {
  const primaryUrl = `${config.AI_SERVICE_URL}${endpointPath}`;

  try {
    const res = await fetch(primaryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Service-Token': config.AI_SERVICE_TOKEN,
        'Authorization': `Bearer ${config.AI_SERVICE_TOKEN}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000)
    });

    if (!res.ok) {
      const errorText = await res.text();
      let parsedError = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        parsedError = errorJson.detail || errorJson.error || errorText;
      } catch {}
      throw new Error(`AI service failed (${res.status}): ${parsedError}`);
    }

    return await res.json() as T;
  } catch (err: any) {
    // If it's an HTTP error response from the AI service (e.g. 422 validation, prompt issue), rethrow directly
    if (err.message && err.message.startsWith('AI service failed (')) {
      throw err;
    }

    // If connection failed (service down/offline) and fallback URL is configured and different
    if (config.AI_MOCK_SERVICE_URL && config.AI_MOCK_SERVICE_URL !== config.AI_SERVICE_URL) {
      const fallbackUrl = `${config.AI_MOCK_SERVICE_URL}${endpointPath}`;
      console.warn(`⚠️ Primary AI service at ${primaryUrl} unreachable (${err.message}). Falling back to mock service at ${fallbackUrl}...`);

      try {
        const fallbackRes = await fetch(fallbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-AI-Service-Token': config.AI_SERVICE_TOKEN,
            'Authorization': `Bearer ${config.AI_SERVICE_TOKEN}`
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000)
        });

        if (!fallbackRes.ok) {
          const fallbackErrText = await fallbackRes.text();
          throw new Error(`Fallback mock AI service failed (${fallbackRes.status}): ${fallbackErrText}`);
        }

        return await fallbackRes.json() as T;
      } catch (fallbackErr: any) {
        throw new Error(`Primary AI service offline (${err.message}) and fallback mock failed: ${fallbackErr.message}`);
      }
    }

    throw err;
  }
}

/**
 * Endpoint 1: Calls AI service to parse raw plain text request into an invoice proposal
 */
export async function parseInvoiceWithAI(prompt: string): Promise<ParsedInvoiceResponse> {
  const referenceDate = new Date().toISOString().split('T')[0];

  const rawData = await callAiServiceWithFallback<ParsedInvoiceResponse>('/v1/parse-invoice', {
    text: prompt,
    referenceDate
  });

  const validation = ParsedInvoiceResponseSchema.safeParse(rawData);
  if (!validation.success) {
    throw new Error(`AI parse-invoice response schema validation failed: ${JSON.stringify(validation.error.format())}`);
  }

  return validation.data as ParsedInvoiceResponse;
}

/**
 * Endpoint 2: Calls AI service to generate tailored reminder text
 */
export async function generateReminderWithAI(params: {
  invoiceId: string;
  invoiceNumber?: string;
  recipientName: string;
  recipientEmail?: string;
  amount: number;
  currency?: string;
  dueDate: string;
  daysOverdue: number;
  reminderCount: number;
  tone?: 'gentle' | 'firm' | 'urgent';
}): Promise<GeneratedReminderResponse> {
  // Ensure clean date format (YYYY-MM-DD) for Pydantic date validator
  const cleanDueDate = params.dueDate.includes('T')
    ? params.dueDate.split('T')[0]
    : params.dueDate;

  const payload: Record<string, any> = {
    invoiceId: params.invoiceId,
    recipientName: params.recipientName,
    amount: params.amount,
    currency: params.currency || 'USD',
    dueDate: cleanDueDate,
    daysOverdue: Math.max(0, params.daysOverdue || 0),
    reminderCount: Math.max(1, params.reminderCount || 1),
    tone: params.tone || 'gentle'
  };

  if (params.invoiceNumber) {
    payload.invoiceNumber = params.invoiceNumber;
  }
  if (params.recipientEmail) {
    payload.recipientEmail = params.recipientEmail;
  }

  const rawData = await callAiServiceWithFallback<GeneratedReminderResponse>('/v1/generate-reminder', payload);

  const validation = GeneratedReminderResponseSchema.safeParse(rawData);
  if (!validation.success) {
    throw new Error(`AI generate-reminder response schema validation failed: ${JSON.stringify(validation.error.format())}`);
  }

  return validation.data as GeneratedReminderResponse;
}
