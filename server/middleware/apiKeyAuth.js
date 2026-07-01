const { authenticateApiKey, hasScope } = require('../services/apiKeyService');
const { enrichUser } = require('../services/tenancyService');

async function authenticateApiKeyOrJwt(req, res, next) {
  const bearer = req.headers.authorization?.split(' ')[1];
  if (bearer?.startsWith('smk_')) {
    try {
      const auth = await authenticateApiKey(bearer);
      if (!auth) return res.status(401).json({ error: 'Invalid API key' });
      req.user = await enrichUser(auth.user);
      req.apiKey = { id: auth.apiKeyId, scopes: auth.scopes };
      return next();
    } catch (error) {
      return next(error);
    }
  }
  const { authenticate } = require('./auth');
  return authenticate(req, res, next);
}

function requireScope(scope) {
  return (req, res, next) => {
    if (!req.apiKey) return next();
    if (!hasScope(req.apiKey.scopes, scope)) {
      return res.status(403).json({ error: `API key missing scope: ${scope}` });
    }
    return next();
  };
}

module.exports = { authenticateApiKeyOrJwt, requireScope };
