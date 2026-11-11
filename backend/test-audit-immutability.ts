import fs from 'fs';
import path from 'path';

const BACKEND_URL = 'http://localhost:4000/api';

async function testAuditLogImmutability() {
  console.log('🛡️ Testing AuditLog Immutability & Append-Only Guarantees...\n');
  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`   ✅ PASS: ${msg}`);
      testsPassed++;
    } else {
      console.error(`   ❌ FAIL: ${msg}`);
      testsFailed++;
    }
  }

  // 1. Static codebase audit: verify no update or delete operations on auditLog in runtime code
  const srcDir = path.resolve(process.cwd(), 'src');
  function scanFiles(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results = results.concat(scanFiles(fullPath));
      } else if (file.endsWith('.ts')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const allFiles = scanFiles(srcDir);
  const forbiddenPattern = /\bauditLog\.(update|updateMany|delete|deleteMany)\b/g;
  let forbiddenHits: string[] = [];

  for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (forbiddenPattern.test(content)) {
      forbiddenHits.push(filePath);
    }
  }

  assert(forbiddenHits.length === 0, `Zero mutation/deletion calls to prisma.auditLog in src/ (Found: ${forbiddenHits.length})`);

  // 2. HTTP Endpoint test: Verify no delete or update routes exist for /api/audit-logs
  // Obtain session cookie
  const loginRes = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@finpilot.dev', password: 'finpilot123' })
  });
  const cookieHeader = loginRes.headers.get('set-cookie');
  const authCookie = cookieHeader?.split(';')[0] || '';

  const methods = ['DELETE', 'PUT', 'PATCH'] as const;
  for (const method of methods) {
    // Unauthenticated attempt rejected with 401
    const unauthRes = await fetch(`${BACKEND_URL}/audit-logs/item-999`, { method });
    assert(unauthRes.status === 401, `${method} /api/audit-logs/:id unauthenticated returns HTTP 401 (Unauthorized)`);

    // Authenticated attempt rejected with 404 / 405 (Route does not exist)
    const authedItemRes = await fetch(`${BACKEND_URL}/audit-logs/item-999`, {
      method,
      headers: { Cookie: authCookie }
    });
    assert(authedItemRes.status === 404 || authedItemRes.status === 405, `${method} /api/audit-logs/:id authenticated rejected with HTTP ${authedItemRes.status} (Route does not exist)`);

    const authedColRes = await fetch(`${BACKEND_URL}/audit-logs`, {
      method,
      headers: { Cookie: authCookie }
    });
    assert(authedColRes.status === 404 || authedColRes.status === 405, `${method} /api/audit-logs authenticated rejected with HTTP ${authedColRes.status} (Route does not exist)`);
  }

  console.log(`\n🏁 Immutability Test Summary: ${testsPassed} Passed, ${testsFailed} Failed.\n`);
  if (testsFailed > 0) process.exit(1);
}

testAuditLogImmutability().catch((err) => {
  console.error(err);
  process.exit(1);
});
