'use strict';
const router = require('express').Router();
const db = require('../db');
const ops = require('../db-operations');
const { verify, requireRole } = require('../middleware/auth');

const MGR = ['super_admin', 'marketing_manager'];
const EDIT = ['super_admin', 'marketing_manager', 'store_manager'];

// ── Publish Queue ─────────────────────────────────────────────────────

router.get('/publish-queue', verify, requireRole(...MGR), (req, res) => {
    const items = ops.getPendingPublishQueue();
    res.json({ ok: true, data: { items, count: items.length } });
});

router.post('/publish-queue', verify, requireRole(...MGR), (req, res) => {
    const { entity_type, entity_id, action, scheduled_for, expires_at, change_summary } = req.body || {};
    if (!entity_type || !entity_id) {
        return res.status(400).json({ ok: false, error: 'entity_type and entity_id required' });
    }
    const id = ops.addToPublishQueue(entity_type, entity_id, action, null, scheduled_for, expires_at, change_summary, req);
    ops.auditLog(req, 'queue_add', entity_type, entity_id, change_summary, { action, scheduled_for });
    res.json({ ok: true, data: { id } });
});

router.post('/publish-queue/:id/approve', verify, requireRole(...MGR), (req, res) => {
    const item = db.prepare('SELECT * FROM publish_queue WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ ok: false, error: 'Queue item not found' });
    db.prepare(`UPDATE publish_queue SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(req.user.id, item.id);
    ops.auditLog(req, 'queue_approve', item.entity_type, item.entity_id, null, { queue_id: item.id });
    res.json({ ok: true });
});

router.post('/publish-queue/:id/reject', verify, requireRole(...MGR), (req, res) => {
    const item = db.prepare('SELECT * FROM publish_queue WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ ok: false, error: 'Queue item not found' });
    db.prepare(`UPDATE publish_queue SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(req.user.id, item.id);
    ops.auditLog(req, 'queue_reject', item.entity_type, item.entity_id, null, { queue_id: item.id, reason: req.body?.reason });
    res.json({ ok: true });
});

router.post('/publish-queue/:id/cancel', verify, requireRole(...EDIT), (req, res) => {
    const item = db.prepare('SELECT * FROM publish_queue WHERE id = ?').get(req.params.id);
    if (!item) return res.status(404).json({ ok: false, error: 'Queue item not found' });
    if (item.status !== 'pending' && item.status !== 'approved') {
        return res.status(409).json({ ok: false, error: 'Can only cancel pending or approved items' });
    }
    db.prepare(`UPDATE publish_queue SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(item.id);
    ops.auditLog(req, 'queue_cancel', item.entity_type, item.entity_id, null, { queue_id: item.id });
    res.json({ ok: true });
});

// ── Scheduling ────────────────────────────────────────────────────────

router.get('/scheduled', verify, requireRole(...EDIT), (req, res) => {
    const actions = db.prepare(`
    SELECT sa.*, u.name AS user_name
    FROM scheduled_actions sa
    LEFT JOIN users u ON sa.created_by = u.id
    WHERE sa.status = 'pending'
    ORDER BY sa.scheduled_at ASC
  `).all();
    res.json({ ok: true, data: { actions } });
});

router.post('/schedule', verify, requireRole(...MGR), (req, res) => {
    const { entity_type, entity_id, action, scheduled_at, expires_at, metadata } = req.body || {};
    if (!entity_type || !entity_id || !action || !scheduled_at) {
        return res.status(400).json({ ok: false, error: 'entity_type, entity_id, action, and scheduled_at required' });
    }
    const now = new Date().toISOString();
    if (scheduled_at <= now) {
        return res.status(400).json({ ok: false, error: 'scheduled_at must be in the future' });
    }
    const id = ops.scheduleAction(entity_type, entity_id, action, scheduled_at, null, { expires_at, ...metadata }, req);
    ops.auditLog(req, 'schedule_create', entity_type, entity_id, null, { action, scheduled_at, expires_at });
    res.json({ ok: true, data: { id, scheduled_at } });
});

router.delete('/scheduled/:id', verify, requireRole(...MGR), (req, res) => {
    const action = db.prepare('SELECT * FROM scheduled_actions WHERE id = ? AND status = ?').get(req.params.id, 'pending');
    if (!action) return res.status(404).json({ ok: false, error: 'Scheduled action not found or already executed' });
    db.prepare(`UPDATE scheduled_actions SET status = 'cancelled' WHERE id = ?`).run(action.id);
    ops.auditLog(req, 'schedule_cancel', action.entity_type, action.entity_id, null, { schedule_id: action.id });
    res.json({ ok: true });
});

router.get('/timeline', verify, requireRole(...EDIT), (req, res) => {
    const days = parseInt(req.query.days) || 14;
    const upcoming = db.prepare(`
    SELECT sa.*, u.name AS user_name
    FROM scheduled_actions sa
    LEFT JOIN users u ON sa.created_by = u.id
    WHERE sa.status = 'pending' AND sa.scheduled_at <= datetime('now', '+${days} days')
    ORDER BY sa.scheduled_at ASC
  `).all();
    const recent = db.prepare(`
    SELECT sa.*, u.name AS user_name
    FROM scheduled_actions sa
    LEFT JOIN users u ON sa.created_by = u.id
    WHERE sa.status = 'executed' AND sa.executed_at >= datetime('now', '-7 days')
    ORDER BY sa.executed_at DESC
    LIMIT 20
  `).all();
    res.json({ ok: true, data: { upcoming, recent } });
});

// ── Snapshots & Rollback ──────────────────────────────────────────────

router.get('/snapshots', verify, requireRole(...MGR), (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const snapshots = db.prepare(`
    SELECT id, label, trigger_type, entity_types, created_by_name, created_at, is_rollback_target
    FROM publish_snapshots
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
    res.json({ ok: true, data: { snapshots } });
});

router.get('/snapshots/:id', verify, requireRole(...MGR), (req, res) => {
    const snap = db.prepare('SELECT * FROM publish_snapshots WHERE id = ?').get(req.params.id);
    if (!snap) return res.status(404).json({ ok: false, error: 'Snapshot not found' });
    res.json({ ok: true, data: { snapshot: { ...snap, snapshot: JSON.parse(snap.snapshot) } } });
});

router.post('/snapshots', verify, requireRole(...MGR), (req, res) => {
    const { label } = req.body || {};
    const id = ops.createPublishSnapshot(label || 'Manual snapshot', 'manual', null, null, req);
    ops.auditLog(req, 'snapshot_create', null, null, label, { snapshot_id: id });
    res.json({ ok: true, data: { id } });
});

router.post('/snapshots/:id/rollback', verify, requireRole(...MGR), (req, res) => {
    const snap = db.prepare('SELECT * FROM publish_snapshots WHERE id = ?').get(req.params.id);
    if (!snap) return res.status(404).json({ ok: false, error: 'Snapshot not found' });

    // Create a pre-rollback snapshot first
    ops.createPublishSnapshot('Pre-rollback snapshot', 'pre_rollback', null, null, req);

    const data = JSON.parse(snap.snapshot);

    try {
        db.exec('BEGIN');

        // Restore pages
        if (data.pages) {
            db.prepare('DELETE FROM pages').run();
            const ins = db.prepare(`INSERT INTO pages (id, title, slug, headline, store_slug, is_active, sort_order, theme, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const p of data.pages) {
                ins.run(p.id, p.title, p.slug, p.headline, p.store_slug, p.is_active, p.sort_order, p.theme, p.created_at, p.updated_at);
            }
        }

        // Restore buttons
        if (data.buttons) {
            db.prepare('DELETE FROM buttons').run();
            const ins = db.prepare(`INSERT INTO buttons (id, page_id, label, url, icon, sort_order, is_active, is_featured, enabled, opens_in_new_tab, start_at, end_at, subtitle, style_variant, icon_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const b of data.buttons) {
                ins.run(b.id, b.page_id, b.label, b.url, b.icon, b.sort_order, b.is_active, b.is_featured, b.enabled, b.opens_in_new_tab, b.start_at, b.end_at, b.subtitle, b.style_variant, b.icon_key, b.created_at, b.updated_at);
            }
        }

        // Restore blog posts
        if (data.blog_posts) {
            db.prepare('DELETE FROM blog_posts').run();
            const ins = db.prepare(`INSERT INTO blog_posts (id, title, slug, status, content, excerpt, cover_image, author_id, published_at, scheduled_at, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            for (const bp of data.blog_posts) {
                ins.run(bp.id, bp.title, bp.slug, bp.status, bp.content, bp.excerpt, bp.cover_image, bp.author_id, bp.published_at, bp.scheduled_at, bp.archived_at, bp.created_at, bp.updated_at);
            }
        }

        // Restore settings
        if (data.settings) {
            db.prepare('DELETE FROM settings').run();
            const ins = db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)`);
            for (const s of data.settings) {
                ins.run(s.key, s.value, s.updated_at);
            }
        }

        db.exec('COMMIT');
    } catch (e) {
        db.exec('ROLLBACK');
        return res.status(500).json({ ok: false, error: 'Rollback failed: ' + e.message });
    }

    ops.auditLog(req, 'rollback', null, null, snap.label, { snapshot_id: snap.id, trigger_type: snap.trigger_type });
    res.json({ ok: true, message: 'Rollback completed successfully', data: { restored_from: snap.id, label: snap.label } });
});

// ── Preview System ────────────────────────────────────────────────────

router.get('/preview/page/:id', verify, (req, res) => {
    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
    if (!page) return res.status(404).json({ ok: false, error: 'Page not found' });

    const buttons = db.prepare(
        'SELECT * FROM buttons WHERE page_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC'
    ).all(page.id);

    // If preview_at is specified, filter buttons by schedule
    const previewAt = req.query.at || new Date().toISOString();
    const activeButtons = buttons.filter(b => {
        if (!b.is_active || !b.enabled) return false;
        if (b.start_at && b.start_at > previewAt) return false;
        if (b.end_at && b.end_at < previewAt) return false;
        return true;
    });

    res.json({
        ok: true,
        data: {
            page,
            buttons: activeButtons,
            all_buttons: buttons,
            preview_at: previewAt,
            is_future_preview: previewAt > new Date().toISOString(),
        }
    });
});

router.get('/preview/scheduled', verify, requireRole(...EDIT), (req, res) => {
    const targetTime = req.query.at;
    if (!targetTime) return res.status(400).json({ ok: false, error: 'at parameter required (ISO datetime)' });

    // Get all scheduled actions that would have executed by target time
    const actions = db.prepare(`
    SELECT * FROM scheduled_actions
    WHERE status = 'pending' AND scheduled_at <= ?
    ORDER BY scheduled_at ASC
  `).all(targetTime);

    // Get current state of pages
    const pages = db.prepare('SELECT * FROM pages WHERE deleted_at IS NULL').all();
    const buttons = db.prepare('SELECT * FROM buttons WHERE deleted_at IS NULL ORDER BY sort_order').all();

    res.json({
        ok: true,
        data: {
            preview_at: targetTime,
            pending_actions: actions,
            current_pages: pages,
            current_buttons: buttons.filter(b => {
                if (!b.is_active || !b.enabled) return false;
                if (b.start_at && b.start_at > targetTime) return false;
                if (b.end_at && b.end_at < targetTime) return false;
                return true;
            }),
        }
    });
});

// ── Content Versions ──────────────────────────────────────────────────

router.get('/versions/:type/:id', verify, (req, res) => {
    const versions = db.prepare(`
    SELECT id, version, status, change_summary, created_by_name, created_at, published_at, expired_at
    FROM content_versions
    WHERE entity_type = ? AND entity_id = ?
    ORDER BY version DESC
    LIMIT 30
  `).all(req.params.type, req.params.id);
    res.json({ ok: true, data: { versions } });
});

router.get('/versions/detail/:versionId', verify, (req, res) => {
    const v = db.prepare('SELECT * FROM content_versions WHERE id = ?').get(req.params.versionId);
    if (!v) return res.status(404).json({ ok: false, error: 'Version not found' });
    res.json({ ok: true, data: { version: { ...v, snapshot: JSON.parse(v.snapshot) } } });
});

router.post('/versions', verify, requireRole(...EDIT), (req, res) => {
    const { entity_type, entity_id, snapshot, change_summary } = req.body || {};
    if (!entity_type || !entity_id || !snapshot) {
        return res.status(400).json({ ok: false, error: 'entity_type, entity_id, and snapshot required' });
    }
    const result = ops.createContentVersion(entity_type, entity_id, snapshot, change_summary, req);
    ops.auditLog(req, 'version_create', entity_type, entity_id, change_summary, { version: result.version });
    res.json({ ok: true, data: result });
});

// ── Audit Log ─────────────────────────────────────────────────────────

router.get('/audit-log', verify, requireRole(...MGR), (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const entityType = req.query.entity_type;
    const entityId = req.query.entity_id;

    let query = 'SELECT * FROM audit_log';
    const params = [];

    if (entityType && entityId) {
        query += ' WHERE entity_type = ? AND entity_id = ?';
        params.push(entityType, entityId);
    } else if (entityType) {
        query += ' WHERE entity_type = ?';
        params.push(entityType);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const logs = db.prepare(query).all(...params);
    const total = db.prepare('SELECT COUNT(*) AS c FROM audit_log').get().c;
    res.json({ ok: true, data: { logs, total, limit, offset } });
});

// ── Operational Warnings ──────────────────────────────────────────────

router.get('/warnings', verify, requireRole(...EDIT), (req, res) => {
    const warnings = ops.detectWarnings();
    res.json({ ok: true, data: { warnings, count: warnings.length } });
});

// ── Safe Delete (Archive) ─────────────────────────────────────────────

router.get('/delete-impact/:type/:id', verify, requireRole(...EDIT), (req, res) => {
    const impact = ops.analyzeDeleteImpact(req.params.type, parseInt(req.params.id));
    res.json({ ok: true, data: impact });
});

router.post('/archive/:type/:id', verify, requireRole(...MGR), (req, res) => {
    const { type, id } = req.params;
    const entityId = parseInt(id);

    if (type === 'page') {
        const page = db.prepare('SELECT * FROM pages WHERE id = ? AND deleted_at IS NULL').get(entityId);
        if (!page) return res.status(404).json({ ok: false, error: 'Page not found' });
        ops.createPublishSnapshot(`Before archiving page: ${page.title}`, 'pre_archive', ['pages', 'buttons'], [entityId], req);
        db.prepare(`UPDATE pages SET deleted_at = datetime('now'), deleted_by = ?, is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(req.user.id, entityId);
        db.prepare(`UPDATE buttons SET deleted_at = datetime('now'), deleted_by = ? WHERE page_id = ?`).run(req.user.id, entityId);
        ops.auditLog(req, 'archive', 'page', entityId, page.title, null);
    } else if (type === 'button') {
        const button = db.prepare('SELECT * FROM buttons WHERE id = ? AND deleted_at IS NULL').get(entityId);
        if (!button) return res.status(404).json({ ok: false, error: 'Button not found' });
        db.prepare(`UPDATE buttons SET deleted_at = datetime('now'), deleted_by = ?, is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(req.user.id, entityId);
        ops.auditLog(req, 'archive', 'button', entityId, button.label, null);
    } else if (type === 'shortlink') {
        const sl = db.prepare('SELECT * FROM shortlinks WHERE id = ? AND deleted_at IS NULL').get(entityId);
        if (!sl) return res.status(404).json({ ok: false, error: 'Shortlink not found' });
        db.prepare(`UPDATE shortlinks SET deleted_at = datetime('now'), is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(entityId);
        ops.auditLog(req, 'archive', 'shortlink', entityId, sl.label || sl.code, null);
    } else {
        return res.status(400).json({ ok: false, error: 'Invalid entity type' });
    }

    res.json({ ok: true, message: 'Archived successfully' });
});

router.post('/restore/:type/:id', verify, requireRole(...MGR), (req, res) => {
    const { type, id } = req.params;
    const entityId = parseInt(id);

    if (type === 'page') {
        db.prepare(`UPDATE pages SET deleted_at = NULL, deleted_by = NULL, updated_at = datetime('now') WHERE id = ?`).run(entityId);
        db.prepare(`UPDATE buttons SET deleted_at = NULL, deleted_by = NULL WHERE page_id = ?`).run(entityId);
        ops.auditLog(req, 'restore', 'page', entityId, null, null);
    } else if (type === 'button') {
        db.prepare(`UPDATE buttons SET deleted_at = NULL, deleted_by = NULL, updated_at = datetime('now') WHERE id = ?`).run(entityId);
        ops.auditLog(req, 'restore', 'button', entityId, null, null);
    } else if (type === 'shortlink') {
        db.prepare(`UPDATE shortlinks SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?`).run(entityId);
        ops.auditLog(req, 'restore', 'shortlink', entityId, null, null);
    } else {
        return res.status(400).json({ ok: false, error: 'Invalid entity type' });
    }

    res.json({ ok: true, message: 'Restored successfully' });
});

router.get('/archived', verify, requireRole(...MGR), (req, res) => {
    const pages = db.prepare('SELECT * FROM pages WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all();
    const buttons = db.prepare('SELECT b.*, p.title AS page_title FROM buttons b LEFT JOIN pages p ON b.page_id = p.id WHERE b.deleted_at IS NOT NULL ORDER BY b.deleted_at DESC').all();
    const shortlinks = db.prepare('SELECT * FROM shortlinks WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all();
    res.json({ ok: true, data: { pages, buttons, shortlinks } });
});

// ── Scheduler Status ──────────────────────────────────────────────────

router.get('/scheduler-status', verify, requireRole(...MGR), (req, res) => {
    const scheduler = require('../scheduler');
    res.json({ ok: true, data: scheduler.getStatus() });
});

// ── Environment & Deploy Info ─────────────────────────────────────────

router.get('/environment', verify, (req, res) => {
    const latest = db.prepare('SELECT * FROM deploy_metadata ORDER BY deployed_at DESC LIMIT 1').get();
    const fs = require('fs');
    const path = require('path');
    let manifest = null;
    try {
        const manifestPath = path.join(__dirname, '..', '..', 'links-admin', 'deploy-manifest.json');
        if (fs.existsSync(manifestPath)) {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        }
    } catch (e) { /* ignore */ }

    res.json({
        ok: true,
        data: {
            environment: process.env.NODE_ENV || 'production',
            deploy: latest || null,
            manifest,
            server_started: new Date(process.uptime() * -1000 + Date.now()).toISOString(),
            node_version: process.version,
        }
    });
});

// ── Publish Diff (compare current vs pending) ─────────────────────────

router.get('/publish-diff', verify, requireRole(...MGR), (req, res) => {
    const pending = db.prepare(`
    SELECT pq.*, cv.snapshot AS version_snapshot
    FROM publish_queue pq
    LEFT JOIN content_versions cv ON pq.version_id = cv.id
    WHERE pq.status IN ('pending', 'approved')
    ORDER BY pq.created_at ASC
  `).all();

    const changes = pending.map(item => {
        let current = null;
        if (item.entity_type === 'page') {
            current = db.prepare('SELECT * FROM pages WHERE id = ?').get(item.entity_id);
        } else if (item.entity_type === 'button') {
            current = db.prepare('SELECT * FROM buttons WHERE id = ?').get(item.entity_id);
        } else if (item.entity_type === 'blog_post') {
            current = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(item.entity_id);
        }
        return {
            queue_item: item,
            current_state: current,
            pending_state: item.version_snapshot ? JSON.parse(item.version_snapshot) : null,
        };
    });

    res.json({ ok: true, data: { changes, count: changes.length } });
});

module.exports = router;
