'use strict';
/**
 * Scheduling Engine
 * ─────────────────────────────────────────────────
 * Processes scheduled actions (publish, unpublish, expire)
 * and publish queue items at their scheduled times.
 *
 * Runs every minute via node-cron.
 */
const db = require('./db');
const ops = require('./db-operations');

function processScheduledActions() {
    const now = new Date().toISOString();
    const pending = db.prepare(`
    SELECT * FROM scheduled_actions
    WHERE status = 'pending' AND scheduled_at <= ?
    ORDER BY scheduled_at ASC
  `).all(now);

    if (pending.length === 0) return;

    console.log(`[scheduler] Processing ${pending.length} scheduled action(s)`);

    for (const action of pending) {
        try {
            executeScheduledAction(action);
            db.prepare(`
        UPDATE scheduled_actions
        SET status = 'executed', executed_at = datetime('now')
        WHERE id = ?
      `).run(action.id);
            console.log(`[scheduler] Executed: ${action.action} on ${action.entity_type}#${action.entity_id}`);
        } catch (e) {
            db.prepare(`
        UPDATE scheduled_actions
        SET status = 'failed', error_message = ?
        WHERE id = ?
      `).run(e.message, action.id);
            console.error(`[scheduler] Failed: ${action.action} on ${action.entity_type}#${action.entity_id}:`, e.message);
        }
    }
}

function executeScheduledAction(action) {
    const metadata = action.metadata ? JSON.parse(action.metadata) : {};

    switch (action.action) {
        case 'publish': {
            if (action.entity_type === 'page') {
                const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(action.entity_id);
                if (!page) throw new Error('Page not found');
                // Create snapshot before publish
                ops.createPublishSnapshot(
                    `Scheduled publish: ${page.title}`,
                    'scheduled_publish',
                    ['pages', 'buttons'],
                    [action.entity_id],
                    { user: { id: action.created_by, name: action.created_by_name } }
                );
                db.prepare(`UPDATE pages SET is_active = 1, last_published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(action.entity_id);
            } else if (action.entity_type === 'button') {
                db.prepare(`UPDATE buttons SET is_active = 1, enabled = 1, updated_at = datetime('now') WHERE id = ?`).run(action.entity_id);
            } else if (action.entity_type === 'blog_post') {
                db.prepare(`UPDATE blog_posts SET status = 'published', published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(action.entity_id);
            }
            break;
        }

        case 'unpublish': {
            if (action.entity_type === 'page') {
                db.prepare(`UPDATE pages SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(action.entity_id);
            } else if (action.entity_type === 'button') {
                db.prepare(`UPDATE buttons SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(action.entity_id);
            } else if (action.entity_type === 'blog_post') {
                db.prepare(`UPDATE blog_posts SET status = 'draft', updated_at = datetime('now') WHERE id = ?`).run(action.entity_id);
            }
            break;
        }

        case 'expire': {
            if (action.entity_type === 'button') {
                db.prepare(`UPDATE buttons SET is_active = 0, enabled = 0, updated_at = datetime('now') WHERE id = ?`).run(action.entity_id);
            } else if (action.entity_type === 'blog_post') {
                db.prepare(`UPDATE blog_posts SET status = 'archived', archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(action.entity_id);
            }
            break;
        }

        case 'archive': {
            if (action.entity_type === 'page') {
                db.prepare(`UPDATE pages SET deleted_at = datetime('now'), is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(action.entity_id);
            } else if (action.entity_type === 'button') {
                db.prepare(`UPDATE buttons SET deleted_at = datetime('now'), is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(action.entity_id);
            }
            break;
        }

        default:
            throw new Error(`Unknown action: ${action.action}`);
    }

    // Handle expiration scheduling
    if (metadata.expires_at && action.action === 'publish') {
        ops.scheduleAction(
            action.entity_type,
            action.entity_id,
            'expire',
            metadata.expires_at,
            null,
            null,
            { user: { id: action.created_by, name: action.created_by_name } }
        );
        console.log(`[scheduler] Auto-scheduled expiration for ${action.entity_type}#${action.entity_id} at ${metadata.expires_at}`);
    }
}

function processPublishQueue() {
    const now = new Date().toISOString();
    // Process approved items whose scheduled_for time has arrived
    const ready = db.prepare(`
    SELECT * FROM publish_queue
    WHERE status = 'approved' AND scheduled_for IS NOT NULL AND scheduled_for <= ?
    ORDER BY priority DESC, scheduled_for ASC
  `).all(now);

    if (ready.length === 0) return;

    console.log(`[scheduler] Processing ${ready.length} publish queue item(s)`);

    for (const item of ready) {
        try {
            // Create snapshot before batch publish
            ops.createPublishSnapshot(
                `Queue publish: ${item.change_summary || item.entity_type + '#' + item.entity_id}`,
                'queue_publish',
                [item.entity_type === 'blog_post' ? 'blog_posts' : item.entity_type + 's'],
                [item.entity_id],
                { user: { id: item.created_by, name: item.created_by_name } }
            );

            // Execute the publish
            executeScheduledAction({
                ...item,
                action: item.action || 'publish',
                metadata: JSON.stringify({ expires_at: item.expires_at }),
            });

            db.prepare(`UPDATE publish_queue SET status = 'published', published_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(item.id);
            console.log(`[scheduler] Queue published: ${item.entity_type}#${item.entity_id}`);
        } catch (e) {
            db.prepare(`UPDATE publish_queue SET status = 'failed', updated_at = datetime('now') WHERE id = ?`).run(item.id);
            console.error(`[scheduler] Queue publish failed: ${item.entity_type}#${item.entity_id}:`, e.message);
        }
    }
}

function processExpiredButtons() {
    const now = new Date().toISOString();
    const result = db.prepare(`
    UPDATE buttons
    SET is_active = 0, enabled = 0, updated_at = datetime('now')
    WHERE end_at IS NOT NULL AND end_at <= ? AND (is_active = 1 OR enabled = 1) AND deleted_at IS NULL
  `).run(now);
    if (result.changes > 0) {
        console.log(`[scheduler] Auto-expired ${result.changes} button(s)`);
    }
}

function processScheduledBlogPosts() {
    const now = new Date().toISOString();
    const result = db.prepare(`
    UPDATE blog_posts
    SET status = 'published', published_at = datetime('now'), updated_at = datetime('now')
    WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ? AND archived_at IS NULL
  `).run(now);
    if (result.changes > 0) {
        console.log(`[scheduler] Auto-published ${result.changes} scheduled blog post(s)`);
    }
}

// ── Scheduler Lock (prevent duplicate execution) ─────────────────────
let isRunning = false;
let lastTickAt = null;
let tickCount = 0;
let failCount = 0;

// Main tick — called every minute
function tick() {
    if (isRunning) {
        console.warn('[scheduler] Tick skipped — previous tick still running');
        return;
    }
    isRunning = true;
    lastTickAt = new Date().toISOString();
    tickCount++;

    try {
        processScheduledActions();
        processPublishQueue();
        processExpiredButtons();
        processScheduledBlogPosts();
    } catch (e) {
        failCount++;
        console.error('[scheduler] Tick error:', e.message);
    } finally {
        isRunning = false;
    }
}

function getStatus() {
    return {
        is_running: isRunning,
        last_tick_at: lastTickAt,
        tick_count: tickCount,
        fail_count: failCount,
        pending_actions: db.prepare(`SELECT COUNT(*) AS c FROM scheduled_actions WHERE status = 'pending'`).get().c,
        pending_queue: db.prepare(`SELECT COUNT(*) AS c FROM publish_queue WHERE status IN ('pending','approved')`).get().c,
    };
}

module.exports = { tick, getStatus, processScheduledActions, processPublishQueue, processExpiredButtons };
