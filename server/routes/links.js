'use strict';
const router = require('express').Router();
const db     = require('../db');
const { verify, requireRole } = require('../middleware/auth');

const MGR  = ['super_admin', 'marketing_manager'];
const EDIT = ['super_admin', 'marketing_manager', 'store_manager'];

// ── Dashboard ─────────────────────────────────────────────────────────

router.get('/admin/dashboard', verify, (req, res) => {
  const pages = db.prepare('SELECT COUNT(*) AS c FROM pages').get().c;
  const activeButtons = db.prepare(
    `SELECT COUNT(*) AS c FROM buttons WHERE is_active = 1 AND enabled = 1`
  ).get().c;
  const subscribers = db.prepare(
    'SELECT COUNT(*) AS c FROM subscribers WHERE is_active = 1'
  ).get().c;
  const shortlinks = db.prepare(
    'SELECT COUNT(*) AS c FROM shortlinks WHERE is_active = 1'
  ).get().c;
  const recentClicks = db.prepare(
    `SELECT COUNT(*) AS c FROM analytics WHERE event_type = 'click' AND created_at >= datetime('now', '-7 days')`
  ).get().c;

  res.json({ ok: true, data: { pages, activeButtons, subscribers, shortlinks, recentClicks } });
});

// ── Pages ─────────────────────────────────────────────────────────────

router.get('/admin/pages', verify, (req, res) => {
  const pages = db.prepare(
    'SELECT * FROM pages ORDER BY sort_order ASC, id ASC'
  ).all();
  res.json({ ok: true, data: { pages } });
});

router.post('/admin/pages', verify, requireRole(...MGR), (req, res) => {
  const { title, slug, headline, store_slug } = req.body || {};
  if (!title || !slug) {
    return res.status(400).json({ ok: false, error: 'Title and slug required' });
  }
  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  try {
    const result = db.prepare(
      `INSERT INTO pages (title, slug, headline, store_slug) VALUES (?, ?, ?, ?)`
    ).run(title, safeSlug, headline || null, store_slug || null);
    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(result.lastInsertRowid);
    res.json({ ok: true, data: { page } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ ok: false, error: 'Slug already in use' });
    }
    throw e;
  }
});

router.get('/admin/pages/:id', verify, (req, res) => {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (!page) return res.status(404).json({ ok: false, error: 'Page not found' });
  res.json({ ok: true, data: { page } });
});

router.put('/admin/pages/:id', verify, requireRole(...EDIT), (req, res) => {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (!page) return res.status(404).json({ ok: false, error: 'Page not found' });

  const { title, slug, headline, store_slug, is_active, theme } = req.body || {};
  const safeSlug = (slug ?? page.slug)
    .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  try {
    db.prepare(`
      UPDATE pages SET title = ?, slug = ?, headline = ?, store_slug = ?,
        is_active = ?, theme = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title       ?? page.title,
      safeSlug,
      headline    ?? page.headline,
      store_slug  ?? page.store_slug,
      is_active   ?? page.is_active,
      theme       ?? page.theme,
      page.id
    );
    res.json({ ok: true, data: { page: db.prepare('SELECT * FROM pages WHERE id = ?').get(page.id) } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ ok: false, error: 'Slug already in use' });
    }
    throw e;
  }
});

router.delete('/admin/pages/:id', verify, requireRole(...MGR), (req, res) => {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (!page) return res.status(404).json({ ok: false, error: 'Page not found' });
  db.prepare('DELETE FROM pages WHERE id = ?').run(page.id);
  res.json({ ok: true });
});

router.post('/admin/pages/:id/duplicate', verify, requireRole(...MGR), (req, res) => {
  const src = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (!src) return res.status(404).json({ ok: false, error: 'Page not found' });

  const newSlug = `${src.slug}-copy-${Date.now()}`;
  const result  = db.prepare(
    `INSERT INTO pages (title, slug, headline, store_slug, theme) VALUES (?, ?, ?, ?, ?)`
  ).run(`${src.title} (Copy)`, newSlug, src.headline, src.store_slug, src.theme);
  const newPage = db.prepare('SELECT * FROM pages WHERE id = ?').get(result.lastInsertRowid);

  const buttons = db.prepare(
    'SELECT * FROM buttons WHERE page_id = ? ORDER BY sort_order'
  ).all(src.id);
  const insBtn = db.prepare(`
    INSERT INTO buttons (page_id, label, url, icon, sort_order, is_active, is_featured, enabled, start_at, end_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  buttons.forEach(b =>
    insBtn.run(newPage.id, b.label, b.url, b.icon, b.sort_order, b.is_active, b.is_featured, b.enabled, b.start_at, b.end_at)
  );

  res.json({ ok: true, data: { page: newPage } });
});

// ── Buttons ───────────────────────────────────────────────────────────

router.get('/admin/pages/:id/buttons', verify, (req, res) => {
  const buttons = db.prepare(
    'SELECT * FROM buttons WHERE page_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(req.params.id);
  res.json({ ok: true, data: { buttons } });
});

router.post('/admin/pages/:id/buttons', verify, requireRole(...EDIT), (req, res) => {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (!page) return res.status(404).json({ ok: false, error: 'Page not found' });

  const { label, url, icon, sort_order, is_active, is_featured, enabled, start_at, end_at } = req.body || {};
  if (!label || !url) {
    return res.status(400).json({ ok: false, error: 'Label and URL required' });
  }

  const { m: maxOrder } = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) AS m FROM buttons WHERE page_id = ?'
  ).get(page.id);

  const result = db.prepare(`
    INSERT INTO buttons (page_id, label, url, icon, sort_order, is_active, is_featured, enabled, start_at, end_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    page.id, label, url, icon || null,
    sort_order ?? maxOrder + 1,
    is_active   ?? 1,
    is_featured ?? 0,
    enabled     ?? 1,
    start_at    || null,
    end_at      || null
  );

  const button = db.prepare('SELECT * FROM buttons WHERE id = ?').get(result.lastInsertRowid);
  res.json({ ok: true, data: { button } });
});

router.patch('/admin/pages/:id/buttons/reorder', verify, requireRole(...EDIT), (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) {
    return res.status(400).json({ ok: false, error: 'order must be an array of ids' });
  }
  const stmt = db.prepare(
    `UPDATE buttons SET sort_order = ?, updated_at = datetime('now') WHERE id = ? AND page_id = ?`
  );
  order.forEach((id, idx) => stmt.run(idx, id, req.params.id));
  res.json({ ok: true });
});

// POST /admin/buttons/:id — duplicate a button
router.post('/admin/buttons/:id', verify, requireRole(...EDIT), (req, res) => {
  const src = db.prepare('SELECT * FROM buttons WHERE id = ?').get(req.params.id);
  if (!src) return res.status(404).json({ ok: false, error: 'Button not found' });

  const result = db.prepare(`
    INSERT INTO buttons (page_id, label, url, icon, sort_order, is_active, is_featured, enabled, start_at, end_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(src.page_id, `${src.label} (Copy)`, src.url, src.icon, src.sort_order + 1, 0, src.is_featured, src.enabled, src.start_at, src.end_at);

  const button = db.prepare('SELECT * FROM buttons WHERE id = ?').get(result.lastInsertRowid);
  res.json({ ok: true, data: { button } });
});

router.put('/admin/buttons/:id', verify, requireRole(...EDIT), (req, res) => {
  const button = db.prepare('SELECT * FROM buttons WHERE id = ?').get(req.params.id);
  if (!button) return res.status(404).json({ ok: false, error: 'Button not found' });

  const { label, url, icon, sort_order, is_active, is_featured, enabled, start_at, end_at } = req.body || {};
  db.prepare(`
    UPDATE buttons SET label = ?, url = ?, icon = ?, sort_order = ?, is_active = ?,
      is_featured = ?, enabled = ?, start_at = ?, end_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    label       ?? button.label,
    url         ?? button.url,
    icon        ?? button.icon,
    sort_order  ?? button.sort_order,
    is_active   ?? button.is_active,
    is_featured ?? button.is_featured,
    enabled     ?? button.enabled,
    start_at    ?? button.start_at,
    end_at      ?? button.end_at,
    button.id
  );
  res.json({ ok: true, data: { button: db.prepare('SELECT * FROM buttons WHERE id = ?').get(button.id) } });
});

router.delete('/admin/buttons/:id', verify, requireRole(...EDIT), (req, res) => {
  const button = db.prepare('SELECT * FROM buttons WHERE id = ?').get(req.params.id);
  if (!button) return res.status(404).json({ ok: false, error: 'Button not found' });
  db.prepare('DELETE FROM buttons WHERE id = ?').run(button.id);
  res.json({ ok: true });
});

// ── Redirects ─────────────────────────────────────────────────────────

router.get('/admin/pages/:id/redirects', verify, requireRole(...MGR), (req, res) => {
  const redirects = db.prepare(
    'SELECT * FROM redirects WHERE page_id = ? ORDER BY id DESC'
  ).all(req.params.id);
  res.json({ ok: true, data: { redirects } });
});

router.post('/admin/pages/:id/redirects', verify, requireRole(...MGR), (req, res) => {
  const { source, destination, is_permanent } = req.body || {};
  if (!source || !destination) {
    return res.status(400).json({ ok: false, error: 'Source and destination required' });
  }
  const result = db.prepare(
    `INSERT INTO redirects (page_id, source, destination, is_permanent) VALUES (?, ?, ?, ?)`
  ).run(req.params.id, source, destination, is_permanent ? 1 : 0);
  const redirect = db.prepare('SELECT * FROM redirects WHERE id = ?').get(result.lastInsertRowid);
  res.json({ ok: true, data: { redirect } });
});

router.delete('/admin/redirects/:id', verify, requireRole(...MGR), (req, res) => {
  const redirect = db.prepare('SELECT * FROM redirects WHERE id = ?').get(req.params.id);
  if (!redirect) return res.status(404).json({ ok: false, error: 'Redirect not found' });
  db.prepare('DELETE FROM redirects WHERE id = ?').run(redirect.id);
  res.json({ ok: true });
});

// ── Shortlinks ────────────────────────────────────────────────────────

router.get('/admin/shortlinks', verify, requireRole(...MGR), (req, res) => {
  const shortlinks = db.prepare(
    'SELECT * FROM shortlinks ORDER BY created_at DESC'
  ).all();
  res.json({ ok: true, data: { shortlinks } });
});

router.post('/admin/shortlinks', verify, requireRole(...MGR), (req, res) => {
  const { code, destination, label, utm_source, utm_medium, utm_campaign } = req.body || {};
  if (!code || !destination) {
    return res.status(400).json({ ok: false, error: 'Code and destination required' });
  }
  try {
    const result = db.prepare(`
      INSERT INTO shortlinks (code, destination, label, utm_source, utm_medium, utm_campaign)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(code, destination, label || null, utm_source || null, utm_medium || null, utm_campaign || null);
    const sl = db.prepare('SELECT * FROM shortlinks WHERE id = ?').get(result.lastInsertRowid);
    res.json({ ok: true, data: { shortlink: sl } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ ok: false, error: 'Code already in use' });
    }
    throw e;
  }
});

router.delete('/admin/shortlinks/:id', verify, requireRole(...MGR), (req, res) => {
  const sl = db.prepare('SELECT * FROM shortlinks WHERE id = ?').get(req.params.id);
  if (!sl) return res.status(404).json({ ok: false, error: 'Shortlink not found' });
  db.prepare('DELETE FROM shortlinks WHERE id = ?').run(sl.id);
  res.json({ ok: true });
});

// ── Analytics ─────────────────────────────────────────────────────────

router.get('/admin/analytics', verify, requireRole(...MGR), (req, res) => {
  const period = req.query.period || '7d';
  const days   = Math.min(Math.max(parseInt(period) || 7, 1), 365);

  const clicks = db.prepare(`
    SELECT DATE(created_at) AS date, COUNT(*) AS count
    FROM analytics
    WHERE event_type = 'click' AND created_at >= datetime('now', '-${days} days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all();

  const topButtons = db.prepare(`
    SELECT b.label, b.url, COUNT(*) AS clicks
    FROM analytics a
    JOIN buttons b ON a.button_id = b.id
    WHERE a.event_type = 'click' AND a.created_at >= datetime('now', '-${days} days')
    GROUP BY a.button_id
    ORDER BY clicks DESC
    LIMIT 10
  `).all();

  const byPage = db.prepare(`
    SELECT p.title, p.slug, COUNT(*) AS clicks
    FROM analytics a
    JOIN pages p ON a.page_id = p.id
    WHERE a.event_type = 'click' AND a.created_at >= datetime('now', '-${days} days')
    GROUP BY a.page_id
    ORDER BY clicks DESC
  `).all();

  res.json({ ok: true, data: { clicks, topButtons, byPage, period } });
});

router.get('/admin/pages/:id/analytics', verify, (req, res) => {
  const period = req.query.period || '7d';
  const days   = Math.min(Math.max(parseInt(period) || 7, 1), 365);

  const { total } = db.prepare(`
    SELECT COUNT(*) AS total FROM analytics
    WHERE page_id = ? AND event_type = 'click'
      AND created_at >= datetime('now', '-${days} days')
  `).get(req.params.id);

  const byButton = db.prepare(`
    SELECT b.label, COUNT(*) AS clicks
    FROM analytics a
    JOIN buttons b ON a.button_id = b.id
    WHERE a.page_id = ? AND a.event_type = 'click'
      AND a.created_at >= datetime('now', '-${days} days')
    GROUP BY a.button_id
    ORDER BY clicks DESC
  `).all(req.params.id);

  res.json({ ok: true, data: { clicks: total, byButton, period } });
});

// ── Subscribers ───────────────────────────────────────────────────────

router.get('/admin/subscribers', verify, requireRole(...MGR), (req, res) => {
  const subscribers = db.prepare(
    'SELECT * FROM subscribers ORDER BY created_at DESC'
  ).all();
  res.json({ ok: true, data: { subscribers } });
});

router.get('/admin/subscribers/export', verify, requireRole(...MGR), (req, res) => {
  const rows = db.prepare(
    `SELECT email, name, source, created_at FROM subscribers WHERE is_active = 1 ORDER BY created_at DESC`
  ).all();
  const csv = [
    'email,name,source,subscribed_at',
    ...rows.map(r => `"${r.email}","${r.name || ''}","${r.source || ''}","${r.created_at}"`),
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="subscribers.csv"');
  res.send(csv);
});

// ── Users ─────────────────────────────────────────────────────────────

router.get('/admin/users', verify, requireRole(...MGR), (req, res) => {
  const users = db.prepare(
    'SELECT id, email, name, role, store_slug, is_active, created_at FROM users ORDER BY created_at DESC'
  ).all();
  res.json({ ok: true, data: { users } });
});

router.post('/admin/users', verify, requireRole('super_admin'), (req, res) => {
  const { email, name, role, store_slug, password } = req.body || {};
  if (!email || !role || !password) {
    return res.status(400).json({ ok: false, error: 'Email, role, and password required' });
  }
  const validRoles = ['super_admin', 'marketing_manager', 'store_manager', 'viewer'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ ok: false, error: 'Invalid role' });
  }
  try {
    const hash   = require('bcryptjs').hashSync(password, 10);
    const result = db.prepare(
      `INSERT INTO users (email, password_hash, name, role, store_slug) VALUES (?, ?, ?, ?, ?)`
    ).run(email.toLowerCase().trim(), hash, name || null, role, store_slug || null);
    const user = db.prepare(
      'SELECT id, email, name, role, store_slug, is_active, created_at FROM users WHERE id = ?'
    ).get(result.lastInsertRowid);
    res.json({ ok: true, data: { user } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ ok: false, error: 'Email already in use' });
    }
    throw e;
  }
});

router.put('/admin/users/:id', verify, requireRole('super_admin'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

  const { name, role, store_slug, is_active } = req.body || {};
  db.prepare(`
    UPDATE users SET name = ?, role = ?, store_slug = ?, is_active = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(name ?? user.name, role ?? user.role, store_slug ?? user.store_slug, is_active ?? user.is_active, user.id);

  const updated = db.prepare(
    'SELECT id, email, name, role, store_slug, is_active, created_at FROM users WHERE id = ?'
  ).get(user.id);
  res.json({ ok: true, data: { user: updated } });
});

router.delete('/admin/users/:id', verify, requireRole('super_admin'), (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ ok: false, error: 'Cannot delete your own account' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.json({ ok: true });
});

// ── Settings ──────────────────────────────────────────────────────────

router.get('/admin/settings', verify, requireRole(...MGR), (req, res) => {
  const rows     = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({ ok: true, data: { settings } });
});

router.put('/admin/settings', verify, requireRole(...MGR), (req, res) => {
  const settings = req.body || {};
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`
  );
  Object.entries(settings).forEach(([k, v]) => stmt.run(k, String(v)));
  res.json({ ok: true });
});

module.exports = router;
