import { InvoiceStatus } from '../types.js';

export class InvalidStateTransitionError extends Error {
  public fromStatus: InvoiceStatus;
  public toStatus: InvoiceStatus;

  constructor(fromStatus: InvoiceStatus, toStatus: InvoiceStatus, reason?: string) {
    super(reason || `Invalid invoice state transition from ${fromStatus} to ${toStatus}`);
    this.name = 'InvalidStateTransitionError';
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

// Strict mapping of allowed transitions
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  PROPOSED: ['APPROVED'],
  APPROVED: ['CREATED'],
  CREATED: ['SENT'],
  SENT: ['PAID', 'OVERDUE'],
  OVERDUE: ['PAID'],
  PAID: [] // Terminal state
};

export function canTransition(currentStatus: InvoiceStatus, targetStatus: InvoiceStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
}

export function validateTransition(currentStatus: InvoiceStatus, targetStatus: InvoiceStatus, contextMessage?: string): void {
  if (!canTransition(currentStatus, targetStatus)) {
    const allowed = (ALLOWED_TRANSITIONS[currentStatus] || []).join(', ') || 'None (Terminal state)';
    throw new InvalidStateTransitionError(
      currentStatus,
      targetStatus,
      `State transition denied: Cannot change status from '${currentStatus}' to '${targetStatus}'. Allowed next states: [${allowed}]. ${contextMessage || ''}`
    );
  }
}
