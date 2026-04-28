'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db     = require('../db');
const { sign, verify } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email and password required' });
  }

  const user = db.prepare(
    'SELECT * FROM users WHERE email = ? AND is_active = 1'
  ).get(email.toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  }

  const token = sign({ id: user.id, email: user.email, role: user.role });
  res.json({
    ok: true,
    token,
    user: {
      id:         user.id,
      email:      user.email,
      name:       user.name,
      role:       user.role,
      store_slug: user.store_slug,
    },
  });
});

// POST /api/auth/change-password
router.post('/change-password', verify, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ ok: false, error: 'Both passwords required' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ ok: false, error: 'New password must be at least 8 characters' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(400).json({ ok: false, error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare(
    `UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(hash, user.id);

  res.json({ ok: true });
});

module.exports = router;
