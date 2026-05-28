'use strict';
/**
 * Production Operations Database Schema Extension
 * ─────────────────────────────────────────────────
 * Adds: publish_queue, audit_log, content_versions, scheduled_publishes,
 *       publish_snapshots, and soft-delete support across all entities.
 *
 * This module is loaded AFTER db.js and extends the existing schema.
 */
const db = require('./db');

// ── Content Versions (universal versioning for all content types) ──────
db.exec(`
CREATE TABLE IF NOT EXISTS content_versions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type   TEXT    NOT NULL,
  entity_id     INTEGER NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  status        TEXT    NOT NULL DEFAULT 'draft',
  snapshot      TEXT    NOT NULL,
  change_summary TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_by_name TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  published_at  TEXT,
  expired_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_content_versions_entity
  ON content_versions(entity_type, entity_id, status);
CREATE INDEX IF NOT EXISTS idx_content_versions_status
  ON content_versions(status, created_at);
`);

// ── Publish Queue (pending changes awaiting review/publish) ───────────
db.exec(`
CREATE TABLE IF NOT EXISTS publish_queue (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type   TEXT    NOT NULL,
  entity_id     INTEGER NOT NULL,
  action        TEXT    NOT NULL DEFAULT 'publish',
  status        TEXT    NOT NULL DEFAULT 'pending',
  priority      INTEGER NOT NULL DEFAULT 0,
  version_id    INTEGER REFERENCES content_versions(id),
  scheduled_for TEXT,
  expires_at    TEXT,
  change_summary TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_by_name TEXT,
  reviewed_by   INTEGER REFERENCES users(id),
  reviewed_at   TEXT,
  published_at  TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_publish_queue_status
  ON publish_queue(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_publish_queue_entity
  ON publish_queue(entity_type, entity_id, status);
`);

// ── Publish Snapshots (full system state before each publish) ─────────
db.exec(`
CREATE TABLE IF NOT EXISTS publish_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  label         TEXT,
  trigger_type  TEXT    NOT NULL DEFAULT 'manual',
  snapshot      TEXT    NOT NULL,
  entity_types  TEXT,
  entity_ids    TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_by_name TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  is_rollback_target INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_publish_snapshots_created
  ON publish_snapshots(created_at DESC);
`);

// ── Audit Log (comprehensive action tracking) ────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id),
  user_name     TEXT,
  user_email    TEXT,
  action        TEXT    NOT NULL,
  entity_type   TEXT,
  entity_id     INTEGER,
  entity_label  TEXT,
  details       TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_log_user
  ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON audit_log(action, created_at DESC);
`);

// ── Scheduled Actions (time-based publish/unpublish/expire) ──────────
db.exec(`
CREATE TABLE IF NOT EXISTS scheduled_actions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type   TEXT    NOT NULL,
  entity_id     INTEGER NOT NULL,
  action        TEXT    NOT NULL,
  scheduled_at  TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'pending',
  version_id    INTEGER REFERENCES content_versions(id),
  metadata      TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_by_name TEXT,
  executed_at   TEXT,
  error_message TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_pending
  ON scheduled_actions(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_actions_entity
  ON scheduled_actions(entity_type, entity_id, status);
`);

// ── Soft Delete Support — add deleted_at to core tables ──────────────
const softDeleteMigrations = [
    ['pages', 'deleted_at', 'TEXT'],
    ['pages', 'deleted_by', 'INTEGER'],
    ['buttons', 'deleted_at', 'TEXT'],
    ['buttons', 'deleted_by', 'INTEGER'],
    ['shortlinks', 'deleted_at', 'TEXT'],
    ['subscribers', 'deleted_at', 'TEXT'],
];
for (const [table, col, type] of softDeleteMigrations) {
    try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
        console.log(`[db-ops] Migration: added ${col} to ${table}`);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[db-ops] Migration warning:', e.message);
        }
    }
}

// ── Content Status Support — add status column to pages/buttons ──────
const statusMigrations = [
    ['pages', 'publish_status', "TEXT DEFAULT 'published'"],
    ['pages', 'last_published_at', 'TEXT'],
    ['pages', 'last_published_by', 'INTEGER'],
    ['buttons', 'publish_status', "TEXT DEFAULT 'published'"],
];
for (const [table, col, type] of statusMigrations) {
    try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
        console.log(`[db-ops] Migration: added ${col} to ${table}`);
    } catch (e) {
        if (!e.message.includes('duplicate column')) {
            console.warn('[db-ops] Migration warning:', e.message);
        }
    }
}

// ── Environment Metadata ─────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS deploy_metadata (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  version       TEXT    NOT NULL,
  commit_hash   TEXT,
  environment   TEXT    NOT NULL DEFAULT 'production',
  deployed_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  deployed_by   TEXT,
  build_manifest TEXT,
  notes         TEXT
);
`);

// ── Helper: Record audit log entry ───────────────────────────────────
function auditLog(req, action, entityType, entityId, entityLabel, details) {
    try {
        db.prepare(`
      INSERT INTO audit_log
        (user_id, user_name, user_email, action, entity_type, entity_id, entity_label, details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            req.user?.id || null,
            req.user?.name || null,
            req.user?.email || null,
            action,
            entityType || null,
            entityId || null,
            entityLabel || null,
            details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
            req.ip || req.headers?.['x-forwarded-for'] || null,
            req.headers?.['user-agent']?.substring(0, 200) || null
        );
    } catch (e) {
        console.error('[audit] Failed to write audit log:', e.message);
    }
}

// ── Helper: Create publish snapshot ──────────────────────────────────
function createPublishSnapshot(label, triggerType, entityTypes, entityIds, req) {
    const snapshot = {};

    // Capture full system state for the specified entity types
    if (!entityTypes || entityTypes.includes('pages')) {
        snapshot.pages = db.prepare('SELECT * FROM pages WHERE deleted_at IS NULL').all();
    }
    if (!entityTypes || entityTypes.includes('buttons')) {
        snapshot.buttons = db.prepare('SELECT * FROM buttons WHERE deleted_at IS NULL').all();
    }
    if (!entityTypes || entityTypes.includes('blog_posts')) {
        snapshot.blog_posts = db.prepare('SELECT * FROM blog_posts WHERE archived_at IS NULL').all();
    }
    if (!entityTypes || entityTypes.includes('shortlinks')) {
        snapshot.shortlinks = db.prepare('SELECT * FROM shortlinks WHERE deleted_at IS NULL').all();
    }
    if (!entityTypes || entityTypes.includes('settings')) {
        snapshot.settings = db.prepare('SELECT * FROM settings').all();
    }

    const result = db.prepare(`
    INSERT INTO publish_snapshots
      (label, trigger_type, snapshot, entity_types, entity_ids, created_by, created_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
        label || `Snapshot ${new Date().toISOString()}`,
        triggerType,
        JSON.stringify(snapshot),
        entityTypes ? JSON.stringify(entityTypes) : null,
        entityIds ? JSON.stringify(entityIds) : null,
        req?.user?.id || null,
        req?.user?.name || null
    );

    return result.lastInsertRowid;
}

// ── Helper: Create content version ───────────────────────────────────
function createContentVersion(entityType, entityId, snapshot, changeSummary, req) {
    // Get next version number
    const last = db.prepare(`
    SELECT MAX(version) AS v FROM content_versions
    WHERE entity_type = ? AND entity_id = ?
  `).get(entityType, entityId);
    const nextVersion = (last?.v || 0) + 1;

    const result = db.prepare(`
    INSERT INTO content_versions
      (entity_type, entity_id, version, status, snapshot, change_summary, created_by, created_by_name)
    VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)
  `).run(
        entityType,
        entityId,
        nextVersion,
        typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot),
        changeSummary || null,
        req?.user?.id || null,
        req?.user?.name || null
    );

    return { id: result.lastInsertRowid, version: nextVersion };
}

// ── Helper: Add to publish queue ─────────────────────────────────────
function addToPublishQueue(entityType, entityId, action, versionId, scheduledFor, expiresAt, changeSummary, req) {
    const result = db.prepare(`
    INSERT INTO publish_queue
      (entity_type, entity_id, action, version_id, scheduled_for, expires_at, change_summary, created_by, created_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
        entityType,
        entityId,
        action || 'publish',
        versionId || null,
        scheduledFor || null,
        expiresAt || null,
        changeSummary || null,
        req?.user?.id || null,
        req?.user?.name || null
    );

    return result.lastInsertRowid;
}

// ── Helper: Schedule an action ───────────────────────────────────────
function scheduleAction(entityType, entityId, action, scheduledAt, versionId, metadata, req) {
    const result = db.prepare(`
    INSERT INTO scheduled_actions
      (entity_type, entity_id, action, scheduled_at, version_id, metadata, created_by, created_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
        entityType,
        entityId,
        action,
        scheduledAt,
        versionId || null,
        metadata ? JSON.stringify(metadata) : null,
        req?.user?.id || null,
        req?.user?.name || null
    );

    return result.lastInsertRowid;
}

// ── Helper: Get pending publish queue items ──────────────────────────
function getPendingPublishQueue() {
    return db.prepare(`
    SELECT pq.*, cv.snapshot, cv.version
    FROM publish_queue pq
    LEFT JOIN content_versions cv ON pq.version_id = cv.id
    WHERE pq.status = 'pending'
    ORDER BY pq.priority DESC, pq.created_at ASC
  `).all();
}

// ── Helper: Impact analysis for deletion ─────────────────────────────
function analyzeDeleteImpact(entityType, entityId) {
    const impacts = [];

    if (entityType === 'page') {
        const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(entityId);
        if (!page) return { impacts: [], severity: 'none' };

        const buttonCount = db.prepare('SELECT COUNT(*) AS c FROM buttons WHERE page_id = ? AND deleted_at IS NULL').get(entityId).c;
        if (buttonCount > 0) impacts.push({ type: 'buttons', message: `${buttonCount} CTA buttons will be affected`, count: buttonCount });

        if (page.is_active) impacts.push({ type: 'live_page', message: 'This page is currently LIVE and visible to customers', severity: 'critical' });

        const analytics = db.prepare(`SELECT COUNT(*) AS c FROM analytics WHERE page_id = ? AND created_at >= datetime('now', '-30 days')`).get(entityId).c;
        if (analytics > 0) impacts.push({ type: 'analytics', message: `${analytics} clicks in the last 30 days`, count: analytics });

        const redirects = db.prepare('SELECT COUNT(*) AS c FROM redirects WHERE page_id = ?').get(entityId).c;
        if (redirects > 0) impacts.push({ type: 'redirects', message: `${redirects} redirects point to this page`, count: redirects });
    }

    if (entityType === 'button') {
        const button = db.prepare('SELECT b.*, p.title AS page_title, p.is_active AS page_active FROM buttons b JOIN pages p ON b.page_id = p.id WHERE b.id = ?').get(entityId);
        if (!button) return { impacts: [], severity: 'none' };

        if (button.page_active && button.is_active && button.enabled) {
            impacts.push({ type: 'live_button', message: `This CTA is currently LIVE on "${button.page_title}"`, severity: 'critical' });
        }

        const isProtected = ['main website', 'visit main website', 'order online', 'locations', 'get directions']
            .some(label => String(button.label || '').toLowerCase().includes(label));
        if (isProtected) impacts.push({ type: 'protected', message: 'This is a PROTECTED system CTA', severity: 'critical' });

        const clicks = db.prepare(`SELECT COUNT(*) AS c FROM analytics WHERE button_id = ? AND created_at >= datetime('now', '-30 days')`).get(entityId).c;
        if (clicks > 0) impacts.push({ type: 'analytics', message: `${clicks} clicks in the last 30 days`, count: clicks });
    }

    const severity = impacts.some(i => i.severity === 'critical') ? 'critical'
        : impacts.length > 0 ? 'warning' : 'safe';

    return { impacts, severity, entity_type: entityType, entity_id: entityId };
}

// ── Helper: Detect operational warnings ──────────────────────────────
function detectWarnings() {
    const warnings = [];
    const now = new Date().toISOString();

    // Overlapping scheduled actions
    const overlapping = db.prepare(`
    SELECT sa1.id AS id1, sa2.id AS id2, sa1.entity_type, sa1.entity_id, sa1.scheduled_at AS time1, sa2.scheduled_at AS time2
    FROM scheduled_actions sa1
    JOIN scheduled_actions sa2 ON sa1.entity_type = sa2.entity_type
      AND sa1.entity_id = sa2.entity_id
      AND sa1.id < sa2.id
      AND sa1.status = 'pending' AND sa2.status = 'pending'
      AND ABS(julianday(sa1.scheduled_at) - julianday(sa2.scheduled_at)) < 0.042
  `).all();
    if (overlapping.length > 0) {
        warnings.push({ type: 'overlapping_schedules', message: `${overlapping.length} overlapping scheduled actions detected`, severity: 'warning', details: overlapping });
    }

    // Expired but still active buttons
    const expiredButtons = db.prepare(`
    SELECT b.id, b.label, b.end_at, p.title AS page_title
    FROM buttons b JOIN pages p ON b.page_id = p.id
    WHERE b.end_at IS NOT NULL AND b.end_at < ? AND b.is_active = 1 AND b.enabled = 1 AND b.deleted_at IS NULL
  `).all(now);
    if (expiredButtons.length > 0) {
        warnings.push({ type: 'expired_active_buttons', message: `${expiredButtons.length} expired CTAs still active`, severity: 'warning', details: expiredButtons });
    }

    // Unpublished drafts older than 7 days
    const staleDrafts = db.prepare(`
    SELECT id, entity_type, entity_id, change_summary, created_at
    FROM content_versions
    WHERE status = 'draft' AND created_at < datetime('now', '-7 days')
    ORDER BY created_at ASC
    LIMIT 20
  `).all();
    if (staleDrafts.length > 0) {
        warnings.push({ type: 'stale_drafts', message: `${staleDrafts.length} unpublished drafts older than 7 days`, severity: 'info', details: staleDrafts });
    }

    // Active pages with no active buttons
    const emptyPages = db.prepare(`
    SELECT p.id, p.title, p.slug
    FROM pages p
    WHERE p.is_active = 1 AND p.deleted_at IS NULL
      AND (SELECT COUNT(*) FROM buttons b WHERE b.page_id = p.id AND b.is_active = 1 AND b.enabled = 1 AND b.deleted_at IS NULL) = 0
  `).all();
    if (emptyPages.length > 0) {
        warnings.push({ type: 'empty_live_pages', message: `${emptyPages.length} live pages have no active CTAs`, severity: 'critical', details: emptyPages });
    }

    // Duplicate button labels on same page
    const duplicates = db.prepare(`
    SELECT page_id, LOWER(label) AS lbl, COUNT(*) AS cnt
    FROM buttons
    WHERE is_active = 1 AND deleted_at IS NULL
    GROUP BY page_id, LOWER(label)
    HAVING cnt > 1
  `).all();
    if (duplicates.length > 0) {
        warnings.push({ type: 'duplicate_buttons', message: `${duplicates.length} duplicate CTA labels detected`, severity: 'warning', details: duplicates });
    }

    return warnings;
}

module.exports = {
    auditLog,
    createPublishSnapshot,
    createContentVersion,
    addToPublishQueue,
    scheduleAction,
    getPendingPublishQueue,
    analyzeDeleteImpact,
    detectWarnings,
};
