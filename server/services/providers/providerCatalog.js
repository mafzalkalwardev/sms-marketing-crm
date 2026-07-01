const PROVIDER_CATALOG = [
  { id: 'vonage', label: 'Vonage', lane: 'api', integration: 'rest_webhook', status: 'ready', fields: ['api_key', 'api_secret'] },
  { id: 'twilio', label: 'Twilio', lane: 'api', integration: 'rest_webhook', status: 'ready', fields: ['account_sid', 'api_secret'] },
  { id: 'telnyx', label: 'Telnyx', lane: 'api', integration: 'rest_webhook', status: 'ready', fields: ['api_key'] },
  { id: 'bandwidth', label: 'Bandwidth', lane: 'api', integration: 'rest_webhook', status: 'ready', fields: ['api_key', 'api_secret', 'account_id', 'application_id'] },
  { id: 'zoom', label: 'Zoom Phone', lane: 'api', integration: 'rest_webhook', status: 'ready', fields: ['api_key', 'api_secret', 'account_id'] },
  { id: 'ringox', label: 'RingoX', lane: 'api', integration: 'rest_webhook', status: 'ready', fields: ['api_key', 'base_url'] },
  { id: '3cx', label: '3CX', lane: 'api', integration: 'rest_webhook', status: 'ready', fields: ['api_key', 'base_url'] },
  { id: 'google_voice', label: 'Google Voice', lane: 'browser', integration: 'dom_bom', status: 'ready', fields: ['profile_path', 'base_url'] },
  { id: 'advertiser', label: 'Advertiser Web Dialer', lane: 'browser', integration: 'dom_bom', status: 'ready', fields: ['profile_path', 'base_url'] },
];

function getCatalogEntry(providerId) {
  return PROVIDER_CATALOG.find((entry) => entry.id === providerId) || null;
}

function listCatalog() {
  return PROVIDER_CATALOG;
}

module.exports = { PROVIDER_CATALOG, getCatalogEntry, listCatalog };
