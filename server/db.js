'use strict';
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path   = require('path');
const fs     = require('fs');

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
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id     INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  label       TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  icon        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  is_featured INTEGER NOT NULL DEFAULT 0,
  enabled     INTEGER NOT NULL DEFAULT 1,
  start_at    TEXT,
  end_at      TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
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

// Seed default admin user
const { c: userCount } = db.prepare('SELECT COUNT(*) AS c FROM users').get();
if (userCount === 0) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    `INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)`
  ).run('admin@bakudanramen.com', hash, 'Administrator', 'super_admin');
  console.log('[db] Seeded default admin → admin@bakudanramen.com / admin123');
  console.log('[db] IMPORTANT: Change this password immediately after first login.');
}

// Seed default settings
const { c: settingCount } = db.prepare('SELECT COUNT(*) AS c FROM settings').get();
if (settingCount === 0) {
  const ins = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  [
    ['site_name',            'Bakudan Ramen'],
    ['site_url',             'https://bakudanramen.com'],
    ['theme_primary',        '#dc2626'],
    ['theme_bg',             '#0f172a'],
    ['footer_text',          '© Bakudan Ramen. All rights reserved.'],
    ['show_subscriber_form', '0'],
  ].forEach(([k, v]) => ins.run(k, v));
}

module.exports = db;
