import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

let BACKEND_URL = 'http://127.0.0.1:4000/api';
let spawnedChild: ChildProcess | null = null;

async function ensureBackend(): Promise<string> {
  try {
    const res = await fetch('http://127.0.0.1:4000/health', { signal: AbortSignal.timeout(1000) });
    if (res.ok) return 'http://127.0.0.1:4000/api';
  } catch {}

  console.log('   ℹ️ Starting in-process backend instance for HTTP verification...');
  spawnedChild = spawn(process.execPath, [path.resolve(process.cwd(), 'dist/index.js')], {
    env: {
      ...process.env,
      PORT: '4000',
      HOST: '0.0.0.0',
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-key-at-least-32-chars-long!'
    }
  });

  spawnedChild.stdout?.on('data', () => {});
  spawnedChild.stderr?.on('data', () => {});

  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      const res = await fetch('http://127.0.0.1:4000/health', { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        console.log('   ℹ️ Backend test instance ready.');
        return 'http://127.0.0.1:4000/api';
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error('Failed to connect to backend test instance on port 4000');
}

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

  try {
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
    const backendApiUrl = await ensureBackend();

    // Obtain session cookie
    const loginRes = await fetch(`${backendApiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@finpilot.dev', password: 'finpilot123' })
    });
    const cookieHeader = loginRes.headers.get('set-cookie');
    const authCookie = cookieHeader?.split(';')[0] || '';

    const methods = ['DELETE', 'PUT', 'PATCH'] as const;
    for (const method of methods) {
      // Unauthenticated attempt rejected with 401
      const unauthRes = await fetch(`${backendApiUrl}/audit-logs/item-999`, { method });
      assert(unauthRes.status === 401, `${method} /api/audit-logs/:id unauthenticated returns HTTP 401 (Unauthorized)`);

      // Authenticated attempt rejected with 404 / 405 (Route does not exist)
      const authedItemRes = await fetch(`${backendApiUrl}/audit-logs/item-999`, {
        method,
        headers: { Cookie: authCookie }
      });
      assert(authedItemRes.status === 404 || authedItemRes.status === 405, `${method} /api/audit-logs/:id authenticated rejected with HTTP ${authedItemRes.status} (Route does not exist)`);

      const authedColRes = await fetch(`${backendApiUrl}/audit-logs`, {
        method,
        headers: { Cookie: authCookie }
      });
      assert(authedColRes.status === 404 || authedColRes.status === 405, `${method} /api/audit-logs authenticated rejected with HTTP ${authedColRes.status} (Route does not exist)`);
    }

    console.log(`\n🏁 Immutability Test Summary: ${testsPassed} Passed, ${testsFailed} Failed.\n`);
    if (testsFailed > 0) process.exit(1);
  } finally {
    if (spawnedChild) {
      spawnedChild.kill();
    }
  }
}

testAuditLogImmutability().catch((err) => {
  if (spawnedChild) {
    (spawnedChild as ChildProcess).kill();
  }
  console.error(err);
  process.exit(1);
});
