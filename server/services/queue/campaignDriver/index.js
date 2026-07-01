function resolveDriver() {
  const mode = (process.env.CAMPAIGN_QUEUE_DRIVER || 'auto').toLowerCase();
  if (mode === 'memory') return require('./memory');
  if (mode === 'bullmq') return require('./bullmq');
  if (process.env.REDIS_URL) return require('./bullmq');
  return require('./memory');
}

let driver = null;

function getDriver() {
  if (!driver) driver = resolveDriver();
  return driver;
}

module.exports = {
  enqueueCampaign: (...args) => getDriver().enqueueCampaign(...args),
  enqueueRecipients: (...args) => getDriver().enqueueRecipients(...args),
  isPending: (...args) => getDriver().isPending(...args),
  getQueueSnapshot: async (...args) => {
    const result = getDriver().getQueueSnapshot(...args);
    return result instanceof Promise ? result : result;
  },
  startCampaignQueue: (...args) => getDriver().startCampaignQueue(...args),
  flush: (...args) => getDriver().flush(...args),
  shutdown: (...args) => getDriver().shutdown(...args),
  getDriverName: () => {
    const d = getDriver();
    return d === require('./bullmq') ? 'bullmq' : 'memory';
  },
};
