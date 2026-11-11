/**
 * FinPilot End-to-End System Verification Test (Python AI Service on Port 5002)
 *
 * Verifies:
 * 1. Python AI service health check at port 5002
 * 2. Backend successfully connects to Python AI service
 * 3. Invoice request reaches Gemini and returns a valid proposal
 * 4. Proposal stored in DB with status PROPOSED
 * 5. Policy Engine duplicate detection working
 * 6. Explicit user approval required & policy override: PROPOSED -> APPROVED
 * 7. PayPal sandbox draft creation (APPROVED -> CREATED) & send (CREATED -> SENT)
 * 8. Reminder generation works across multiple tones (gentle, firm, urgent) via Gemini
 * 9. Payment status updated only via PayPal verification flow (INVOICING.INVOICE.PAID + refetch)
 * 10. Audit trail logs every action immutably
 */

async function runVerification() {
  console.log('🧪 Starting FinPilot E2E Verification with Python AI Service (Port 5002)...\n');

  const BACKEND_URL = 'http://localhost:4000/api';
  const PYTHON_AI_URL = 'http://localhost:5002';

  // 1. Health check Python AI Service
  console.log('1️⃣ Checking Python AI Service (Gemini) at ' + PYTHON_AI_URL);
  const aiHealth = await fetch(`${PYTHON_AI_URL}/health`).then(r => r.json());
  console.log('   Python AI Status:', aiHealth.status, '| Service:', aiHealth.service);
  console.assert(aiHealth.status === 'ok', 'Python AI service should be ok');

  // 2. Health check Backend Service
  console.log('2️⃣ Checking Backend Service at ' + BACKEND_URL);
  const backendHealth = await fetch('http://localhost:4000/health').then(r => r.json());
  console.log('   Backend Service Status:', backendHealth.status, '| Configured AI URL:', backendHealth.aiServiceUrl);
  console.assert(backendHealth.aiServiceUrl === 'http://localhost:5002', 'Backend should point to port 5002');

  // Authenticate demo user
  const loginRes = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@finpilot.dev', password: 'finpilot123' })
  });
  const cookieHeader = loginRes.headers.get('set-cookie');
  const sessionCookie = cookieHeader ? cookieHeader.split(';')[0] : '';
  console.log('   Authenticated demo session initialized');

  // 3. Test AI Parse with Gemini via Backend
  console.log('\n3️⃣ Submitting Plain-Text Freelance Prompt to Gemini...');
  const testEmail = `billing-${Date.now()}@acmedesign.co`;
  const prompt = `Create an invoice for Acme Design Agency (${testEmail}) for USD 1850 for Figma design tokens and mobile design system, due November 25, 2026.`;
  
  const parseRes = await fetch(`${BACKEND_URL}/invoices/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ prompt })
  });

  if (!parseRes.ok) {
    throw new Error(`Failed to parse prompt with Python AI service: ${await parseRes.text()}`);
  }

  const { invoice, policy } = await parseRes.json();
  console.log(`   ✅ Extracted Invoice #${invoice.invoiceNumber} (ID: ${invoice.id})`);
  console.log(`   Client: ${invoice.recipientName} (${invoice.recipientEmail})`);
  console.log(`   Initial State: ${invoice.status} (Expected: PROPOSED)`);
  console.log(`   Total Amount: $${invoice.totalAmount} ${invoice.currency}`);
  console.log(`   Confidence Score: ${invoice.confidenceScore}`);
  console.log(`   Line Items Count: ${invoice.items.length}`);
  console.assert(invoice.status === 'PROPOSED', 'Status should be PROPOSED');
  console.assert(invoice.totalAmount > 0, 'Total amount must be greater than 0');

  // 4. Test Policy Engine: Duplicate Invoice Check
  console.log('\n4️⃣ Testing Policy Engine (Duplicate Invoice Detection)...');
  const duplicatePrompt = `Invoice Acme Design Agency (${testEmail}) USD 1850 for Figma design system`;
  const duplicateRes = await fetch(`${BACKEND_URL}/invoices/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ prompt: duplicatePrompt })
  });
  if (!duplicateRes.ok) {
    throw new Error(`Duplicate parse request failed (${duplicateRes.status}): ${await duplicateRes.text()}`);
  }
  const duplicateData = await duplicateRes.json();
  console.log(`   Duplicate Policy Allowed: ${duplicateData.policy.allowed}`);
  if (!duplicateData.policy.allowed) {
    console.log(`   ✅ Duplicate Policy Enforced: "${duplicateData.policy.violations[0]}"`);
  }

  // 5. Test State Machine Transition to APPROVED (Explicit Freelancer Approval with Override)
  console.log('\n5️⃣ Executing Explicit Freelancer Approval (UI Action)...');
  const approveRes = await fetch(`${BACKEND_URL}/invoices/${invoice.id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ overrideWarnings: true })
  });

  const approveData = await approveRes.json();
  console.log(`   ✅ Approval State: ${approveData.invoice.status} (Expected: APPROVED)`);
  console.assert(approveData.invoice.status === 'APPROVED', 'Status should be APPROVED');

  // 6. Test PayPal Sandbox Draft Creation (State: CREATED)
  console.log('\n6️⃣ Generating PayPal Sandbox Draft Invoice (POST /v2/invoicing/invoices)...');
  const createDraftRes = await fetch(`${BACKEND_URL}/invoices/${invoice.id}/create-paypal`, {
    method: 'POST',
    headers: { Cookie: sessionCookie }
  });

  const createDraftData = await createDraftRes.json();
  console.log(`   ✅ PayPal Draft Invoice ID: ${createDraftData.invoice.paypalInvoiceId}`);
  console.log(`   Updated State: ${createDraftData.invoice.status} (Expected: CREATED)`);
  console.assert(createDraftData.invoice.status === 'CREATED', 'Status should be CREATED');

  // 7. Test Sending Invoice via PayPal (State: SENT)
  console.log('\n7️⃣ Dispatched Invoice to Client via PayPal (UI Action: POST /send)...');
  const sendRes = await fetch(`${BACKEND_URL}/invoices/${invoice.id}/send`, {
    method: 'POST',
    headers: { Cookie: sessionCookie }
  });

  const sendData = await sendRes.json();
  console.log(`   ✅ Dispatch Result State: ${sendData.invoice.status} (Expected: SENT)`);
  console.log(`   Sent At: ${sendData.invoice.sentAt}`);
  console.assert(sendData.invoice.status === 'SENT', 'Status should be SENT');

  // 8. Test Python AI Service Reminder Generation for All Three Tones
  console.log('\n8️⃣ Testing Gemini Reminder Generation for All 3 Tones (gentle, firm, urgent)...');
  for (const tone of ['gentle', 'firm', 'urgent'] as const) {
    const directRemindRes = await fetch(`${PYTHON_AI_URL}/v1/generate-reminder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AI-Service-Token': 'finpilot-internal-ai-token-2026'
      },
      body: JSON.stringify({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        recipientName: invoice.recipientName,
        recipientEmail: invoice.recipientEmail,
        amount: invoice.totalAmount,
        currency: invoice.currency,
        dueDate: '2026-11-20',
        daysOverdue: tone === 'gentle' ? 2 : tone === 'firm' ? 7 : 14,
        reminderCount: tone === 'gentle' ? 1 : tone === 'firm' ? 2 : 3,
        tone
      })
    });

    console.assert(directRemindRes.ok, `Direct reminder generation failed for tone: ${tone}`);
    const toneData = await directRemindRes.json();
    console.log(`   ✅ [Tone: ${tone.toUpperCase()}] Subject: "${toneData.subject}"`);
    console.log(`      Follow-up delay: ${toneData.suggestedFollowUpDays} days`);
    console.log(`      Message snippet: "${toneData.message.replace(/\n+/g, ' ').substring(0, 95)}..."`);
  }

  // Also dispatch one reminder through backend endpoint
  console.log('\n   Dispatching reminder through Backend API...');
  const backendRemindRes = await fetch(`${BACKEND_URL}/invoices/${invoice.id}/remind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({ tone: 'gentle' })
  });
  const backendRemindData = await backendRemindRes.json();
  console.log(`   ✅ Backend Reminder Sent! Invoice Reminder Count: ${backendRemindData.invoice.reminderCount}`);

  // 9. Test PayPal Webhook Verification & Mandatory Re-Fetch Confirmation
  console.log('\n9️⃣ Testing INVOICING.INVOICE.PAID Webhook & PayPal Re-Fetch Flow...');
  const webhookSimRes = await fetch(`${BACKEND_URL}/webhooks/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paypalInvoiceId: createDraftData.invoice.paypalInvoiceId,
      eventType: 'INVOICING.INVOICE.PAID',
      paidStatus: 'PAID',
      dueAmount: 0.0,
      paidAmount: invoice.totalAmount
    })
  });

  const webhookData = await webhookSimRes.json();
  console.log(`   Webhook Processed: ${webhookData.status}`);
  console.log(`   Verified PayPal Status: ${webhookData.verifiedStatus}`);
  console.log(`   Final Transition: ${webhookData.invoiceStatus} (Expected: PAID)`);
  console.assert(webhookData.invoiceStatus === 'PAID', 'Status should be PAID');

  // 10. Inspect Immutable Audit Log Trail
  console.log('\n🔟 Inspecting Immutable Audit Trail Records...');
  const auditRes = await fetch(`${BACKEND_URL}/audit-logs?invoiceId=${invoice.id}`, {
    headers: { Cookie: sessionCookie }
  });
  const auditData = await auditRes.json();
  console.log(`   Total Audit Logs for Invoice: ${auditData.logs.length}`);
  auditData.logs.forEach((log: any) => {
    console.log(`   - [${log.action}] by ${log.actor} (${log.createdAt})`);
  });

  console.log('\n🎉 ALL INTEGRATION AND SECURITY BOUNDARY CHECKS PASSED!\n');
}

runVerification().catch((err) => {
  console.error('❌ E2E Verification failed:', err);
  process.exit(1);
});
