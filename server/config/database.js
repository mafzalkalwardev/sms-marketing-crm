const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL
  || 'postgresql://signalmint:signalmint@localhost:5432/signalmint';

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function queryOne(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

async function queryAll(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = {
      query: (text, params) => client.query(text, params),
      queryOne: async (text, params) => {
        const r = await client.query(text, params);
        return r.rows[0] || null;
      },
    };
    const value = await fn(tx);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runMigrations() {
  const dir = path.join(__dirname, '..', 'migrations');
  if (!fs.existsSync(dir)) return;

  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const applied = await queryOne('SELECT id FROM schema_migrations WHERE id = $1', [file]);
    if (applied) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await query(sql);
    await query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
    console.log(`Migration applied: ${file}`);
  }
}

async function initDatabase() {
  await runMigrations();
}

module.exports = {
  pool,
  query,
  queryOne,
  queryAll,
  withTransaction,
  initDatabase,
};
