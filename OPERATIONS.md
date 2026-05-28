# Production Operations System — Architecture Document

## Overview

The bakudanramen.com platform has been upgraded from a simple edit-and-save admin into a full **Review → Preview → Schedule → Publish → Rollback** production operations system.

Maria can now create, edit, rebuild, schedule, preview, publish, and rollback content **without developer support, direct production editing, or risk of breaking the live site**.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    MARIA (Operator)                               │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Create  │→ │  Review  │→ │ Schedule │→ │   Publish    │   │
│  │  (Draft) │  │ (Preview)│  │ (Queue)  │  │ (Atomic)     │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│                                                    ↓             │
│                                              ┌──────────┐       │
│                                              │ Snapshot │       │
│                                              │ (Auto)   │       │
│                                              └──────────┘       │
│                                                    ↓             │
│                                              ┌──────────┐       │
│                                              │ Rollback │       │
│                                              │ (1-click)│       │
│                                              └──────────┘       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    SCHEDULING ENGINE                              │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │ Scheduled Actions│  │  Publish Queue  │  │ Auto-Expire    │  │
│  │ (publish/unpub) │  │ (approved items)│  │ (buttons/posts)│  │
│  └─────────────────┘  └─────────────────┘  └────────────────┘  │
│                                                                   │
│  Runs every 60 seconds via node-cron                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    SAFETY LAYER                                   │
│                                                                   │
│  • Audit Log (every action tracked)                              │
│  • Soft Deletes (archive, never hard delete)                     │
│  • Impact Analysis (before destructive ops)                      │
│  • Operational Warnings (overlaps, expired, stale)               │
│  • Atomic Transactions (publish ALL or NONE)                     │
│  • Pre-publish Snapshots (automatic)                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema Changes

### New Tables

| Table | Purpose |
|-------|---------|
| `content_versions` | Universal versioning for all content types |
| `publish_queue` | Pending changes awaiting review/publish |
| `publish_snapshots` | Full system state captures before each publish |
| `audit_log` | Comprehensive action tracking (who/what/when) |
| `scheduled_actions` | Time-based publish/unpublish/expire actions |
| `deploy_metadata` | Environment and deployment tracking |

### Schema Migrations (Added Columns)

| Table | Column | Purpose |
|-------|--------|---------|
| `pages` | `deleted_at` | Soft delete timestamp |
| `pages` | `deleted_by` | Who archived it |
| `pages` | `publish_status` | draft/scheduled/published/archived |
| `pages` | `last_published_at` | Last publish timestamp |
| `pages` | `last_published_by` | Who published |
| `buttons` | `deleted_at` | Soft delete timestamp |
| `buttons` | `deleted_by` | Who archived it |
| `buttons` | `publish_status` | draft/scheduled/published/archived |
| `shortlinks` | `deleted_at` | Soft delete timestamp |
| `subscribers` | `deleted_at` | Soft delete timestamp |

---

## API Endpoints

All operations endpoints are mounted at `/api/ops/`:

### Publish Queue
- `GET /api/ops/publish-queue` — List pending changes
- `POST /api/ops/publish-queue` — Add item to queue
- `POST /api/ops/publish-queue/:id/approve` — Approve for publish
- `POST /api/ops/publish-queue/:id/reject` — Reject change
- `POST /api/ops/publish-queue/:id/cancel` — Cancel queued item

### Scheduling
- `GET /api/ops/scheduled` — List pending scheduled actions
- `POST /api/ops/schedule` — Schedule a future action
- `DELETE /api/ops/scheduled/:id` — Cancel scheduled action
- `GET /api/ops/timeline` — Upcoming + recent timeline

### Snapshots & Rollback
- `GET /api/ops/snapshots` — List system snapshots
- `GET /api/ops/snapshots/:id` — View snapshot detail
- `POST /api/ops/snapshots` — Create manual snapshot
- `POST /api/ops/snapshots/:id/rollback` — Rollback to snapshot

### Preview
- `GET /api/ops/preview/page/:id` — Preview page (with ?at= for future)
- `GET /api/ops/preview/scheduled` — Preview scheduled state

### Content Versions
- `GET /api/ops/versions/:type/:id` — List versions for entity
- `GET /api/ops/versions/detail/:versionId` — View version detail
- `POST /api/ops/versions` — Create new version

### Audit & Warnings
- `GET /api/ops/audit-log` — Full audit trail
- `GET /api/ops/warnings` — Operational warnings

### Safe Delete / Archive
- `GET /api/ops/delete-impact/:type/:id` — Impact analysis
- `POST /api/ops/archive/:type/:id` — Soft-delete (archive)
- `POST /api/ops/restore/:type/:id` — Restore archived item
- `GET /api/ops/archived` — List all archived items

### Environment
- `GET /api/ops/environment` — Deploy info, manifest, versions

### Publish Diff
- `GET /api/ops/publish-diff` — Compare current vs pending changes

---

## Snapshot Strategy

1. **Automatic snapshots** are created before every:
   - Publish action
   - Rollback action
   - Archive action
   - Scheduled publish execution

2. **Manual snapshots** can be created at any time via the Operations Center

3. **Snapshot contents** include:
   - All pages (with metadata)
   - All buttons (with scheduling data)
   - All blog posts
   - All shortlinks
   - All settings

4. **Retention**: Snapshots are never deleted. They serve as the rollback chain.

---

## Rollback Strategy

- **One-click rollback** from any snapshot
- Before rollback, a **pre-rollback snapshot** is automatically created
- Rollback is **atomic** (transaction-based: all or nothing)
- Rollback restores: pages, buttons, blog posts, settings
- Rollback is **audited** (who, when, which snapshot)

---

## Scheduling Engine Design

The scheduler runs every 60 seconds and processes:

1. **Scheduled Actions** — publish/unpublish/expire at specific times
2. **Publish Queue** — approved items whose scheduled_for time has arrived
3. **Expired Buttons** — auto-disable buttons past their end_at
4. **Scheduled Blog Posts** — auto-publish posts at scheduled_at

Each execution:
- Creates a snapshot before changes
- Logs success/failure
- Auto-schedules expiration if publish has expires_at

---

## Preview Architecture

- **Current Preview**: Shows page as it appears now
- **Future Preview**: Shows page as it will appear at a specific date/time
  - Filters buttons by start_at/end_at
  - Shows which scheduled actions will have executed
- **Mobile Preview**: Phone-frame rendering in admin
- **Desktop Preview**: Full-width rendering

---

## Audit Trail Design

Every action is logged with:
- User ID, name, email
- Action type (create, update, publish, rollback, archive, etc.)
- Entity type and ID
- Entity label (human-readable)
- Details (JSON metadata)
- IP address
- User agent
- Timestamp

---

## Environment Separation Strategy

- **Production indicator** shown in admin UI
- **Deploy metadata** tracked in database
- **Build manifest** verification (version, commit, build name)
- **Server uptime** and Node version exposed

---

## Deployment Hardening Plan

1. Deploy manifest verification (existing `verify-admin-build.js`)
2. Environment banners in admin UI
3. Version consistency checks
4. Stale bundle detection
5. Rollback deploys via snapshot system

---

## Migration Safety Plan

- All schema changes use `CREATE TABLE IF NOT EXISTS`
- Column additions use `ALTER TABLE ... ADD COLUMN` wrapped in try/catch
- Duplicate column errors are silently ignored (idempotent)
- No destructive migrations — only additive
- Backward-compatible: old code continues to work

---

## Rollout Phases

### Phase 1 (COMPLETE) — Foundation
- [x] Database schema extensions
- [x] Operations API routes
- [x] Scheduling engine
- [x] Snapshot system
- [x] Rollback system
- [x] Audit logging
- [x] Soft deletes
- [x] Impact analysis
- [x] Operational warnings

### Phase 2 (COMPLETE) — Frontend
- [x] Operations Center dashboard
- [x] Publish Queue UI
- [x] Timeline view
- [x] Snapshots & Rollback UI
- [x] Warnings display
- [x] Audit log viewer
- [x] Archive/Restore UI
- [x] Environment info
- [x] Preview system (with future time)

### Phase 3 (NEXT) — Integration
- [ ] Wire "Operations" nav item into main app.js sidebar
- [ ] Add publish queue integration to existing page/button editors
- [ ] Add "Schedule" button to blog post editor
- [ ] Add delete-impact confirmation dialogs
- [ ] Add environment banner to admin header

### Phase 4 (FUTURE) — Advanced
- [ ] WYSIWYG blog editor
- [ ] SEO preview
- [ ] Campaign overlap detection UI
- [ ] Publish diff visual viewer
- [ ] Feature flags system
- [ ] Staging mode

---

## Feature Flag Strategy

Future implementation will use a `feature_flags` table:
- Key/value pairs with enable/disable
- Per-environment overrides
- Gradual rollout percentages
- Admin UI toggle

---

## Recovery Procedures

1. **Content issue**: Use Snapshots → find last good state → Rollback
2. **Accidental delete**: Use Archived → find item → Restore
3. **Bad publish**: Use Snapshots → pre-publish snapshot → Rollback
4. **Scheduling error**: Use Timeline → find action → Cancel
5. **Full system recovery**: Use oldest available snapshot → Rollback

---

## QA/Stress Test Plan

1. Create 50+ scheduled actions → verify scheduler processes correctly
2. Rollback from snapshot → verify all data restored
3. Archive page with buttons → verify cascade soft-delete
4. Restore archived page → verify buttons restored
5. Schedule publish + expire → verify auto-activation and deactivation
6. Concurrent publish queue items → verify atomic execution
7. Impact analysis → verify correct dependency detection
8. Warnings detection → verify all warning types fire correctly

---

## Files Created/Modified

### New Files
- `server/db-operations.js` — Schema extensions + helper functions
- `server/routes/operations.js` — Operations API routes
- `server/scheduler.js` — Scheduling engine
- `links-admin/assets/operations.js` — Frontend operations module
- `links-admin/assets/operations.css` — Operations UI styles
- `OPERATIONS.md` — This document

### Modified Files
- `server/server.js` — Added operations route mount + scheduler
- `links-admin/index.html` — Added operations CSS + JS includes
