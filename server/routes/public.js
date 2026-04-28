'use strict';
const router = require('express').Router();
const db     = require('../db');

// GET /api/public/pages/:slug — public link hub page
router.get('/pages/:slug', (req, res) => {
  const page = db.prepare(
    'SELECT * FROM pages WHERE slug = ? AND is_active = 1'
  ).get(req.params.slug);
  if (!page) return res.status(404).json({ ok: false, error: 'Page not found' });

  const now = new Date().toISOString();
  const buttons = db.prepare(`
    SELECT * FROM buttons
    WHERE page_id = ? AND is_active = 1 AND enabled = 1
      AND (start_at IS NULL OR start_at <= ?)
      AND (end_at   IS NULL OR end_at   >= ?)
    ORDER BY sort_order ASC, id ASC
  `).all(page.id, now, now);

  // Record pageview
  db.prepare(`
    INSERT INTO analytics (page_id, event_type, referrer, user_agent, ip)
    VALUES (?, 'pageview', ?, ?, ?)
  `).run(page.id, req.get('Referer') || null, req.get('User-Agent') || null, req.ip || null);

  res.json({ ok: true, data: { page, buttons } });
});

// POST /api/public/track — record a button click
router.post('/track', (req, res) => {
  const { page_id, button_id, shortlink_id, event_type } = req.body || {};
  db.prepare(`
    INSERT INTO analytics (page_id, button_id, shortlink_id, event_type, referrer, user_agent, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    page_id      || null,
    button_id    || null,
    shortlink_id || null,
    event_type   || 'click',
    req.get('Referer')    || null,
    req.get('User-Agent') || null,
    req.ip || null
  );
  res.json({ ok: true });
});

// POST /api/public/subscribe — email capture
router.post('/subscribe', (req, res) => {
  const { email, name, source } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Valid email required' });
  }
  try {
    db.prepare(
      `INSERT INTO subscribers (email, name, source) VALUES (?, ?, ?)`
    ).run(email.toLowerCase().trim(), name || null, source || null);
  } catch {
    // Silently ignore duplicate subscriptions
  }
  res.json({ ok: true });
});

// GET /api/public/shortlinks/:code — resolve & redirect shortlink
router.get('/shortlinks/:code', (req, res) => {
  const sl = db.prepare(
    'SELECT * FROM shortlinks WHERE code = ? AND is_active = 1'
  ).get(req.params.code);
  if (!sl) return res.status(404).json({ ok: false, error: 'Not found' });

  db.prepare(
    `UPDATE shortlinks SET clicks = clicks + 1, updated_at = datetime('now') WHERE id = ?`
  ).run(sl.id);

  db.prepare(`
    INSERT INTO analytics (shortlink_id, event_type, referrer, user_agent, ip)
    VALUES (?, 'click', ?, ?, ?)
  `).run(sl.id, req.get('Referer') || null, req.get('User-Agent') || null, req.ip || null);

  res.redirect(302, sl.destination);
});

// GET /api/public/pages/all — list all active pages (for store-tab switcher)
router.get('/pages/all', (req, res) => {
  const pages = db.prepare(
    'SELECT id, title, slug, headline, store_slug FROM pages WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
  ).all();
  res.json({ ok: true, data: { pages } });
});

// GET /api/public/posts — published blog posts for the public site
router.get('/posts', (req, res) => {
  const posts = db.prepare(`
    SELECT id, title, slug, excerpt, cover_image, published_at
    FROM blog_posts
    WHERE status = 'published' AND archived_at IS NULL
    ORDER BY published_at DESC
    LIMIT 20
  `).all();
  res.json({ ok: true, data: { posts } });
});

// GET /api/public/posts/:slug — single published post
router.get('/posts/:slug', (req, res) => {
  const post = db.prepare(`
    SELECT id, title, slug, content, excerpt, cover_image, published_at
    FROM blog_posts
    WHERE slug = ? AND status = 'published' AND archived_at IS NULL
  `).get(req.params.slug);
  if (!post) return res.status(404).json({ ok: false, error: 'Post not found' });
  res.json({ ok: true, data: { post } });
});

module.exports = router;
