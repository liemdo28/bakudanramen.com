'use strict';
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'bakudan.db'));

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    UNIQUE NOT NULL,
  password_hash TEXT    NOT NULL,
  name          TEXT,
  role          TEXT    NOT NULL DEFAULT 'viewer',
  store_slug    TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  slug        TEXT    UNIQUE NOT NULL,
  headline    TEXT,
  store_slug  TEXT,
  is_active   INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  theme       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS buttons (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id          INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  label            TEXT    NOT NULL,
  url              TEXT    NOT NULL,
  icon             TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,
  is_featured      INTEGER NOT NULL DEFAULT 0,
  enabled          INTEGER NOT NULL DEFAULT 1,
  opens_in_new_tab INTEGER NOT NULL DEFAULT 1,
  start_at         TEXT,
  end_at           TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS redirects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id      INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  source       TEXT    NOT NULL,
  destination  TEXT    NOT NULL,
  is_permanent INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shortlinks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT    UNIQUE NOT NULL,
  destination  TEXT    NOT NULL,
  label        TEXT,
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  clicks       INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analytics (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id      INTEGER REFERENCES pages(id)      ON DELETE SET NULL,
  button_id    INTEGER REFERENCES buttons(id)    ON DELETE SET NULL,
  shortlink_id INTEGER REFERENCES shortlinks(id) ON DELETE SET NULL,
  event_type   TEXT    NOT NULL DEFAULT 'click',
  referrer     TEXT,
  user_agent   TEXT,
  ip           TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    UNIQUE NOT NULL,
  name       TEXT,
  source     TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  slug         TEXT    UNIQUE NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'draft',
  content      TEXT,
  excerpt      TEXT,
  cover_image  TEXT,
  author_id    INTEGER REFERENCES users(id),
  published_at TEXT,
  scheduled_at TEXT,
  archived_at  TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
`);

// Migration: add opens_in_new_tab column if it doesn't exist
try {
  db.exec(`ALTER TABLE buttons ADD COLUMN opens_in_new_tab INTEGER NOT NULL DEFAULT 1`);
  console.log('[db] Migration: added opens_in_new_tab column to buttons table');
} catch (e) {
  if (!e.message.includes('duplicate column')) {
    console.warn('[db] Migration warning:', e.message);
  }
}

// Migration: revisions table for publish workflow & rollback
db.exec(`
CREATE TABLE IF NOT EXISTS revisions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT    NOT NULL,
  entity_id   INTEGER NOT NULL,
  action      TEXT    NOT NULL DEFAULT 'update',
  snapshot    TEXT    NOT NULL,
  user_id     INTEGER REFERENCES users(id),
  user_name   TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_revisions_entity ON revisions(entity_type, entity_id);
`);

// Migration: safe rebuild snapshots and isolated draft workspaces
db.exec(`
CREATE TABLE IF NOT EXISTS link_page_snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id     INTEGER,
  page_slug   TEXT,
  page_title  TEXT,
  action      TEXT    NOT NULL,
  label       TEXT,
  snapshot    TEXT    NOT NULL,
  user_id     INTEGER REFERENCES users(id),
  user_name   TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_link_page_snapshots_page
  ON link_page_snapshots(page_id, created_at);

CREATE TABLE IF NOT EXISTS link_page_rebuild_drafts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id     INTEGER NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'active',
  label       TEXT,
  template_id TEXT,
  snapshot    TEXT    NOT NULL,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_link_page_rebuild_drafts_page
  ON link_page_rebuild_drafts(page_id, status, updated_at);
`);

// Migration: media library table
db.exec(`
CREATE TABLE IF NOT EXISTS media (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT    NOT NULL,
  original_name TEXT,
  mime_type   TEXT,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  alt_text    TEXT,
  folder      TEXT    DEFAULT 'general',
  url         TEXT    NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
`);

// Migration: add subtitle, style_variant, icon_key columns to buttons if missing
const buttonMigrations = [
  ['subtitle', 'TEXT'],
  ['style_variant', "TEXT DEFAULT 'secondary'"],
  ['icon_key', 'TEXT'],
];
for (const [col, type] of buttonMigrations) {
  try {
    db.exec(`ALTER TABLE buttons ADD COLUMN ${col} ${type}`);
    console.log(`[db] Migration: added ${col} to buttons`);
  } catch (e) {
    if (!e.message.includes('duplicate column')) console.warn('[db] Migration:', e.message);
  }
}

// Seed default admin user — requires ADMIN_EMAIL + ADMIN_PASSWORD env vars
const { c: userCount } = db.prepare('SELECT COUNT(*) AS c FROM users').get();
if (userCount === 0) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error(
      '[db] First-run setup: ADMIN_EMAIL and ADMIN_PASSWORD environment variables ' +
      'must be set before the database is initialized. No default credentials exist.'
    );
  }
  if (adminPassword.length < 16) {
    throw new Error('[db] ADMIN_PASSWORD must be at least 16 characters.');
  }
  const hash = bcrypt.hashSync(adminPassword, 12);
  db.prepare(
    `INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)`
  ).run(adminEmail.toLowerCase().trim(), hash, 'Administrator', 'super_admin');
  console.log('[db] Admin user created for:', adminEmail);
}

// Seed default settings
const { c: settingCount } = db.prepare('SELECT COUNT(*) AS c FROM settings').get();
if (settingCount === 0) {
  const ins = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  [
    ['site_name', 'Bakudan Ramen'],
    ['site_url', 'https://bakudanramen.com'],
    ['theme_primary', '#dc2626'],
    ['theme_bg', '#0f172a'],
    ['footer_text', '© Bakudan Ramen. All rights reserved.'],
    ['show_subscriber_form', '0'],
  ].forEach(([k, v]) => ins.run(k, v));
}

module.exports = db;
