const jwt = require('jsonwebtoken');
const { queryOne } = require('../config/database');
const { enrichUser } = require('../services/tenancyService');
const { validateSession } = require('../services/sessionService');

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.jti && !(await validateSession(decoded.jti))) {
      return res.status(401).json({ error: 'Session expired or revoked' });
    }
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [decoded.id]);
    if (!user) return res.status(401).json({ error: 'Invalid user' });
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is temporarily unavailable. Contact support.' });
    }
    req.user = await enrichUser(user);
    req.tokenJti = decoded.jti || null;
    req.impersonatedBy = decoded.impersonated_by || null;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const authorize = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  next();
};

const requireAdmin = authorize(['admin', 'super_admin']);
const requireSuperAdmin = authorize(['super_admin']);

module.exports = { authenticate, authorize, requireAdmin, requireSuperAdmin };
