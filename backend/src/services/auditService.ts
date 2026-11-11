import { prisma } from '../db.js';

export interface AuditLogParams {
  invoiceId?: string | null;
  action: string;
  actor?: 'FREELANCER' | 'SYSTEM' | 'PAYPAL_WEBHOOK' | 'POLICY_ENGINE';
  details?: Record<string, any> | string;
  ipAddress?: string;
}

export async function createAuditLog(params: AuditLogParams) {
  try {
    const detailsStr = typeof params.details === 'object'
      ? JSON.stringify(params.details)
      : params.details || null;

    const log = await prisma.auditLog.create({
      data: {
        invoiceId: params.invoiceId || null,
        action: params.action,
        actor: params.actor || 'SYSTEM',
        details: detailsStr,
        ipAddress: params.ipAddress || null,
      }
    });

    return log;
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}
