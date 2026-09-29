/**
 * eSIM unit checks that do not require PostgreSQL.
 */
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const { looksLikeLpa, normalizeLpa, hashToken } = require('../services/esimService');
const esimProvider = require('../services/providers/esimProvider');
const { shouldUseMockSend } = require('../services/providers/sandbox');
const { getCatalogEntry } = require('../services/providers/providerCatalog');
const { getAdapter } = require('../services/providers/providerRegistry');

console.log('=== eSIM unit test (no DB) ===\n');

assert(normalizeLpa('1$smdp.example.com$CODE') === 'LPA:1$smdp.example.com$CODE', 'normalizeLpa prefix');
assert(looksLikeLpa('LPA:1$smdp.example.com$CODE'), 'looksLikeLpa true');
assert(!looksLikeLpa('not-an-lpa'), 'looksLikeLpa false');
assert(hashToken('abc') === hashToken('abc'), 'hashToken stable');
assert(hashToken('abc') !== hashToken('abcd'), 'hashToken distinct');

const catalog = getCatalogEntry('esim');
assert(catalog?.lane === 'esim', 'catalog lane');
assert(getAdapter('esim')?.id === 'esim', 'registry adapter');

const inbound = esimProvider.normalizeInbound({ from: '+1', to: '+2', text: 'hi', id: 'x' });
assert(inbound.from === '+1' && inbound.text === 'hi', 'normalizeInbound');

const paired = {
  providerKey: 'esim',
  adapterType: 'esim',
  esimPaired: true,
  adapter: esimProvider,
  credentials: {},
};
assert(
  shouldUseMockSend(paired, { organizationDeliveryMode: 'sandbox', userStatus: 'active' }) === false,
  'paired esim bypasses sandbox'
);

const unpaired = { ...paired, esimPaired: false };
assert(
  shouldUseMockSend(unpaired, { organizationDeliveryMode: 'live', userStatus: 'active' }) === true,
  'unpaired esim uses mock'
);

console.log('All eSIM unit checks passed.');
