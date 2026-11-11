import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

async function importToNeon() {
  console.log('🔄 Starting Standalone Neon Data Importer...\n');

  const backupFile = path.resolve(__dirname, '..', 'backups', 'dev_db_snapshot.json');
  if (!fs.existsSync(backupFile)) {
    console.error(`❌ Backup file not found at ${backupFile}`);
    console.error('Run export-sqlite-backup.py first.');
    process.exit(1);
  }

  const rawData = fs.readFileSync(backupFile, 'utf8');
  const data = JSON.parse(rawData);

  const prisma = new PrismaClient();

  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Connected to target database');

    // 1. PolicyConfig
    if (data.PolicyConfig && data.PolicyConfig.length > 0) {
      console.log(`\n📋 Importing PolicyConfig (${data.PolicyConfig.length} records)...`);
      for (const row of data.PolicyConfig) {
        await prisma.policyConfig.upsert({
          where: { id: row.id },
          create: {
            id: row.id,
            maxAmountLimit: row.maxAmountLimit,
            duplicateWindowHours: row.duplicateWindowHours,
            maxRemindersPerInvoice: row.maxRemindersPerInvoice,
            minDaysBetweenReminders: row.minDaysBetweenReminders,
            updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date()
          },
          update: {
            maxAmountLimit: row.maxAmountLimit,
            duplicateWindowHours: row.duplicateWindowHours,
            maxRemindersPerInvoice: row.maxRemindersPerInvoice,
            minDaysBetweenReminders: row.minDaysBetweenReminders
          }
        });
      }
      console.log('   ✅ PolicyConfig imported');
    }

    // 2. User
    if (data.User && data.User.length > 0) {
      console.log(`\n👤 Importing Users (${data.User.length} records)...`);
      for (const row of data.User) {
        await prisma.user.upsert({
          where: { id: row.id },
          create: {
            id: row.id,
            email: row.email,
            passwordHash: row.passwordHash,
            createdAt: new Date(row.createdAt)
          },
          update: {
            email: row.email,
            passwordHash: row.passwordHash
          }
        });
      }
      console.log(`   ✅ ${data.User.length} Users imported`);
    }

    // 3. Invoice
    if (data.Invoice && data.Invoice.length > 0) {
      console.log(`\n📄 Importing Invoices (${data.Invoice.length} records)...`);
      for (const row of data.Invoice) {
        await prisma.invoice.upsert({
          where: { id: row.id },
          create: {
            id: row.id,
            userId: row.userId || null,
            invoiceNumber: row.invoiceNumber,
            recipientName: row.recipientName,
            recipientEmail: row.recipientEmail,
            currency: row.currency || 'USD',
            totalAmount: row.totalAmount,
            status: row.status,
            dueDate: new Date(row.dueDate),
            notes: row.notes,
            rawPrompt: row.rawPrompt,
            confidenceScore: row.confidenceScore,
            paypalInvoiceId: row.paypalInvoiceId,
            paypalStatus: row.paypalStatus,
            paypalPaymentUrl: row.paypalPaymentUrl,
            approvedAt: row.approvedAt ? new Date(row.approvedAt) : null,
            sentAt: row.sentAt ? new Date(row.sentAt) : null,
            paidAt: row.paidAt ? new Date(row.paidAt) : null,
            lastReminderAt: row.lastReminderAt ? new Date(row.lastReminderAt) : null,
            reminderCount: row.reminderCount || 0,
            createdAt: new Date(row.createdAt),
            updatedAt: new Date(row.updatedAt)
          },
          update: {
            status: row.status,
            paypalInvoiceId: row.paypalInvoiceId,
            paypalStatus: row.paypalStatus,
            paypalPaymentUrl: row.paypalPaymentUrl,
            paidAt: row.paidAt ? new Date(row.paidAt) : null,
            updatedAt: new Date(row.updatedAt)
          }
        });
      }
      console.log(`   ✅ ${data.Invoice.length} Invoices imported`);
    }

    // 4. InvoiceItem
    if (data.InvoiceItem && data.InvoiceItem.length > 0) {
      console.log(`\n📦 Importing InvoiceItems (${data.InvoiceItem.length} records)...`);
      for (const row of data.InvoiceItem) {
        await prisma.invoiceItem.upsert({
          where: { id: row.id },
          create: {
            id: row.id,
            invoiceId: row.invoiceId,
            name: row.name,
            description: row.description,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            total: row.total,
            createdAt: new Date(row.createdAt)
          },
          update: {
            name: row.name,
            description: row.description,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            total: row.total
          }
        });
      }
      console.log(`   ✅ ${data.InvoiceItem.length} InvoiceItems imported`);
    }

    // 5. AuditLog
    if (data.AuditLog && data.AuditLog.length > 0) {
      console.log(`\n🛡️ Importing AuditLogs (${data.AuditLog.length} records)...`);
      for (const row of data.AuditLog) {
        await prisma.auditLog.upsert({
          where: { id: row.id },
          create: {
            id: row.id,
            invoiceId: row.invoiceId || null,
            action: row.action,
            actor: row.actor,
            details: row.details,
            ipAddress: row.ipAddress,
            createdAt: new Date(row.createdAt)
          },
          update: {
            action: row.action,
            actor: row.actor,
            details: row.details
          }
        });
      }
      console.log(`   ✅ ${data.AuditLog.length} AuditLogs imported`);
    }

    // Verification
    console.log('\n🔍 Verifying target database counts against snapshot...');
    const userCount = await prisma.user.count();
    const invoiceCount = await prisma.invoice.count();
    const itemCount = await prisma.invoiceItem.count();
    const auditCount = await prisma.auditLog.count();
    const policyCount = await prisma.policyConfig.count();

    console.log(`   Users:       Snapshot=${data.User?.length || 0} | Target=${userCount}`);
    console.log(`   Invoices:    Snapshot=${data.Invoice?.length || 0} | Target=${invoiceCount}`);
    console.log(`   Items:       Snapshot=${data.InvoiceItem?.length || 0} | Target=${itemCount}`);
    console.log(`   AuditLogs:   Snapshot=${data.AuditLog?.length || 0} | Target=${auditCount}`);
    console.log(`   Policy:      Snapshot=${data.PolicyConfig?.length || 0} | Target=${policyCount}`);

    const allMatch =
      userCount === (data.User?.length || 0) &&
      invoiceCount === (data.Invoice?.length || 0) &&
      itemCount === (data.InvoiceItem?.length || 0) &&
      auditCount === (data.AuditLog?.length || 0);

    if (allMatch) {
      console.log('\n🎉 SUCCESS: All record counts match 100%. Data import complete!');
    } else {
      console.warn('\n⚠️ Note: Some target counts differ from snapshot (possibly target had existing data).');
    }

  } catch (err) {
    console.error('\n❌ Fatal error during import:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

importToNeon().catch((err) => {
  console.error(err);
  process.exit(1);
});
