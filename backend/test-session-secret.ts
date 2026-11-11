import { spawn } from 'child_process';
import path from 'path';

async function testSessionSecretValidation() {
  console.log('🔒 Testing production SESSION_SECRET enforcement...');

  return new Promise<void>((resolve, reject) => {
    // Spawn with NODE_ENV=production and NO SESSION_SECRET
    const child = spawn(process.execPath, [path.resolve(process.cwd(), 'dist/index.js')], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        SESSION_SECRET: '' // empty/missing
      }
    });

    let output = '';
    child.stderr.on('data', (d) => { output += d.toString(); });
    child.stdout.on('data', (d) => { output += d.toString(); });

    child.on('exit', (code) => {
      if (code === 1 && output.includes('SESSION_SECRET must be explicitly provided')) {
        console.log('   ✅ PASS: Backend refused to start with code 1 when SESSION_SECRET missing in production');
        resolve();
      } else {
        console.error(`   ❌ FAIL: Expected exit code 1 with error message. Got code ${code}. Output: ${output}`);
        reject(new Error(`Failed with code ${code}`));
      }
    });
  });
}

testSessionSecretValidation().catch((err) => {
  console.error(err);
  process.exit(1);
});
