require('dotenv').config({ quiet: true });
const { spawnSync } = require('child_process');
const path = require('path');

const API = process.env.SMOKE_API_URL || 'http://localhost:5000';

const ALWAYS = [
  'test:state',
  'test:message-audit',
  'test:dialers:unit',
  'test:campaign-queue',
  'test:campaign-fanout',
  'test:live-readiness',
  'test:webhook-replay',
  'test:auth-otp',
];

const NEEDS_API = [
  'test:compliance',
  'test:deploy-readiness',
  'test:enterprise',
  'test:governance',
];

const OPTIONAL = [
  'test:campaign-bullmq',
];

async function apiUp() {
  try {
    const response = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(3000) });
    const data = await response.json();
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

function run(script) {
  console.log(`\n▶ npm run ${script}`);
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', script], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed (exit ${result.status})`);
  }
}

async function main() {
  console.log('=== SignalMint test:all ===\n');

  for (const script of ALWAYS) {
    run(script);
  }

  const online = await apiUp();
  if (online) {
    console.log(`\nAPI online at ${API} — running HTTP integration tests`);
    for (const script of NEEDS_API) {
      run(script);
    }
  } else {
    console.warn(`\nSKIP HTTP tests — API not reachable at ${API}`);
    console.warn('Start server: cd server && npm run dev');
  }

  if (process.env.REDIS_URL) {
    run('test:campaign-bullmq');
  } else {
    console.log('\nSKIP test:campaign-bullmq (REDIS_URL not set)');
  }

  console.log('\n=== test:all passed ===');
}

main().catch((error) => {
  console.error('\nFAILED:', error.message);
  process.exit(1);
});
