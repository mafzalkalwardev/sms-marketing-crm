function requireWorkerToken(req, res, next) {
  const expected = process.env.WORKER_SERVICE_TOKEN || '';
  if (!expected) {
    return res.status(503).json({ error: 'Worker service token is not configured' });
  }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (token !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

module.exports = { requireWorkerToken };
