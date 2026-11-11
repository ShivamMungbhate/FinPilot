import { z } from 'zod';

export const InvoiceStatusEnum = z.enum([
  'PROPOSED',
  'APPROVED',
  'CREATED',
  'SENT',
  'PAID',
  'OVERDUE'
]);

export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>;

export const InvoiceItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Item name is required'),
  description: z.string().optional().nullable(),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unitPrice: z.number().nonnegative('Unit price cannot be negative'),
  total: z.number().optional()
});

export const CreateProposalRequestSchema = z.object({
  prompt: z.string().min(3, 'Please provide a descriptive prompt for the invoice')
});

export const UpdateProposalRequestSchema = z.object({
  recipientName: z.string().min(1, 'Recipient name is required'),
  recipientEmail: z.string().email('Invalid email address'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Due date must be in YYYY-MM-DD format'),
  currency: z.string().length(3).default('USD'),
  notes: z.string().optional().nullable(),
  items: z.array(InvoiceItemSchema).min(1, 'At least one line item is required')
});

export const ApproveInvoiceRequestSchema = z.object({
  comment: z.string().optional(),
  overrideWarnings: z.boolean().default(false)
});

export const SendReminderRequestSchema = z.object({
  tone: z.enum(['gentle', 'firm', 'urgent']).optional(),
  customNote: z.string().optional()
});

export const UpdatePolicySchema = z.object({
  maxAmountLimit: z.number().positive(),
  duplicateWindowHours: z.number().int().positive(),
  maxRemindersPerInvoice: z.number().int().nonnegative(),
  minDaysBetweenReminders: z.number().nonnegative()
});

export const SimulateWebhookSchema = z.object({
  paypalInvoiceId: z.string().min(1),
  eventType: z.enum(['INVOICING.INVOICE.PAID', 'PAYMENT.CAPTURE.COMPLETED', 'INVOICING.INVOICE.PARTIALLY_PAID', 'INVOICING.INVOICE.CANCELLED']).default('INVOICING.INVOICE.PAID'),
  paidStatus: z.enum(['PAID', 'PARTIALLY_PAID', 'PENDING', 'SENT']).default('PAID'),
  dueAmount: z.number().default(0.0),
  paidAmount: z.number().optional()
});

export const ParsedInvoiceItemSchema = z.object({
  name: z.string(),
  description: z.string().optional().default(''),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number()
});

export const ParsedInvoiceResponseSchema = z.object({
  recipientName: z.string(),
  recipientEmail: z.string(),
  items: z.array(ParsedInvoiceItemSchema),
  currency: z.string(),
  dueDate: z.string(),
  notes: z.string().optional().default(''),
  confidenceScore: z.number().min(0).max(1),
  rawPrompt: z.string(),
  entities: z.record(z.any()).optional().nullable()
});

export const GeneratedReminderResponseSchema = z.object({
  subject: z.string(),
  message: z.string(),
  tone: z.enum(['gentle', 'firm', 'urgent']),
  suggestedFollowUpDays: z.number(),
  reminderCount: z.number(),
  generatedAt: z.string().optional().nullable()
});

