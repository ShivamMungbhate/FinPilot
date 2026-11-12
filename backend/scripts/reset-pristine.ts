import { PrismaClient } from '@prisma/client';
import { seed } from '../prisma/seed.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Clearing test clutter from Neon database...');

  // Delete in foreign-key order
  const deletedItems = await prisma.invoiceItem.deleteMany({});
  console.log(`- Deleted ${deletedItems.count} invoice items`);

  const deletedAudit = await prisma.auditLog.deleteMany({});
  console.log(`- Deleted ${deletedAudit.count} audit logs`);

  const deletedInvoices = await prisma.invoice.deleteMany({});
  console.log(`- Deleted ${deletedInvoices.count} invoices`);

  console.log('\n🌱 Reseeding clean 5-stage sample invoices & demo user...');
  await seed();

  const userCount = await prisma.user.count();
  const invoiceCount = await prisma.invoice.count();
  const itemCount = await prisma.invoiceItem.count();
  const auditCount = await prisma.auditLog.count();

  console.log('\n✅ Database reset to pristine state complete:');
  console.log(`   Users:        ${userCount} (demo@finpilot.dev active)`);
  console.log(`   Invoices:     ${invoiceCount} (INV-2026-0101 to INV-2026-0105)`);
  console.log(`   Items:        ${itemCount}`);
  console.log(`   Audit Logs:   ${auditCount}`);

  const sampleInvoices = await prisma.invoice.findMany({
    select: {
      invoiceNumber: true,
      recipientName: true,
      totalAmount: true,
      status: true
    },
    orderBy: { invoiceNumber: 'asc' }
  });

  console.log('\n📋 Pristine Invoices:');
  for (const inv of sampleInvoices) {
    console.log(`   [${inv.status.padEnd(8)}] ${inv.invoiceNumber} - ${inv.recipientName} ($${inv.totalAmount.toFixed(2)})`);
  }
}

main()
  .catch((err) => {
    console.error('❌ Reset failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
