# Bakudan Ramen — Links Hub Policy

> This document covers access control, data handling, and operational rules for the self-hosted Links Hub & Blog CMS running at bakudanramen.com.

---

## 1. Roles & Permissions

| Role | Dashboard | Pages & Buttons | Shortlinks | Subscribers | Users | Settings | Blog |
|---|---|---|---|---|---|---|---|
| **super_admin** | ✅ | ✅ Full CRUD | ✅ | ✅ + Export | ✅ CRUD | ✅ | ✅ |
| **marketing_manager** | ✅ | ✅ Full CRUD | ✅ | ✅ + Export | ✅ Read | ✅ | ✅ |
| **store_manager** | ✅ | ✅ Edit only | ❌ | ❌ | ❌ | ❌ | ❌ |
| **viewer** | ✅ Read | ✅ Read | ❌ | ❌ | ❌ | ❌ | ❌ |

- Store managers can only edit buttons on pages assigned to their `store_slug`.
- Only `super_admin` can create or delete other user accounts.
- No role can delete their own account.

---

## 2. Authentication

- All admin endpoints require a valid JWT Bearer token obtained via `POST /api/auth/login`.
- Tokens expire after **7 days**. Users must re-login after expiry.
- Passwords must be **at least 8 characters**.
- The default admin credentials (`admin@bakudanramen.com / admin123`) **must be changed immediately** after the first deployment.
- The `JWT_SECRET` environment variable must be set to a long, random string in production. Never use the default dev secret on a live server.

---

## 3. Data Stored

| Type | Where | Retention |
|---|---|---|
| Admin users | SQLite (`data/bakudan.db`) | Until manually deleted |
| Link pages & buttons | SQLite | Until manually deleted |
| Subscriber emails | SQLite | Until unsubscribed or manually purged |
| Analytics (click/pageview events) | SQLite | No automatic expiry — purge periodically |
| Blog posts | SQLite | Soft-deleted (archived), never hard-deleted automatically |
| Uploaded images | `uploads/` directory | Until manually removed |

### Personal Data
- **Subscribers**: email and optional name. Collected only with user consent via an opt-in form. Exportable as CSV by marketing managers and above.
- **Analytics**: IP address and User-Agent are stored per click/pageview for fraud detection and traffic analysis. These are not shared with third parties.

---

## 4. Public Endpoints

The following endpoints are unauthenticated and rate-limited by the hosting provider:

| Endpoint | Purpose |
|---|---|
| `GET /api/public/pages/:slug` | Serves button data for a public link page |
| `POST /api/public/track` | Records a button click event |
| `POST /api/public/subscribe` | Email opt-in capture |
| `GET /api/public/shortlinks/:code` | Resolves and redirects a shortlink |
| `GET /api/public/posts` | Lists published blog posts |
| `GET /api/public/posts/:slug` | Single published blog post |

No authentication is required for these endpoints. Do not expose internal admin data through them.

---

## 5. QR Codes

- QR codes printed for stores point to `/links/{slug}`.  
- **Do NOT change a page slug after QR codes have been printed** — existing QR codes will break.
- If a slug must change, create a redirect from the old slug to the new one via the Redirects tab.

---

## 6. Button Scheduling

- Buttons can be shown or hidden automatically using `start_at` / `end_at` datetimes (UTC).
- Scheduled blog posts are auto-published by a cron job that runs every minute on the server.
- Always verify scheduled content appears correctly on the public page before relying on it for campaigns.

---

## 7. Deployment Checklist

Before going live:

- [ ] Set `JWT_SECRET` to a strong random value in `.env`
- [ ] Change the default admin password
- [ ] Set `NODE_ENV=production` and `SITE_URL` in `.env`
- [ ] Ensure `data/` directory is writable by the Node process
- [ ] Ensure `uploads/` directory is writable by the Node process
- [ ] Set up HTTPS (reverse proxy via Nginx/Apache or hosting platform)
- [ ] Configure Apache/Nginx to proxy requests to the Node.js process (port 3000)
- [ ] Set up a process manager (PM2 or systemd) so the server restarts on crash
- [ ] Back up `data/bakudan.db` regularly

---

## 8. Apache Integration (.htaccess)

If hosted on cPanel/Apache with `mod_proxy`, add to `.htaccess` in the site root:

```apache
RewriteEngine On

# Proxy API and dynamic routes to Node.js
RewriteRule ^(api|links-admin|links|blog-cms)(.*) http://localhost:3000/$1$2 [P,L]
RewriteRule ^$ http://localhost:3000/ [P,L]
```

> Requires `mod_proxy` and `mod_proxy_http` to be enabled on the server.

---

## 9. Backups

The entire database is a single file: `data/bakudan.db`.

```bash
# Daily backup example (crontab)
0 2 * * * cp /var/www/bakudanramen/data/bakudan.db /backups/bakudan-$(date +\%Y\%m\%d).db
```

Uploaded images live in `uploads/` — back this directory up separately.

---

*Last updated: 2026-04-28*
