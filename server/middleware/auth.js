'use strict';
const jwt = require('jsonwebtoken');
const db  = require('../db');

const SECRET = process.env.JWT_SECRET || 'bakudan-dev-secret-change-in-production';

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

function verify(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, SECRET);
    const user = db.prepare(
      'SELECT * FROM users WHERE id = ? AND is_active = 1'
    ).get(decoded.id);
    if (!user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Token invalid or expired' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { sign, verify, requireRole };
