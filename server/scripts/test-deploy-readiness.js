require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');

const API = process.env.SMOKE_API_URL || 'http://localhost:5000';
const WORKER = process.env.AUTOMATION_WORKER_URL || 'http://localhost:5055';
const REPO_ROOT = path.resolve(__dirname, '../..');

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return data;
}

function assertRenderBlueprint() {
  const blueprintPath = path.join(REPO_ROOT, 'render.yaml');
  if (!fs.existsSync(blueprintPath)) {
    throw new Error('render.yaml missing at repo root');
  }
  const text = fs.readFileSync(blueprintPath, 'utf8');
  const required = ['signalmint-api', 'signalmint-worker', 'signalmint-db'];
  for (const name of required) {
    if (!text.includes(name)) throw new Error(`render.yaml missing service/database: ${name}`);
  }
  if (!text.includes('healthCheckPath')) {
    throw new Error('render.yaml should define healthCheckPath for API and worker');
  }
}

function assertDockerCompose() {
  const composePath = path.join(REPO_ROOT, 'docker-compose.yml');
  if (!fs.existsSync(composePath)) throw new Error('docker-compose.yml missing');
  const text = fs.readFileSync(composePath, 'utf8');
  if (!text.includes('postgres') || !text.includes('automation-worker')) {
    throw new Error('docker-compose.yml should include postgres and automation-worker');
  }
}

function assertWorkerDockerfile() {
  const dockerfile = path.join(REPO_ROOT, 'automation-worker', 'Dockerfile');
  if (!fs.existsSync(dockerfile)) throw new Error('automation-worker/Dockerfile missing');
  const text = fs.readFileSync(dockerfile, 'utf8');
  if (!text.includes('playwright')) throw new Error('Worker Dockerfile should install Playwright chromium');
}

async function run() {
  assertRenderBlueprint();
  assertDockerCompose();
  assertWorkerDockerfile();

  const health = await fetchJson(`${API}/api/health`);
  if (!health.ok) throw new Error('API health check failed');

  let workerOk = false;
  try {
    const workerHealth = await fetchJson(`${WORKER}/health`);
    workerOk = Boolean(workerHealth.ok ?? workerHealth.status === 'ok');
  } catch {
    workerOk = false;
  }

  if (!workerOk && process.env.DEPLOY_CHECK_REQUIRE_WORKER === 'true') {
    throw new Error(`Worker not reachable at ${WORKER} (set AUTOMATION_WORKER_URL or start docker compose)`);
  }

  console.log('Deploy readiness passed');
  console.log(`  API:     ${API} (v${health.version || 'unknown'})`);
  console.log(`  Worker:  ${workerOk ? WORKER : 'skipped (not running)'}`);
  console.log(`  Mode:    ${health.mode || health.sandboxMode === false ? 'live' : 'sandbox'}`);
}

run().catch((error) => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
