'use strict';
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { verify, requireRole } = require('../middleware/auth');

const MGR = ['super_admin', 'marketing_manager'];
const EDIT = ['super_admin', 'marketing_manager', 'store_manager'];
const PROTECTED_CTA_LABELS = ['main website', 'visit main website', 'order online', 'locations', 'get directions'];

function getPageWithButtons(pageId) {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(pageId);
  if (!page) return null;
  const buttons = db.prepare(
    'SELECT * FROM buttons WHERE page_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(page.id);
  return { page, buttons };
}

function insertPageSnapshot(pageId, action, req, label) {
  const snap = getPageWithButtons(pageId);
  if (!snap) return null;
  const result = db.prepare(`
    INSERT INTO link_page_snapshots
      (page_id, page_slug, page_title, action, label, snapshot, user_id, user_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    snap.page.id,
    snap.page.slug,
    snap.page.title,
    action,
    label || null,
    JSON.stringify(snap),
    req.user?.id || null,
    req.user?.name || req.user?.email || null
  );
  return result.lastInsertRowid;
}

function restorePageSnapshot(snapshotId) {
  const row = db.prepare('SELECT * FROM link_page_snapshots WHERE id = ?').get(snapshotId);
  if (!row) return null;
  const snap = JSON.parse(row.snapshot);
  const page = snap.page;
  const buttons = Array.isArray(snap.buttons) ? snap.buttons : [];
  const existing = db.prepare('SELECT id FROM pages WHERE id = ?').get(page.id);

  if (existing) {
    db.prepare(`
      UPDATE pages SET title = ?, slug = ?, headline = ?, store_slug = ?,
        is_active = ?, sort_order = ?, theme = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      page.title, page.slug, page.headline, page.store_slug, page.is_active,
      page.sort_order || 0, page.theme || null, page.id
    );
  } else {
    db.prepare(`
      INSERT INTO pages (id, title, slug, headline, store_slug, is_active, sort_order, theme)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      page.id, page.title, page.slug, page.headline, page.store_slug,
      page.is_active, page.sort_order || 0, page.theme || null
    );
  }

  db.prepare('DELETE FROM buttons WHERE page_id = ?').run(page.id);
  const insertButton = db.prepare(`
    INSERT INTO buttons
      (id, page_id, label, url, icon, sort_order, is_active, is_featured, enabled,
       opens_in_new_tab, start_at, end_at, subtitle, style_variant, icon_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  buttons.forEach((b, index) => {
    insertButton.run(
      b.id, page.id, b.label, b.url, b.icon || null, b.sort_order ?? index,
      b.is_active ?? 1, b.is_featured ?? 0, b.enabled ?? 1,
      b.opens_in_new_tab ?? 1, b.start_at || null, b.end_at || null,
      b.subtitle || null, b.style_variant || 'secondary', b.icon_key || null
    );
  });

  return { page_id: page.id };
}

function normalizeDraftSnapshot(snapshot, pageId) {
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const page = snap.page && typeof snap.page === 'object' ? snap.page : {};
  const buttons = Array.isArray(snap.buttons) ? snap.buttons : [];
  return {
    page: {
      ...page,
      id: pageId,
      title: String(page.title || 'Links Page').trim(),
      slug: String(page.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
      headline: page.headline || null,
      store_slug: page.store_slug || null,
      is_active: page.is_active ? 1 : 0,
      sort_order: page.sort_order || 0,
      theme: page.theme || null,
    },
    buttons: buttons.map((b, index) => ({
      id: b.id || null,
      label: String(b.label || '').trim(),
      url: String(b.url || '').trim(),
      icon: b.icon || null,
      icon_key: b.icon_key || b.icon || null,
      subtitle: b.subtitle || null,
      style_variant: b.style_variant || 'secondary',
      sort_order: Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : index,
      is_active: b.is_active === 0 ? 0 : 1,
      is_featured: b.is_featured ? 1 : 0,
      enabled: b.enabled === 0 ? 0 : 1,
      opens_in_new_tab: b.opens_in_new_tab === 0 ? 0 : 1,
      start_at: b.start_at || null,
      end_at: b.end_at || null,
    })).filter(b => b.label && b.url),
  };
}

function buildTemplateSnapshot(templateId, current) {
  const base = JSON.parse(JSON.stringify(current));
  const website = 'https://www.bakudanramen.com/';
  const menu = 'https://www.bakudanramen.com/menu.html';
  const rewards = 'https://www.toasttab.com/bakudanramen/rewardsSignup';
  const socials = {
    instagram: 'https://www.instagram.com/bakudanramen/',
    facebook: 'https://www.facebook.com/bakudanSA/',
  };
  const templates = {
    blank: [],
    restaurant_main_hub: [
      ['Order Online', 'https://www.bakudanramen.com/order.html', 'order', 'primary', 'Pickup and delivery'],
      ['View Menu', menu, 'menu', 'secondary', 'Full menu and prices'],
      ['Main Website', website, 'website', 'secondary', 'BakudanRamen.com'],
      ['Locations', 'https://www.bakudanramen.com/locations.html', 'directions', 'secondary', 'Hours and directions'],
      ['Join Rewards', rewards, 'gift', 'primary', 'Earn points on every visit'],
      ['Instagram', socials.instagram, 'instagram', 'secondary', '@bakudanramen'],
      ['Facebook', socials.facebook, 'facebook', 'secondary', 'Bakudan Ramen'],
    ],
    rewards_campaign: [
      ['Join Rewards', rewards, 'gift', 'primary', 'Earn points on every visit'],
      ['Order Online', 'https://www.bakudanramen.com/order.html', 'order', 'primary', 'Pickup and delivery'],
      ['View Menu', menu, 'menu', 'secondary', 'Full menu and prices'],
      ['Main Website', website, 'website', 'secondary', 'BakudanRamen.com'],
    ],
    social_landing: [
      ['Order Online', 'https://www.bakudanramen.com/order.html', 'order', 'primary', 'Pickup and delivery'],
      ['Instagram', socials.instagram, 'instagram', 'primary', '@bakudanramen'],
      ['Facebook', socials.facebook, 'facebook', 'secondary', 'Bakudan Ramen'],
      ['Main Website', website, 'website', 'secondary', 'BakudanRamen.com'],
      ['Locations', 'https://www.bakudanramen.com/locations.html', 'directions', 'secondary', 'Hours and directions'],
    ],
    holiday_promo: [
      ['Holiday Specials', website, 'ticket', 'primary', 'Limited-time offers'],
      ['Gift Cards', website, 'gift', 'primary', 'Give the gift of ramen'],
      ['Order Online', 'https://www.bakudanramen.com/order.html', 'order', 'secondary', 'Pickup and delivery'],
      ['Main Website', website, 'website', 'secondary', 'BakudanRamen.com'],
    ],
  };
  const rows = templates[templateId] || templates.restaurant_main_hub;
  base.buttons = rows.map((row, index) => ({
    label: row[0],
    url: row[1],
    icon_key: row[2],
    icon: null,
    style_variant: row[3],
    subtitle: row[4],
    sort_order: index,
    is_active: 1,
    is_featured: row[3] === 'primary' ? 1 : 0,
    enabled: 1,
    opens_in_new_tab: row[1].startsWith('http') ? 1 : 0,
    start_at: null,
    end_at: null,
  }));
  return base;
}

function diffSnapshots(live, draft) {
  const liveButtons = Array.isArray(live?.buttons) ? live.buttons : [];
  const draftButtons = Array.isArray(draft?.buttons) ? draft.buttons : [];
  const liveLabels = new Map(liveButtons.map(b => [String(b.label || '').toLowerCase(), b]));
  const draftLabels = new Map(draftButtons.map(b => [String(b.label || '').toLowerCase(), b]));
  const removed = liveButtons.filter(b => !draftLabels.has(String(b.label || '').toLowerCase()));
  const added = draftButtons.filter(b => !liveLabels.has(String(b.label || '').toLowerCase()));
  const changed = draftButtons.filter(b => {
    const liveBtn = liveLabels.get(String(b.label || '').toLowerCase());
    return liveBtn && (
      liveBtn.url !== b.url ||
      liveBtn.is_active !== b.is_active ||
      liveBtn.enabled !== b.enabled ||
      liveBtn.sort_order !== b.sort_order
    );
  });
  return {
    removed_count: removed.length,
    added_count: added.length,
    changed_count: changed.length,
    live_button_count: liveButtons.length,
    draft_button_count: draftButtons.length,
    removed: removed.map(b => b.label),
    added: added.map(b => b.label),
    changed: changed.map(b => b.label),
    page_changed: JSON.stringify(live?.page || {}) !== JSON.stringify(draft?.page || {}),
  };
}

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
    res.json({ ok: true, data: { id: page.id, page } });
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
  if (typeof is_active !== 'undefined' && Number(is_active) !== Number(page.is_active)) {
    insertPageSnapshot(page.id, Number(is_active) ? 'pre_publish' : 'pre_unpublish', req);
  }
  const safeSlug = (slug ?? page.slug)
    .toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  try {
    db.prepare(`
      UPDATE pages SET title = ?, slug = ?, headline = ?, store_slug = ?,
        is_active = ?, theme = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title ?? page.title,
      safeSlug,
      headline ?? page.headline,
      store_slug ?? page.store_slug,
      is_active ?? page.is_active,
      theme ?? page.theme,
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
  const confirmText = String(req.body?.confirm_text || '');
  if (page.is_active && confirmText !== 'DELETE') {
    return res.status(409).json({ ok: false, error: 'Type DELETE to delete a published page' });
  }
  insertPageSnapshot(page.id, 'pre_delete_page', req, `Before deleting ${page.title}`);
  db.prepare('DELETE FROM pages WHERE id = ?').run(page.id);
  res.json({ ok: true });
});

router.post('/admin/pages/:id/duplicate', verify, requireRole(...MGR), (req, res) => {
  const src = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (!src) return res.status(404).json({ ok: false, error: 'Page not found' });

  const newSlug = `${src.slug}-copy-${Date.now()}`;
  const result = db.prepare(
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

  res.json({ ok: true, data: { id: newPage.id, page: newPage } });
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

  const { label, url, icon, icon_key, subtitle, style_variant, sort_order, is_active, is_featured, enabled, opens_in_new_tab, start_at, end_at } = req.body || {};

  if (!label || !url) {
    return res.status(400).json({ ok: false, error: 'Label and URL required' });
  }

  const { m: maxOrder } = db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) AS m FROM buttons WHERE page_id = ?'
  ).get(page.id);

  const result = db.prepare(`
    INSERT INTO buttons
      (page_id, label, url, icon, sort_order, is_active, is_featured, enabled,
       opens_in_new_tab, start_at, end_at, subtitle, style_variant, icon_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    page.id, label, url, icon || null,
    sort_order ?? maxOrder + 1,
    is_active ?? 1,
    is_featured ?? 0,
    enabled ?? 1,
    opens_in_new_tab ?? 1,
    start_at || null,
    end_at || null,
    subtitle || null,
    style_variant || 'secondary',
    icon_key || icon || null
  );

  const button = db.prepare('SELECT * FROM buttons WHERE id = ?').get(result.lastInsertRowid);
  res.json({ ok: true, data: { id: button.id, button } });
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
    INSERT INTO buttons
      (page_id, label, url, icon, sort_order, is_active, is_featured, enabled,
       opens_in_new_tab, start_at, end_at, subtitle, style_variant, icon_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    src.page_id, `${src.label} (Copy)`, src.url, src.icon, src.sort_order + 1, 0,
    src.is_featured, src.enabled, src.opens_in_new_tab, src.start_at, src.end_at,
    src.subtitle, src.style_variant, src.icon_key
  );

  const button = db.prepare('SELECT * FROM buttons WHERE id = ?').get(result.lastInsertRowid);
  res.json({ ok: true, data: { id: button.id, button } });
});

router.put('/admin/buttons/:id', verify, requireRole(...EDIT), (req, res) => {
  const button = db.prepare('SELECT * FROM buttons WHERE id = ?').get(req.params.id);
  if (!button) return res.status(404).json({ ok: false, error: 'Button not found' });

  const { label, url, icon, icon_key, subtitle, style_variant, sort_order, is_active, is_featured, enabled, opens_in_new_tab, start_at, end_at } = req.body || {};
  db.prepare(`
    UPDATE buttons SET label = ?, url = ?, icon = ?, sort_order = ?, is_active = ?,
      is_featured = ?, enabled = ?, opens_in_new_tab = ?, start_at = ?, end_at = ?,
      subtitle = ?, style_variant = ?, icon_key = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    label ?? button.label,
    url ?? button.url,
    icon ?? button.icon,
    sort_order ?? button.sort_order,
    is_active ?? button.is_active,
    is_featured ?? button.is_featured,
    enabled ?? button.enabled,
    opens_in_new_tab ?? button.opens_in_new_tab,
    start_at ?? button.start_at,
    end_at ?? button.end_at,
    subtitle ?? button.subtitle,
    style_variant ?? button.style_variant,
    icon_key ?? button.icon_key,
    button.id
  );
  res.json({ ok: true, data: { button: db.prepare('SELECT * FROM buttons WHERE id = ?').get(button.id) } });
});

router.delete('/admin/buttons/:id', verify, requireRole(...EDIT), (req, res) => {
  const button = db.prepare('SELECT * FROM buttons WHERE id = ?').get(req.params.id);
  if (!button) return res.status(404).json({ ok: false, error: 'Button not found' });
  const isProtected = PROTECTED_CTA_LABELS.some(label =>
    String(button.label || '').toLowerCase().includes(label)
  );
  const confirmText = String(req.body?.confirm_text || '');
  if (isProtected && confirmText !== 'DELETE') {
    return res.status(409).json({ ok: false, error: 'Type DELETE to delete a protected CTA' });
  }
  insertPageSnapshot(button.page_id, 'pre_delete_button', req, `Before deleting ${button.label}`);
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
  const days = Math.min(Math.max(parseInt(period) || 7, 1), 365);

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
  const days = Math.min(Math.max(parseInt(period) || 7, 1), 365);

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
    const hash = require('bcryptjs').hashSync(password, 10);
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
  const rows = db.prepare('SELECT key, value FROM settings').all();
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

// ── Revisions (History & Rollback) ────────────────────────────────────

router.get('/admin/revisions/:type/:id', verify, (req, res) => {
  const { type, id } = req.params;
  const limit = parseInt(req.query.limit) || 30;
  const revisions = db.prepare(
    `SELECT id, action, user_name, created_at FROM revisions
     WHERE entity_type = ? AND entity_id = ?
     ORDER BY created_at DESC LIMIT ?`
  ).all(type, id, limit);
  res.json({ ok: true, data: { revisions } });
});

router.get('/admin/revisions/:revId/snapshot', verify, (req, res) => {
  const rev = db.prepare('SELECT * FROM revisions WHERE id = ?').get(req.params.revId);
  if (!rev) return res.status(404).json({ ok: false, error: 'Revision not found' });
  res.json({ ok: true, data: { revision: { ...rev, snapshot: JSON.parse(rev.snapshot) } } });
});

router.post('/admin/revisions/:revId/restore', verify, requireRole(...EDIT), (req, res) => {
  const rev = db.prepare('SELECT * FROM revisions WHERE id = ?').get(req.params.revId);
  if (!rev) return res.status(404).json({ ok: false, error: 'Revision not found' });

  const snapshot = JSON.parse(rev.snapshot);

  if (rev.entity_type === 'page') {
    // Save current state as a new revision before restoring
    const current = db.prepare('SELECT * FROM pages WHERE id = ?').get(rev.entity_id);
    if (current) {
      db.prepare(
        `INSERT INTO revisions (entity_type, entity_id, action, snapshot, user_id, user_name)
         VALUES (?, ?, 'pre_restore', ?, ?, ?)`
      ).run('page', rev.entity_id, JSON.stringify(current), req.user.id, req.user.name);

      db.prepare(`
        UPDATE pages SET title = ?, slug = ?, headline = ?, store_slug = ?,
          is_active = ?, theme = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        snapshot.title, snapshot.slug, snapshot.headline, snapshot.store_slug,
        snapshot.is_active, snapshot.theme, rev.entity_id
      );
    }
  } else if (rev.entity_type === 'button') {
    const current = db.prepare('SELECT * FROM buttons WHERE id = ?').get(rev.entity_id);
    if (current) {
      db.prepare(
        `INSERT INTO revisions (entity_type, entity_id, action, snapshot, user_id, user_name)
         VALUES (?, ?, 'pre_restore', ?, ?, ?)`
      ).run('button', rev.entity_id, JSON.stringify(current), req.user.id, req.user.name);

      db.prepare(`
        UPDATE buttons SET label = ?, url = ?, icon_key = ?, style_variant = ?,
          subtitle = ?, is_active = ?, enabled = ?, is_featured = ?,
          opens_in_new_tab = ?, start_at = ?, end_at = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        snapshot.label, snapshot.url, snapshot.icon_key, snapshot.style_variant,
        snapshot.subtitle, snapshot.is_active, snapshot.enabled, snapshot.is_featured,
        snapshot.opens_in_new_tab, snapshot.start_at, snapshot.end_at, rev.entity_id
      );
    }
  }

  res.json({ ok: true, message: 'Restored successfully' });
});

// ── Safe Rebuild Mode: snapshots, draft workspace, diff, publish ──────

router.get('/admin/pages/:id/snapshots', verify, (req, res) => {
  const snapshots = db.prepare(`
    SELECT id, action, label, user_name, created_at
    FROM link_page_snapshots
    WHERE page_id = ?
    ORDER BY created_at DESC
    LIMIT 30
  `).all(req.params.id);
  res.json({ ok: true, data: { snapshots } });
});

router.post('/admin/pages/:id/snapshots/:snapshotId/restore', verify, requireRole(...EDIT), (req, res) => {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (page) insertPageSnapshot(page.id, 'pre_snapshot_restore', req, 'Before restoring snapshot');
  const restored = restorePageSnapshot(req.params.snapshotId);
  if (!restored) return res.status(404).json({ ok: false, error: 'Snapshot not found' });
  res.json({ ok: true, data: restored });
});

router.post('/admin/pages/:id/rollback-last-published', verify, requireRole(...EDIT), (req, res) => {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (!page) return res.status(404).json({ ok: false, error: 'Page not found' });
  insertPageSnapshot(page.id, 'pre_emergency_rollback', req, 'Before emergency rollback');
  const snap = db.prepare(`
    SELECT id FROM link_page_snapshots
    WHERE page_id = ? AND action IN ('pre_publish', 'pre_rebuild_publish', 'publish')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(page.id);
  if (!snap) return res.status(404).json({ ok: false, error: 'No published snapshot found' });
  const restored = restorePageSnapshot(snap.id);
  res.json({ ok: true, data: restored });
});

router.get('/admin/rebuild-templates', verify, requireRole(...EDIT), (_req, res) => {
  res.json({
    ok: true,
    data: {
      templates: [
        { id: 'restaurant_main_hub', name: 'Restaurant Main Hub', description: 'Order, menu, website, locations, rewards, social.' },
        { id: 'rewards_campaign', name: 'Rewards Campaign', description: 'Rewards-first layout with ordering and menu fallbacks.' },
        { id: 'social_landing', name: 'Social Landing', description: 'Fast social bio layout for Instagram and Facebook traffic.' },
        { id: 'holiday_promo', name: 'Holiday Promo', description: 'Promo, gift cards, ordering, and website links.' },
        { id: 'blank', name: 'Blank Draft', description: 'Start from an empty workspace.' },
      ]
    }
  });
});

router.post('/admin/pages/:id/rebuild/start', verify, requireRole(...EDIT), (req, res) => {
  const current = getPageWithButtons(req.params.id);
  if (!current) return res.status(404).json({ ok: false, error: 'Page not found' });

  insertPageSnapshot(current.page.id, 'pre_rebuild_start', req, 'Before starting Safe Rebuild');

  db.prepare(`
    UPDATE link_page_rebuild_drafts
    SET status = 'archived', updated_at = datetime('now')
    WHERE page_id = ? AND status = 'active'
  `).run(current.page.id);

  const templateId = req.body?.template_id || 'restaurant_main_hub';
  const draft = normalizeDraftSnapshot(buildTemplateSnapshot(templateId, current), current.page.id);
  const result = db.prepare(`
    INSERT INTO link_page_rebuild_drafts
      (page_id, status, label, template_id, snapshot, created_by)
    VALUES (?, 'active', ?, ?, ?, ?)
  `).run(
    current.page.id,
    req.body?.label || `Safe Rebuild ${new Date().toISOString()}`,
    templateId,
    JSON.stringify(draft),
    req.user.id
  );

  res.json({ ok: true, data: { draft_id: result.lastInsertRowid, draft } });
});

router.get('/admin/rebuild-drafts/:draftId', verify, requireRole(...EDIT), (req, res) => {
  const draft = db.prepare('SELECT * FROM link_page_rebuild_drafts WHERE id = ?').get(req.params.draftId);
  if (!draft) return res.status(404).json({ ok: false, error: 'Draft not found' });
  res.json({ ok: true, data: { draft: { ...draft, snapshot: JSON.parse(draft.snapshot) } } });
});

router.put('/admin/rebuild-drafts/:draftId', verify, requireRole(...EDIT), (req, res) => {
  const draft = db.prepare('SELECT * FROM link_page_rebuild_drafts WHERE id = ? AND status = ?').get(req.params.draftId, 'active');
  if (!draft) return res.status(404).json({ ok: false, error: 'Active draft not found' });
  const snap = normalizeDraftSnapshot(req.body?.snapshot, draft.page_id);
  db.prepare(`
    UPDATE link_page_rebuild_drafts
    SET snapshot = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(JSON.stringify(snap), draft.id);
  res.json({ ok: true, data: { draft: snap } });
});

router.get('/admin/rebuild-drafts/:draftId/diff', verify, requireRole(...EDIT), (req, res) => {
  const draftRow = db.prepare('SELECT * FROM link_page_rebuild_drafts WHERE id = ?').get(req.params.draftId);
  if (!draftRow) return res.status(404).json({ ok: false, error: 'Draft not found' });
  const live = getPageWithButtons(draftRow.page_id);
  const draft = JSON.parse(draftRow.snapshot);
  res.json({ ok: true, data: { diff: diffSnapshots(live, draft), draft } });
});

router.post('/admin/rebuild-drafts/:draftId/publish', verify, requireRole(...EDIT), (req, res) => {
  const draftRow = db.prepare('SELECT * FROM link_page_rebuild_drafts WHERE id = ? AND status = ?').get(req.params.draftId, 'active');
  if (!draftRow) return res.status(404).json({ ok: false, error: 'Active draft not found' });
  const live = getPageWithButtons(draftRow.page_id);
  if (!live) return res.status(404).json({ ok: false, error: 'Page not found' });
  const draft = normalizeDraftSnapshot(JSON.parse(draftRow.snapshot), draftRow.page_id);
  const diff = diffSnapshots(live, draft);

  if ((diff.removed_count >= live.buttons.length && live.buttons.length > 0) && req.body?.confirm_text !== 'PUBLISH') {
    return res.status(409).json({ ok: false, error: 'Type PUBLISH to replace all live CTAs' });
  }

  insertPageSnapshot(live.page.id, 'pre_rebuild_publish', req, 'Before publishing Safe Rebuild');

  try {
    db.exec('BEGIN');
    db.prepare(`
      UPDATE pages SET title = ?, slug = ?, headline = ?, store_slug = ?,
        is_active = 1, sort_order = ?, theme = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      draft.page.title, draft.page.slug, draft.page.headline, draft.page.store_slug,
      draft.page.sort_order || 0, draft.page.theme || null, draft.page.id
    );
    db.prepare('DELETE FROM buttons WHERE page_id = ?').run(draft.page.id);
    const ins = db.prepare(`
      INSERT INTO buttons
        (page_id, label, url, icon, sort_order, is_active, is_featured, enabled,
         opens_in_new_tab, start_at, end_at, subtitle, style_variant, icon_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    draft.buttons.forEach((b, index) => {
      ins.run(
        draft.page.id, b.label, b.url, b.icon || null, b.sort_order ?? index,
        b.is_active, b.is_featured, b.enabled, b.opens_in_new_tab,
        b.start_at, b.end_at, b.subtitle, b.style_variant, b.icon_key
      );
    });
    db.prepare(`
      UPDATE link_page_rebuild_drafts
      SET status = 'published', updated_at = datetime('now')
      WHERE id = ?
    `).run(draftRow.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  res.json({ ok: true, data: { diff } });
});

router.post('/admin/rebuild-drafts/:draftId/discard', verify, requireRole(...EDIT), (req, res) => {
  const draft = db.prepare('SELECT * FROM link_page_rebuild_drafts WHERE id = ?').get(req.params.draftId);
  if (!draft) return res.status(404).json({ ok: false, error: 'Draft not found' });
  db.prepare(`
    UPDATE link_page_rebuild_drafts
    SET status = 'discarded', updated_at = datetime('now')
    WHERE id = ?
  `).run(draft.id);
  res.json({ ok: true });
});

// ── Media Library ─────────────────────────────────────────────────────

const multer = require('multer');
const uploadDir = path.join(__dirname, '..', '..', 'images', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9-_]/gi, '-').substring(0, 60);
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|svg|pdf)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('File type not allowed'));
  }
});

router.get('/admin/media', verify, (req, res) => {
  const folder = req.query.folder || null;
  let media;
  if (folder) {
    media = db.prepare('SELECT * FROM media WHERE folder = ? ORDER BY created_at DESC').all(folder);
  } else {
    media = db.prepare('SELECT * FROM media ORDER BY created_at DESC LIMIT 100').all();
  }
  res.json({ ok: true, data: { media } });
});

router.post('/admin/media/upload', verify, requireRole(...EDIT), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'No file uploaded' });

  const url = `/images/uploads/${req.file.filename}`;
  const result = db.prepare(
    `INSERT INTO media (filename, original_name, mime_type, size_bytes, alt_text, folder, url, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.file.filename,
    req.file.originalname,
    req.file.mimetype,
    req.file.size,
    req.body.alt_text || null,
    req.body.folder || 'general',
    url,
    req.user.id
  );

  res.json({ ok: true, data: { id: result.lastInsertRowid, url, filename: req.file.filename } });
});

router.delete('/admin/media/:id', verify, requireRole(...MGR), (req, res) => {
  const media = db.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id);
  if (!media) return res.status(404).json({ ok: false, error: 'Media not found' });

  // Delete file from disk
  const filePath = path.join(uploadDir, media.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  db.prepare('DELETE FROM media WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Publish Confirmation (returns what will change) ───────────────────

router.get('/admin/pages/:id/publish-preview', verify, requireRole(...EDIT), (req, res) => {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (!page) return res.status(404).json({ ok: false, error: 'Page not found' });

  const buttons = db.prepare(
    'SELECT * FROM buttons WHERE page_id = ? AND is_active = 1 AND enabled = 1 ORDER BY sort_order'
  ).all(req.params.id);

  const lastRevision = db.prepare(
    `SELECT created_at, user_name FROM revisions
     WHERE entity_type = 'page' AND entity_id = ? AND action = 'publish'
     ORDER BY created_at DESC LIMIT 1`
  ).get(req.params.id);

  res.json({
    ok: true,
    data: {
      page,
      live_buttons: buttons,
      live_button_count: buttons.length,
      last_published: lastRevision?.created_at || null,
      last_published_by: lastRevision?.user_name || null,
    }
  });
});

router.post('/admin/pages/:id/publish', verify, requireRole(...EDIT), (req, res) => {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (!page) return res.status(404).json({ ok: false, error: 'Page not found' });

  insertPageSnapshot(page.id, 'pre_publish', req, 'Before publishing page');

  // Save revision snapshot before publish
  db.prepare(
    `INSERT INTO revisions (entity_type, entity_id, action, snapshot, user_id, user_name)
     VALUES (?, ?, 'publish', ?, ?, ?)`
  ).run('page', page.id, JSON.stringify(page), req.user.id, req.user.name);

  // Activate page
  db.prepare(`UPDATE pages SET is_active = 1, updated_at = datetime('now') WHERE id = ?`).run(page.id);

  res.json({ ok: true, message: 'Published successfully' });
});

router.post('/admin/pages/:id/unpublish', verify, requireRole(...EDIT), (req, res) => {
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (!page) return res.status(404).json({ ok: false, error: 'Page not found' });

  insertPageSnapshot(page.id, 'pre_unpublish', req, 'Before unpublishing page');

  db.prepare(
    `INSERT INTO revisions (entity_type, entity_id, action, snapshot, user_id, user_name)
     VALUES (?, ?, 'unpublish', ?, ?, ?)`
  ).run('page', page.id, JSON.stringify(page), req.user.id, req.user.name);

  db.prepare(`UPDATE pages SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(page.id);

  res.json({ ok: true, message: 'Unpublished successfully' });
});

module.exports = router;
