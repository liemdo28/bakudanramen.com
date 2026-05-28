# Bakudan Operations Platform — Architecture Specification

## Product Vision

```
Restaurant Growth & Content Operating System
```

Maria operates the entire marketing/content system without developer support:
- Homepage composition
- Link Hub management
- Campaign creation & scheduling
- Blog/news publishing
- Rewards & promotions
- Multi-location content
- Media management
- Analytics & insights

---

## Architecture Principles

1. **Block-based content** — All pages are composed of typed blocks (JSON)
2. **Draft-first** — Nothing goes live without explicit publish
3. **Location-aware** — Every content piece can be scoped to a location
4. **Revision-safe** — Every change creates a snapshot; rollback is instant
5. **Incremental** — Each phase is deployable independently
6. **Operator-first** — UI speaks marketing language, not database language

---

## Core Domain Model

```
┌─────────────────────────────────────────────────┐
│                   PLATFORM                       │
├─────────────────────────────────────────────────┤
│  Sites          (bakudanramen.com)              │
│  └─ Pages       (homepage, rewards, locations)  │
│     └─ Blocks   (hero, cta-grid, promo, etc.)  │
│  Campaigns      (Summer Rewards Push)           │
│  └─ Assets      (banners, CTAs, schedules)      │
│  Blog Posts     (news, announcements)           │
│  Media          (images, videos, PDFs)          │
│  Locations      (Rim, Stone Oak, Bandera)       │
│  Analytics      (views, clicks, conversions)    │
│  Users          (roles, permissions)            │
│  Revisions      (snapshots, rollback)           │
└─────────────────────────────────────────────────┘
```

---

## Block Schema

Every page is a JSON array of blocks:

```json
{
  "page_id": 1,
  "version": 3,
  "status": "draft",
  "blocks": [
    {
      "id": "blk_001",
      "type": "hero",
      "props": {
        "title": "Welcome to Bakudan Ramen",
        "subtitle": "Authentic Japanese flavors",
        "image": "/images/uploads/hero-banner.jpg",
        "cta_label": "Order Now",
        "cta_url": "https://order.toasttab.com/..."
      }
    },
    {
      "id": "blk_002",
      "type": "cta-grid",
      "props": {
        "columns": 2,
        "items": [
          { "label": "Join Rewards", "url": "...", "icon": "gift", "style": "primary" },
          { "label": "View Menu", "url": "...", "icon": "menu", "style": "secondary" }
        ]
      }
    },
    {
      "id": "blk_003",
      "type": "location-cards",
      "props": {
        "show_all": true,
        "display": "grid"
      }
    }
  ]
}
```

---

## Block Types (Phase 1)

| Type | Description | Props |
|------|-------------|-------|
| `hero` | Full-width banner with CTA | title, subtitle, image, cta_label, cta_url, overlay_color |
| `cta-grid` | Grid of CTA buttons | columns, items[], gap |
| `cta-single` | Single prominent CTA | label, url, icon, style, subtitle |
| `promo-banner` | Promotional strip | text, bg_color, link, expires_at |
| `location-cards` | Store location cards | show_all, filter_slugs[], display |
| `social-links` | Social media buttons | platforms[] |
| `text-block` | Rich text content | html, alignment |
| `image` | Single image | src, alt, caption, link |
| `gallery` | Image grid | images[], columns, lightbox |
| `video` | Embedded video | url, poster, autoplay |
| `blog-feed` | Latest blog posts | count, category, layout |
| `waitlist-form` | Waitlist signup | location, heading, description |
| `rewards-section` | Rewards program CTA | heading, description, signup_url |
| `testimonials` | Customer reviews | items[], layout |
| `spacer` | Vertical spacing | height |
| `divider` | Horizontal line | style, color |

---

## Publishing Workflow

```
┌──────┐    ┌─────────┐    ┌──────────┐    ┌──────┐
│ Edit │───▶│  Draft  │───▶│ Preview  │───▶│ Live │
└──────┘    └─────────┘    └──────────┘    └──────┘
                                               │
                                               ▼
                                          ┌──────────┐
                                          │ Rollback │
                                          └──────────┘
```

States:
- **Draft** — Working copy, not visible to public
- **Preview** — Shareable preview URL for review
- **Published** — Live on production
- **Archived** — Removed from live, kept in history

Every transition creates a revision snapshot.

---

## Campaign System

A campaign groups related content changes:

```json
{
  "id": 1,
  "name": "Summer Rewards Push",
  "status": "scheduled",
  "starts_at": "2026-06-01T08:00:00",
  "ends_at": "2026-06-30T23:59:00",
  "locations": ["rim", "stone-oak", "bandera"],
  "assets": [
    { "type": "cta", "config": { "label": "Join Rewards", "template": "rewards" } },
    { "type": "banner", "config": { "text": "Summer Rewards — Earn 2x Points!" } },
    { "type": "blog_post", "config": { "title": "Introducing Summer Rewards" } }
  ]
}
```

When a campaign starts:
- CTAs are auto-created on specified locations
- Banners appear on homepage
- Blog post publishes

When it ends:
- CTAs are auto-hidden
- Banners removed
- Analytics summarized

---

## Backend Service Architecture

```
server/
  services/
    PublishingService.js    — draft/preview/publish/rollback
    BlockService.js        — block CRUD, validation, rendering
    CampaignService.js     — campaign lifecycle management
    MediaService.js        — upload, optimize, CDN
    LocationService.js     — multi-location content routing
    AuditService.js        — revision tracking, diff generation
    SchedulingService.js   — cron-based auto-publish/unpublish
  routes/
    blocks.js              — block CRUD API
    campaigns.js           — campaign API
    publishing.js          — publish workflow API
    media.js               — media library API
    (existing routes remain)
```

---

## Frontend Module Architecture

```
links-admin/
  src/
    blocks/
      BlockEditor.js       — drag-drop block composer
      BlockRenderer.js     — preview renderer
      types/
        Hero.js
        CTAGrid.js
        PromoBanner.js
        LocationCards.js
        ...
    campaigns/
      CampaignBuilder.js
      CampaignTimeline.js
    publishing/
      PublishModal.js
      RevisionTimeline.js
      DiffViewer.js
    media/
      MediaLibrary.js
      ImagePicker.js
      UploadZone.js
    preview/
      PhonePreview.js
      DesktopPreview.js
```

---

## Database Schema Additions

```sql
-- Page blocks (replaces static page content)
CREATE TABLE page_blocks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id     INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  block_id    TEXT    NOT NULL,
  block_type  TEXT    NOT NULL,
  props       TEXT    NOT NULL DEFAULT '{}',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_visible  INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Campaigns
CREATE TABLE campaigns (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'draft',
  starts_at   TEXT,
  ends_at     TEXT,
  locations   TEXT,
  assets      TEXT,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Page versions (for publish workflow)
CREATE TABLE page_versions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id     INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL DEFAULT 1,
  status      TEXT    NOT NULL DEFAULT 'draft',
  blocks_json TEXT    NOT NULL DEFAULT '[]',
  published_by INTEGER REFERENCES users(id),
  published_at TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

---

## Implementation Phases

### Phase 1: Publishing Safety (NOW)
- [x] Revision history (DB + API)
- [x] Media library (DB + API)
- [x] Publish/unpublish with snapshots
- [ ] Publish confirmation modal (frontend)
- [ ] Revision timeline view (frontend)
- [ ] Media library browser (frontend)

### Phase 2: Block Foundation
- [ ] Block schema + page_blocks table
- [ ] Block CRUD API
- [ ] Block renderer (public pages)
- [ ] Block editor UI (admin)
- [ ] Drag-drop reordering

### Phase 3: Visual Builder
- [ ] Block type library (16 types)
- [ ] Live preview while editing
- [ ] Mobile/desktop preview toggle
- [ ] Block templates (pre-configured)

### Phase 4: Campaign Engine
- [ ] Campaign model + API
- [ ] Campaign builder UI
- [ ] Auto-publish/unpublish scheduling
- [ ] Campaign analytics rollup

### Phase 5: Advanced CMS
- [ ] Blog categories + tags
- [ ] SEO preview (Google/Facebook)
- [ ] Collaborative editing
- [ ] RBAC permissions matrix
- [ ] AI content assistant

---

## Migration Strategy

The block system does NOT replace existing pages/buttons immediately.

Migration path:
1. Existing `buttons` table continues working (backward compatible)
2. New `page_blocks` table added alongside
3. Public renderer checks for blocks first, falls back to buttons
4. Once all pages migrated to blocks, buttons become a block type
5. Old button CRUD remains available as "legacy mode"

This ensures zero downtime and Maria can continue operating during migration.

---

## Success Criteria

Maria can:
- [ ] Compose homepage visually using blocks
- [ ] Launch a campaign across all locations in 1 flow
- [ ] Publish with confidence (preview + confirmation)
- [ ] Rollback any mistake instantly
- [ ] Upload and manage media centrally
- [ ] Post blog articles with SEO
- [ ] Schedule content for future dates
- [ ] See system health at a glance

Without:
- Touching code
- Pasting raw URLs
- Understanding database models
- Needing developer support for daily operations
