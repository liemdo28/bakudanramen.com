# Bakudan Ramen Website

**Bold Flavor. Modern Japanese Soul. Texas Spirit.**

Official website for Bakudan Ramen — three locations in San Antonio, Texas — plus a self-hosted Links Hub and Blog CMS that replaces Linktree.

---

## Locations

| Store | Address |
|---|---|
| **The Rim** | 17619 La Cantera Pkwy #208, San Antonio TX 78256 |
| **Stone Oak** | 22506 US Hwy 281 N #106, San Antonio TX 78258 |
| **Bandera** | 11309 Bandera Rd #111, San Antonio TX 78254 |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Static site | HTML5 / CSS3 / Vanilla JS — no build step |
| Backend | Node.js (v22.5+) + Express |
| Database | SQLite via `node:sqlite` (Node built-in) |
| Auth | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) |
| Scheduling | `node-cron` (auto-publish blog posts) |
| Fonts | Bebas Neue, Playfair Display, Noto Sans JP |
| Ordering | Toast integration |

---

## Project Structure

```
bakudanramen.com/
├── index.html              # Homepage
├── menu.html               # Full menu
├── locations.html          # All 3 locations
├── order.html              # Order online (Toast)
├── about.html              # Our story
├── happy-hour.html         # Happy hour specials
├── blog.html               # Blog listing
├── blog-*.html             # Blog articles
├── privacy.html            # Privacy policy
├── terms.html              # Terms of service
│
├── links/                  # Public link hub (served at /links/:slug)
│   └── index.html
│
├── links-admin/            # Admin SPA (served at /links-admin)
│   └── assets/
│       ├── app.js
│       └── app.css
│
├── css/
│   ├── styles.css
│   └── accessibility.css
├── js/
│   ├── main.js
│   ├── consent.js
│   └── accessibility.js
├── images/
│
├── server/                 # Node.js backend
│   ├── server.js           # Express app entry point
│   ├── db.js               # SQLite schema + seed
│   ├── middleware/
│   │   └── auth.js         # JWT verify + requireRole
│   └── routes/
│       ├── auth.js         # POST /api/auth/login|change-password
│       ├── links.js        # GET|POST /api/admin/* (pages, buttons, etc.)
│       ├── blog.js         # GET|POST|PUT|DELETE /api/blog/*
│       └── public.js       # Unauthenticated public API
│
├── data/                   # SQLite database (git-ignored)
│   └── bakudan.db
├── uploads/                # Uploaded images (git-ignored)
│
├── .env.example            # Environment variable template
├── POLICY.md               # Access control & operational rules
└── package.json
```

---

## Quick Start (Local Development)

```bash
# 1. Clone the repo
git clone https://github.com/liemdo28/bakudanramen.com.git
cd bakudanramen.com

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — set JWT_SECRET at minimum

# 4. Start the server
npm run dev
```

Then open:

| URL | Description |
|---|---|
| `http://localhost:3000/` | Main website |
| `http://localhost:3000/links/` | Public link hub |
| `http://localhost:3000/links-admin/` | Admin dashboard |
| `http://localhost:3000/api/config` | API health check |

**Default admin login:** `admin@bakudanramen.com` / `admin123`  
**Change this password immediately after first login.**

---

## API Overview

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Get JWT token |
| POST | `/api/auth/change-password` | Change own password |

### Admin (JWT required)
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/dashboard` | Stats summary |
| GET/POST | `/api/admin/pages` | List / create pages |
| GET/PUT/DELETE | `/api/admin/pages/:id` | Read / update / delete page |
| POST | `/api/admin/pages/:id/duplicate` | Duplicate page + buttons |
| GET/POST | `/api/admin/pages/:id/buttons` | List / add buttons |
| PATCH | `/api/admin/pages/:id/buttons/reorder` | Reorder buttons |
| PUT/DELETE | `/api/admin/buttons/:id` | Update / delete button |
| POST | `/api/admin/buttons/:id` | Duplicate button |
| GET/POST | `/api/admin/shortlinks` | List / create shortlinks |
| DELETE | `/api/admin/shortlinks/:id` | Delete shortlink |
| GET | `/api/admin/analytics` | Site-wide click analytics |
| GET | `/api/admin/subscribers` | Email subscribers |
| GET | `/api/admin/subscribers/export` | CSV export |
| GET/PUT | `/api/admin/settings` | Site settings |
| GET/POST | `/api/admin/users` | User management |
| PUT/DELETE | `/api/admin/users/:id` | Update / remove user |

### Blog CMS (JWT required)
| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/blog` | List / create posts |
| GET/PUT/DELETE | `/api/blog/:id` | Read / update / archive post |

### Public (no auth)
| Method | Path | Description |
|---|---|---|
| GET | `/api/public/pages/all` | All active pages (for store tabs) |
| GET | `/api/public/pages/:slug` | Page + buttons for a slug |
| POST | `/api/public/track` | Record click event |
| POST | `/api/public/subscribe` | Email opt-in |
| GET | `/api/public/shortlinks/:code` | Redirect shortlink |
| GET | `/api/public/posts` | Published blog posts |
| GET | `/api/public/posts/:slug` | Single blog post |

---

## User Roles

| Role | What they can do |
|---|---|
| `super_admin` | Everything |
| `marketing_manager` | Pages, buttons, shortlinks, analytics, settings, blog |
| `store_manager` | Edit buttons on assigned store pages |
| `viewer` | Read-only dashboard |

See [POLICY.md](POLICY.md) for full permission matrix and operational rules.

---

## Production Deployment (Apache / cPanel)

1. Upload all files to the hosting root.
2. Copy `.env.example` → `.env`, set `JWT_SECRET` and `SITE_URL`.
3. Run `npm install --production`.
4. Start the server with PM2: `pm2 start server/server.js --name bakudan`.
5. Add the reverse proxy rules to `.htaccess` (see [POLICY.md](POLICY.md#8-apache-integration-htaccess)).
6. Verify at `https://bakudanramen.com/api/config`.

---

## Accessibility

WCAG 2.1 AA compliant:
- Semantic HTML5, skip-to-content links
- Keyboard navigation, ARIA labels
- Colour contrast ≥ 4.5:1, reduced motion support

## Privacy

- Cookie consent banner (CCPA compliant)
- Subscriber email capture requires explicit opt-in
- No third-party analytics without consent
- See [privacy.html](privacy.html) and [POLICY.md](POLICY.md)
