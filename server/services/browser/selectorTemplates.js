const GOOGLE_VOICE_SELECTORS = {
  compose_button: "button[aria-label*='message'], button[aria-label*='Message']",
  to_input: "input[placeholder*='name'], input[placeholder*='phone'], input[aria-label*='To']",
  message_input: "textarea[aria-label*='message'], textarea[placeholder*='message']",
  send_button: "button[aria-label*='Send'], button[data-send]",
  conversation_list: "[data-conversation-list], .conversation-list",
  thread_messages: ".message-content, [data-message-text]",
  login_indicator: "a[href*='voice.google.com'], [data-inbox]",
};

const ADVERTISER_SELECTORS = {
  login_email: '#email, input[name=email], input[type=email]',
  login_password: '#password, input[name=password], input[type=password]',
  login_submit: "button[type=submit], button.login",
  compose_button: "[data-action=compose], button.compose, a[href*='compose']",
  to_input: "input[name=phone], input[placeholder*='phone'], input[aria-label*='To']",
  message_input: 'textarea.message, textarea[name=message], textarea[placeholder*="message"]',
  send_button: 'button.send, button[type=submit][data-send], button[aria-label*="Send"]',
  conversation_list: '.conversation-list, [data-inbox]',
  thread_messages: '.message-body, [data-message]',
};

const DEFAULT_SELECTORS = {
  google_voice: GOOGLE_VOICE_SELECTORS,
  advertiser: ADVERTISER_SELECTORS,
};

const DEFAULT_BASE_URLS = {
  google_voice: 'https://voice.google.com',
  advertiser: '',
};

function defaultSelectorsForAdapter(adapterId) {
  return DEFAULT_SELECTORS[adapterId] || ADVERTISER_SELECTORS;
}

function defaultBaseUrlForAdapter(adapterId, override = '') {
  return override || DEFAULT_BASE_URLS[adapterId] || '';
}

module.exports = {
  GOOGLE_VOICE_SELECTORS,
  ADVERTISER_SELECTORS,
  DEFAULT_SELECTORS,
  defaultSelectorsForAdapter,
  defaultBaseUrlForAdapter,
};
