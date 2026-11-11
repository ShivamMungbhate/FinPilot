import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function seed() {
  console.log('🌱 Checking / bootstrapping FinPilot database idempotently...');

  // 1. Ensure Policy Config
  await prisma.policyConfig.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      maxAmountLimit: 10000.0,
      duplicateWindowHours: 24,
      maxRemindersPerInvoice: 3,
      minDaysBetweenReminders: 3
    }
  });

  // 2. Create or Update Demo User (Idempotent)
  const demoEmail = (process.env.DEMO_USER_EMAIL || 'demo@finpilot.dev').toLowerCase().trim();
  const demoPassword = process.env.DEMO_USER_PASSWORD || 'finpilot123';
  const passwordHash = await bcrypt.hash(demoPassword, 10);

  const demoUser = await prisma.user.upsert({
    where: { email: demoEmail },
    update: { passwordHash },
    create: {
      email: demoEmail,
      passwordHash
    }
  });

  console.log(`👤 Demo user verified: ${demoUser.email}`);

  // 3. Helper to create sample invoices idempotently (only if they do not already exist)
  async function ensureSampleInvoice(data: {
    invoiceNumber: string;
    recipientName: string;
    recipientEmail: string;
    currency: string;
    totalAmount: number;
    status: string;
    dueDate: Date;
    notes?: string;
    rawPrompt?: string;
    confidenceScore?: number;
    paypalInvoiceId?: string;
    paypalStatus?: string;
    paypalPaymentUrl?: string;
    approvedAt?: Date;
    sentAt?: Date;
    paidAt?: Date;
    reminderCount?: number;
    lastReminderAt?: Date;
    items: Array<{
      name: string;
      description?: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    initialAuditAction: string;
    initialAuditActor: string;
    initialAuditDetails: any;
  }) {
    const existing = await prisma.invoice.findUnique({
      where: { invoiceNumber: data.invoiceNumber }
    });

    if (existing) {
      return existing;
    }

    const created = await prisma.invoice.create({
      data: {
        userId: demoUser.id,
        invoiceNumber: data.invoiceNumber,
        recipientName: data.recipientName,
        recipientEmail: data.recipientEmail,
        currency: data.currency,
        totalAmount: data.totalAmount,
        status: data.status,
        dueDate: data.dueDate,
        notes: data.notes,
        rawPrompt: data.rawPrompt,
        confidenceScore: data.confidenceScore,
        paypalInvoiceId: data.paypalInvoiceId,
        paypalStatus: data.paypalStatus,
        paypalPaymentUrl: data.paypalPaymentUrl,
        approvedAt: data.approvedAt,
        sentAt: data.sentAt,
        paidAt: data.paidAt,
        reminderCount: data.reminderCount ?? 0,
        lastReminderAt: data.lastReminderAt,
        items: {
          create: data.items
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        invoiceId: created.id,
        action: data.initialAuditAction,
        actor: data.initialAuditActor,
        details: JSON.stringify(data.initialAuditDetails)
      }
    });

    return created;
  }

  // Sample 1: PROPOSED (fresh AI extraction awaiting freelancer review)
  await ensureSampleInvoice({
    invoiceNumber: 'INV-2026-0101',
    recipientName: 'Acme Design Agency',
    recipientEmail: 'accounts@acmedesign.co',
    currency: 'USD',
    totalAmount: 1850.0,
    status: 'PROPOSED',
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    notes: 'Payment due in 14 days. Thank you for your partnership on the Figma brand system!',
    rawPrompt: 'Bill Acme Design Agency accounts@acmedesign.co $1850 for Figma Design System components and tokens, due in 14 days',
    confidenceScore: 0.94,
    items: [
      {
        name: 'Figma Design System Components',
        description: 'Created 45 modular UI components with responsive auto-layout',
        quantity: 1,
        unitPrice: 1250.0,
        total: 1250.0
      },
      {
        name: 'Design Token Architecture',
        description: 'Semantic color tokens and typography scale documentation',
        quantity: 1,
        unitPrice: 600.0,
        total: 600.0
      }
    ],
    initialAuditAction: 'INVOICE_PROPOSED',
    initialAuditActor: 'FREELANCER',
    initialAuditDetails: {
      prompt: 'Bill Acme Design Agency accounts@acmedesign.co $1850 for Figma Design System components and tokens, due in 14 days',
      confidence: 0.94,
      initialAmount: 1850.0
    }
  });

  // Sample 2: APPROVED (Freelancer reviewed, ready to push to PayPal)
  await ensureSampleInvoice({
    invoiceNumber: 'INV-2026-0102',
    recipientName: 'TechNova Solutions',
    recipientEmail: 'billing@technova.io',
    currency: 'USD',
    totalAmount: 3200.0,
    status: 'APPROVED',
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    approvedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    notes: 'Milestone 2 completion - API backend microservices.',
    rawPrompt: 'Invoice TechNova Solutions billing@technova.io $3200 for Backend Node API microservices milestone 2, due next week',
    confidenceScore: 0.98,
    items: [
      {
        name: 'Fastify Microservice Architecture',
        description: 'Implemented high-throughput event streaming API endpoints',
        quantity: 32,
        unitPrice: 100.0,
        total: 3200.0
      }
    ],
    initialAuditAction: 'INVOICE_APPROVED',
    initialAuditActor: 'FREELANCER',
    initialAuditDetails: { comment: 'Approved milestone deliverables' }
  });

  // Sample 3: SENT (dispatched via PayPal, pending payment)
  await ensureSampleInvoice({
    invoiceNumber: 'INV-2026-0103',
    recipientName: 'Zenith Labs',
    recipientEmail: 'finance@zenithlabs.dev',
    currency: 'USD',
    totalAmount: 1400.0,
    status: 'SENT',
    paypalInvoiceId: 'INV2-SIM-ZENITH-4921',
    paypalStatus: 'SENT',
    paypalPaymentUrl: 'https://www.sandbox.paypal.com/invoice/payer-view/details/INV2-SIM-ZENITH-4921',
    dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    approvedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    sentAt: new Date(Date.now() - 47 * 60 * 60 * 1000),
    notes: 'Frontend Next.js dashboard integration.',
    rawPrompt: 'Send $1400 invoice to Zenith Labs finance@zenithlabs.dev for Next.js dashboard integration due in 7 days',
    confidenceScore: 0.96,
    items: [
      {
        name: 'Next.js 14 App Router UI',
        description: 'Custom analytics dashboard with chart visualizers',
        quantity: 1,
        unitPrice: 1400.0,
        total: 1400.0
      }
    ],
    initialAuditAction: 'INVOICE_SENT',
    initialAuditActor: 'FREELANCER',
    initialAuditDetails: { paypalInvoiceId: 'INV2-SIM-ZENITH-4921' }
  });

  // Sample 4: OVERDUE (due date passed, reminder sent)
  await ensureSampleInvoice({
    invoiceNumber: 'INV-2026-0104',
    recipientName: 'Vanguard Media Group',
    recipientEmail: 'invoices@vanguardmedia.net',
    currency: 'USD',
    totalAmount: 950.0,
    status: 'OVERDUE',
    paypalInvoiceId: 'INV2-SIM-VANGUARD-8812',
    paypalStatus: 'SENT',
    paypalPaymentUrl: 'https://www.sandbox.paypal.com/invoice/payer-view/details/INV2-SIM-VANGUARD-8812',
    dueDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    approvedAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000),
    sentAt: new Date(Date.now() - 17 * 24 * 60 * 60 * 1000),
    reminderCount: 1,
    lastReminderAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    notes: 'Social media automation script implementation.',
    rawPrompt: 'Invoice Vanguard Media Group invoices@vanguardmedia.net $950 for social media scripts',
    confidenceScore: 0.91,
    items: [
      {
        name: 'Python Social Media Automation Pipeline',
        description: 'Scheduled multi-platform publishing scripts',
        quantity: 1,
        unitPrice: 950.0,
        total: 950.0
      }
    ],
    initialAuditAction: 'REMINDER_SENT',
    initialAuditActor: 'FREELANCER',
    initialAuditDetails: { reminderNumber: 1, tone: 'gentle' }
  });

  // Sample 5: PAID (verified via PayPal webhook & refetch)
  await ensureSampleInvoice({
    invoiceNumber: 'INV-2026-0105',
    recipientName: 'Hyperion Capital',
    recipientEmail: 'payables@hyperioncap.com',
    currency: 'USD',
    totalAmount: 4500.0,
    status: 'PAID',
    paypalInvoiceId: 'INV2-SIM-HYPERION-3390',
    paypalStatus: 'PAID',
    paypalPaymentUrl: 'https://www.sandbox.paypal.com/invoice/payer-view/details/INV2-SIM-HYPERION-3390',
    dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    approvedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    sentAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
    paidAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    notes: 'Financial forecasting web application consulting.',
    rawPrompt: 'Bill Hyperion Capital payables@hyperioncap.com $4500 for financial modeling web app',
    confidenceScore: 0.97,
    items: [
      {
        name: 'Full-stack Portfolio Simulator & Risk Model',
        description: 'Monte Carlo simulation engine and interactive dashboard',
        quantity: 1,
        unitPrice: 4500.0,
        total: 4500.0
      }
    ],
    initialAuditAction: 'INVOICE_PAID',
    initialAuditActor: 'PAYPAL_WEBHOOK',
    initialAuditDetails: {
      verifiedStatus: 'PAID',
      dueAmount: 0.0,
      paidAmount: 4500.0,
      message: 'Re-fetched from PayPal and verified full settlement.'
    }
  });

  console.log('✅ Idempotent database bootstrap completed successfully!');
}

// Execute directly if run as a standalone script
if (process.argv[1]?.includes('seed')) {
  seed()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
