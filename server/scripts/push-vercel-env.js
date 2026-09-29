#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

function parseEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function vercelEnvAdd(key, value) {
  const result = spawnSync(
    'cmd.exe',
    [
      '/d',
      '/s',
      '/c',
      'vercel',
      'env',
      'add',
      key,
      'production',
      '--value',
      value,
      '--yes',
      '--force',
      '--sensitive',
    ],
    { cwd: root, encoding: 'utf8' }
  );
  return result;
}

const env = parseEnv(path.join(root, '.env'));
const vercelEnv = parseEnv(path.join(root, '.env.vercel'));

const keys = {
  JWT_SECRET: env.JWT_SECRET,
  MASTER_ENCRYPTION_KEY: env.MASTER_ENCRYPTION_KEY || env.JWT_SECRET,
  DATABASE_URL: vercelEnv.DATABASE_URL || env.DATABASE_URL,
  DATABASE_SSL: 'true',
  SMS_SANDBOX_MODE: 'false',
  VONAGE_MOCK_MODE: 'false',
  AUTO_LIVE_ORGS: 'true',
  AUTO_SEED: 'true',
  SENT_API_KEY: env.SENT_API_KEY,
  SENT_DEFAULT_FROM: env.SENT_DEFAULT_FROM,
  SENT_TEMPLATE_ID: env.SENT_TEMPLATE_ID,
  SENT_AS_DEFAULT: 'true',
  AUTH_SMS_FROM: env.SENT_DEFAULT_FROM || env.AUTH_SMS_FROM,
  PUBLIC_BACKEND_URL:
    process.env.PUBLIC_BACKEND_URL_OVERRIDE ||
    'https://signalmint-api.vercel.app',
  OTP_LOG_TO_CONSOLE: 'true',
  REQUIRE_ADMIN_APPROVAL: env.REQUIRE_ADMIN_APPROVAL || 'true',
};

for (const [k, v] of Object.entries(keys)) {
  if (!v) {
    console.log('SKIP empty', k);
    continue;
  }
  const result = vercelEnvAdd(k, String(v));
  if (result.status === 0) {
    console.log('SET', k);
  } else {
    const err = `${result.stderr || ''}${result.stdout || ''}`.slice(0, 300);
    console.log('FAIL', k, err || `exit ${result.status}`);
  }
}
