const fs = require('fs');
const path = require('path');
const config = require('../config');

function createProvider() {
  const kind = config.llmProvider;
  if (kind === 'openai') return require('./openai');
  if (kind === 'anthropic') return require('./anthropic');
  return require('./mock');
}

let provider;

function getProvider() {
  if (!provider) provider = createProvider();
  return provider;
}

async function complete(messages, options = {}) {
  return getProvider().complete(messages, options);
}

function loadIdentity() {
  try {
    return fs.readFileSync(config.identityPath, 'utf8');
  } catch {
    return 'You are TONY, a helpful autonomous AI agent.';
  }
}

module.exports = { complete, getProvider, loadIdentity };
