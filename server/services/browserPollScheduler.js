const { queryAll } = require('../config/database');
const browserLane = require('./providers/browserLaneDispatcher');

let timer = null;

async function pollAllProfiles() {
  if (!process.env.AUTOMATION_WORKER_URL) return;
  const profiles = await queryAll(
    "SELECT id FROM browser_profiles WHERE is_enabled = TRUE AND session_status != 'logged_out'"
  );
  const inboundProcessor = require('./inboundProcessor');

  for (const profile of profiles) {
    try {
      const poll = await browserLane.pollInbound(profile.id);
      if (poll.needsRelogin) {
        console.warn(`Browser profile #${profile.id} needs re-login (${poll.sessionStatus})`);
      }
      for (const event of poll.inbound || []) {
        await inboundProcessor.processInboundWebhook(poll.adapterId || 'browser', {
          from: event.from,
          to: event.to,
          text: event.text,
          messageId: event.providerMessageId || event.id,
        }, { verified: true });
      }
    } catch (error) {
      console.error(`Browser poll failed for profile ${profile.id}:`, error.message);
    }
  }
}

function startBrowserPollScheduler() {
  if (process.env.BROWSER_POLL_ENABLED === 'false') return;
  const intervalMs = Number(process.env.BROWSER_POLL_INTERVAL_MS || 60000);
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    pollAllProfiles().catch((err) => console.error('Browser poll scheduler error:', err.message));
  }, intervalMs);
  console.log(`Browser inbound poll scheduler started (${intervalMs}ms)`);
}

function stopBrowserPollScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startBrowserPollScheduler, stopBrowserPollScheduler, pollAllProfiles };
