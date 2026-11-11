export interface GenerateReminderRequest {
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
}

export interface GenerateReminderResponse {
  subject: string;
  message: string;
  tone: 'gentle' | 'firm' | 'urgent';
  suggestedFollowUpDays: number;
  reminderCount: number;
  generatedAt: string;
}

export function generateReminderText(req: GenerateReminderRequest): GenerateReminderResponse {
  const invNumber = req.invoiceNumber || req.invoiceId;
  const currency = req.currency || 'USD';
  const formattedAmount = `${new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(req.amount)}`;
  const daysOverdue = Math.max(0, req.daysOverdue);
  const count = req.reminderCount || 1;

  // Determine tone automatically if not specified
  let tone = req.tone;
  if (!tone) {
    if (daysOverdue <= 3 || count <= 1) {
      tone = 'gentle';
    } else if (daysOverdue <= 14 || count === 2) {
      tone = 'firm';
    } else {
      tone = 'urgent';
    }
  }

  let subject = '';
  let message = '';
  let suggestedFollowUpDays = 3;

  if (tone === 'gentle') {
    subject = `Friendly reminder: Invoice ${invNumber} (${formattedAmount})`;
    message = `Hi ${req.recipientName},\n\nI hope this email finds you well.\n\nThis is a quick, courteous reminder that invoice ${invNumber} for ${formattedAmount} was due on ${req.dueDate}${daysOverdue > 0 ? ` (${daysOverdue} day${daysOverdue === 1 ? '' : 's'} ago)` : ''}.\n\nIf you have already processed this payment, please disregard this note. If you need another copy of the invoice or have any questions regarding payment, feel free to reply directly to this message.\n\nThank you for your business!\n\nBest regards,\nFinPilot Billing`;
    suggestedFollowUpDays = 4;
  } else if (tone === 'firm') {
    subject = `Payment Reminder: Invoice ${invNumber} is ${daysOverdue} days overdue (${formattedAmount})`;
    message = `Dear ${req.recipientName},\n\nWe are following up regarding overdue invoice ${invNumber} for ${formattedAmount}, which had a due date of ${req.dueDate}.\n\nAccording to our records, we have not yet received payment. Please review and arrange for settlement at your earliest convenience via the PayPal payment link provided in your invoice email.\n\nIf there is an issue or billing discrepancy, please contact us immediately so we can assist.\n\nSincerely,\nFinPilot Billing`;
    suggestedFollowUpDays = 3;
  } else {
    // Urgent / Final Notice
    subject = `FINAL NOTICE: Immediate payment required for Invoice ${invNumber} (${formattedAmount})`;
    message = `URGENT NOTICE TO: ${req.recipientName}\n\nInvoice ${invNumber} in the amount of ${formattedAmount} is now ${daysOverdue} days past due (Due Date: ${req.dueDate}). This is reminder #${count}.\n\nPlease remit the outstanding balance immediately via PayPal to avoid account escalation or interruption of ongoing project services.\n\nIf you have already initiated this wire or PayPal transaction today, please supply the confirmation receipt for reconciliation.\n\nRegards,\nFinPilot Accounts Receivable`;
    suggestedFollowUpDays = 2;
  }

  return {
    subject,
    message,
    tone,
    suggestedFollowUpDays,
    reminderCount: count,
    generatedAt: new Date().toISOString()
  };
}
