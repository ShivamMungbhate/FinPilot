import { prisma } from '../db.js';
import { config } from '../config.js';
import { createAuditLog } from './auditService.js';

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

export async function getActivePolicyConfig() {
  let policy = await prisma.policyConfig.findUnique({
    where: { id: 'default' }
  });

  if (!policy) {
    policy = await prisma.policyConfig.create({
      data: {
        id: 'default',
        maxAmountLimit: config.MAX_INVOICE_AMOUNT,
        duplicateWindowHours: config.DUPLICATE_WINDOW_HOURS,
        maxRemindersPerInvoice: config.MAX_REMINDERS_PER_INVOICE,
        minDaysBetweenReminders: config.MIN_DAYS_BETWEEN_REMINDERS,
      }
    });
  }

  return policy;
}

/**
 * Validates an invoice against invoice creation/approval policies:
 * 1. Max amount limit
 * 2. Duplicate invoice check within configurable window
 */
export async function evaluateInvoicePolicy(params: {
  invoiceId?: string;
  recipientEmail: string;
  totalAmount: number;
  actor?: 'FREELANCER' | 'SYSTEM';
}): Promise<PolicyCheckResult> {
  const policy = await getActivePolicyConfig();
  const violations: string[] = [];
  const warnings: string[] = [];

  // 1. Max Amount Limit
  if (params.totalAmount > policy.maxAmountLimit) {
    violations.push(
      `Policy Violation: Invoice total $${params.totalAmount.toFixed(2)} exceeds maximum permitted threshold of $${policy.maxAmountLimit.toFixed(2)}`
    );
  }

  // 2. Duplicate Invoice Check
  const windowStart = new Date(Date.now() - policy.duplicateWindowHours * 60 * 60 * 1000);

  const duplicateCandidates = await prisma.invoice.findMany({
    where: {
      id: params.invoiceId ? { not: params.invoiceId } : undefined,
      recipientEmail: { equals: params.recipientEmail.trim() },
      status: { notIn: [] }, // check all active states
      createdAt: { gte: windowStart }
    }
  });

  // Check if any candidate has the exact or nearly exact total amount
  for (const candidate of duplicateCandidates) {
    const diff = Math.abs(candidate.totalAmount - params.totalAmount);
    if (diff < 0.01) {
      violations.push(
        `Duplicate Invoice Detected: Invoice #${candidate.invoiceNumber} for $${candidate.totalAmount.toFixed(2)} was already drafted/sent to ${params.recipientEmail} within the last ${policy.duplicateWindowHours} hours (Created on ${candidate.createdAt.toISOString()})`
      );
      break;
    }
  }

  const allowed = violations.length === 0;

  // Log policy evaluation in audit table
  await createAuditLog({
    invoiceId: params.invoiceId || null,
    action: 'POLICY_EVALUATED',
    actor: 'POLICY_ENGINE',
    details: {
      recipientEmail: params.recipientEmail,
      totalAmount: params.totalAmount,
      allowed,
      violations,
      warnings,
      policySnapshot: {
        maxAmountLimit: policy.maxAmountLimit,
        duplicateWindowHours: policy.duplicateWindowHours
      }
    }
  });

  return {
    allowed,
    violations,
    warnings,
    policySnapshot: {
      maxAmountLimit: policy.maxAmountLimit,
      duplicateWindowHours: policy.duplicateWindowHours,
      maxRemindersPerInvoice: policy.maxRemindersPerInvoice,
      minDaysBetweenReminders: policy.minDaysBetweenReminders
    }
  };
}

/**
 * Validates reminder rules:
 * 1. Invoice status must be SENT or OVERDUE
 * 2. Cannot exceed max reminders per invoice
 * 3. Must respect minimum cooldown days between reminders
 */
export async function evaluateReminderPolicy(invoiceId: string): Promise<PolicyCheckResult> {
  const policy = await getActivePolicyConfig();
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId }
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  const violations: string[] = [];
  const warnings: string[] = [];

  // Check status
  if (invoice.status !== 'SENT' && invoice.status !== 'OVERDUE') {
    violations.push(`Reminder not permitted: Invoice is currently in '${invoice.status}' status. Reminders are only allowed for SENT or OVERDUE invoices.`);
  }

  // Check max reminder count
  if (invoice.reminderCount >= policy.maxRemindersPerInvoice) {
    violations.push(
      `Reminder limit reached: Maximum of ${policy.maxRemindersPerInvoice} reminders allowed per invoice (${invoice.reminderCount} already dispatched).`
    );
  }

  // Check minimum cooldown days
  if (invoice.lastReminderAt) {
    const now = new Date();
    const diffMs = now.getTime() - new Date(invoice.lastReminderAt).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays < policy.minDaysBetweenReminders) {
      const remainingDays = (policy.minDaysBetweenReminders - diffDays).toFixed(1);
      violations.push(
        `Reminder cooldown active: Minimum ${policy.minDaysBetweenReminders} days required between reminders. Please wait ${remainingDays} more day(s) before sending another reminder.`
      );
    }
  }

  const allowed = violations.length === 0;

  await createAuditLog({
    invoiceId,
    action: 'REMINDER_POLICY_EVALUATED',
    actor: 'POLICY_ENGINE',
    details: {
      currentReminderCount: invoice.reminderCount,
      lastReminderAt: invoice.lastReminderAt,
      allowed,
      violations
    }
  });

  return {
    allowed,
    violations,
    warnings,
    policySnapshot: {
      maxAmountLimit: policy.maxAmountLimit,
      duplicateWindowHours: policy.duplicateWindowHours,
      maxRemindersPerInvoice: policy.maxRemindersPerInvoice,
      minDaysBetweenReminders: policy.minDaysBetweenReminders
    }
  };
}
