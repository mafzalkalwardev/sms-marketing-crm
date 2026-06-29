const PROVIDER_CATALOG = [
  { id: 'vonage', label: 'Vonage', lane: 'api', status: 'ready', fields: ['api_key', 'api_secret'] },
  { id: 'twilio', label: 'Twilio', lane: 'api', status: 'ready', fields: ['account_sid', 'api_secret'] },
  { id: 'telnyx', label: 'Telnyx', lane: 'api', status: 'ready', fields: ['api_key'] },
  { id: 'bandwidth', label: 'Bandwidth', lane: 'api', status: 'ready', fields: ['api_key', 'api_secret'] },
  { id: 'zoom', label: 'Zoom Phone', lane: 'api', status: 'ready', fields: ['api_key', 'api_secret'] },
  { id: 'ringox', label: 'RingoX', lane: 'api', status: 'ready', fields: ['api_key', 'api_secret'] },
  { id: '3cx', label: '3CX', lane: 'api', status: 'ready', fields: ['api_key', 'api_secret', 'extra_config'] },
  { id: 'google_voice', label: 'Google Voice', lane: 'browser', status: 'ready', fields: ['profile_path', 'base_url'] },
  { id: 'advertiser', label: 'Advertiser Web Dialer', lane: 'browser', status: 'ready', fields: ['profile_path', 'base_url'] },
];

function getCatalogEntry(providerId) {
  return PROVIDER_CATALOG.find((entry) => entry.id === providerId) || null;
}

function listCatalog() {
  return PROVIDER_CATALOG;
}

module.exports = { PROVIDER_CATALOG, getCatalogEntry, listCatalog };
