const {
  GOOGLE_VOICE_SELECTORS,
  ADVERTISER_SELECTORS,
  defaultSelectorsForAdapter,
} = require('./browser/selectorTemplates');

const GOOGLE_VOICE_SELECTORS_V2 = {
  ...GOOGLE_VOICE_SELECTORS,
  login_form: "input[type='email'], #identifierId, form[action*='signin']",
  login_indicator: "[data-inbox], nav[aria-label*='Google Voice'], a[href*='messages']",
  compose_button: "button[aria-label*='Send a message'], button[aria-label*='message'], button[gh*='cm']",
  thread_messages: "[data-message-id], .message-content, [data-message-text]",
};

const ADVERTISER_SELECTORS_V2 = {
  ...ADVERTISER_SELECTORS,
  login_form: "input[type='email'], #email, form.login",
  login_indicator: "[data-inbox], .dashboard, .conversation-list",
};

const VERSION_MAP = {
  google_voice: {
    v1: GOOGLE_VOICE_SELECTORS,
    v2: GOOGLE_VOICE_SELECTORS_V2,
  },
  advertiser: {
    v1: ADVERTISER_SELECTORS,
    v2: ADVERTISER_SELECTORS_V2,
  },
  generic_web_dialer: {
    v1: ADVERTISER_SELECTORS,
    v2: ADVERTISER_SELECTORS_V2,
  },
};

const LATEST_VERSION = {
  google_voice: 'v2',
  advertiser: 'v2',
  generic_web_dialer: 'v2',
};

function listSelectorVersions(adapterId) {
  const versions = VERSION_MAP[adapterId] || VERSION_MAP.advertiser;
  return Object.keys(versions);
}

function selectorsForVersion(adapterId, version = 'v1') {
  const versions = VERSION_MAP[adapterId] || VERSION_MAP.advertiser;
  return versions[version] || versions.v1 || defaultSelectorsForAdapter(adapterId);
}

function latestSelectorVersion(adapterId) {
  return LATEST_VERSION[adapterId] || 'v1';
}

function migrateSelectors(adapterId, fromVersion, toVersion) {
  const versions = VERSION_MAP[adapterId] || VERSION_MAP.advertiser;
  if (!versions[toVersion]) {
    const error = new Error(`Unknown selector version: ${toVersion}`);
    error.status = 400;
    throw error;
  }
  return {
    fromVersion: fromVersion || 'v1',
    toVersion,
    selectors: versions[toVersion],
  };
}

module.exports = {
  listSelectorVersions,
  selectorsForVersion,
  latestSelectorVersion,
  migrateSelectors,
  GOOGLE_VOICE_SELECTORS_V2,
};
