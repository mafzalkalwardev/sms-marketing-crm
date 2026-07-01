require('dotenv').config({ override: true });
const { initDatabase } = require('../config/database');
const { startWorker, shutdown } = require('../services/queue/campaignDriver/bullmq');

async function main() {
  if (!process.env.REDIS_URL) {
    console.error('REDIS_URL is required for the standalone campaign worker');
    process.exit(1);
  }

  await initDatabase();
  startWorker();

  const stop = async () => {
    await shutdown();
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => {
  console.error('Campaign worker failed:', error.message);
  process.exit(1);
});
