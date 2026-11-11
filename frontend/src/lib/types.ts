export type InvoiceStatus = 'PROPOSED' | 'APPROVED' | 'CREATED' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface InvoiceItem {
  id?: string;
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  recipientName: string;
  recipientEmail: string;
  currency: string;
  totalAmount: number;
  status: InvoiceStatus;
  dueDate: string;
  notes?: string | null;
  rawPrompt?: string | null;
  confidenceScore?: number | null;
  paypalInvoiceId?: string | null;
  paypalStatus?: string | null;
  paypalPaymentUrl?: string | null;
  approvedAt?: string | null;
  sentAt?: string | null;
  paidAt?: string | null;
  lastReminderAt?: string | null;
  reminderCount: number;
  createdAt: string;
  updatedAt: string;
  items: InvoiceItem[];
  auditLogs?: AuditLog[];
  _count?: {
    auditLogs: number;
  };
}

export interface PolicyCheckResult {
  allowed: boolean;
  violations: string[];
  warnings: string[];
  policySnapshot: {
    maxAmountLimit: number;
    duplicateWindowHours: number;
    maxRemindersPerInvoice: number;
    minDaysBetweenReminders: number;
  };
}

export interface AuditLog {
  id: string;
  invoiceId?: string | null;
  action: string;
  actor: string;
  details?: any;
  ipAddress?: string | null;
  createdAt: string;
  invoice?: {
    invoiceNumber: string;
    recipientName: string;
    totalAmount: number;
    status: InvoiceStatus;
  };
}

export interface PolicyConfig {
  id: string;
  maxAmountLimit: number;
  duplicateWindowHours: number;
  maxRemindersPerInvoice: number;
  minDaysBetweenReminders: number;
  updatedAt: string;
}
