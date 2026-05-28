# Links Admin — Deployment & Architecture

## Canonical Admin Path

```
/links-admin/          ← ONLY deploy target, ONLY QA target
```

**Do NOT deploy or serve from:**
- `/bakudanramen.com/links-admin/` (modular dev source — not production-ready yet)
- Any other nested path

---

## Asset Inventory

| File | Purpose | Cache Strategy |
|------|---------|----------------|
| `links-admin/index.html` | Shell, config, boot | Always fresh (no-cache header recommended) |
| `links-admin/assets/app.js` | Main SPA bundle | `?v=YYYYMMDD-N` query param |
| `links-admin/assets/app.css` | All styles | `?v=YYYYMMDD-N` query param |
| `links-admin/assets/blog-extension.js` | Blog CMS module | `?v=YYYYMMDD-N` query param |
| `links-admin/deploy-manifest.json` | Build metadata | Updated every deploy |

---

## Version Strategy

Version format: `YYYY.MM.DD-N` (date + revision number)

Version appears in:
1. `BKDN_CONFIG.version` in `index.html`
2. `deploy-manifest.json` → `version` field
3. Sidebar footer in the admin UI

All three MUST match after every deploy.

---

## Deploy Checklist

1. Update code in `/links-admin/assets/app.js`
2. Update `?v=` param in `index.html` for all assets
3. Update `version` in both `BKDN_CONFIG` and `deploy-manifest.json`
4. Run verification: `node scripts/verify-admin-build.js`
5. Deploy to production
6. Verify remote: `node scripts/verify-admin-build.js --remote`
7. Ask Maria to hard-refresh (CMD+SHIFT+R) or open incognito

---

## Rollback Strategy

If a deploy breaks production:

```bash
# 1. Revert to previous commit
git checkout HEAD~1 -- links-admin/

# 2. Push reverted assets to production
# (use your normal deploy method)

# 3. Verify rollback
node scripts/verify-admin-build.js --remote
```

Previous known-good commits are tracked in `deploy-manifest.json` → `commit` field.

---

## Duplicate Admin Trees (Known Issue)

```
/links-admin/                          ← CANONICAL (production)
/bakudanramen.com/links-admin/         ← MODULAR DEV (not deployed)
```

The nested `/bakudanramen.com/links-admin/` contains a newer ES Modules architecture
(`app.js` as entry point importing from `components/`, `state/`, `services/`).
This is the future target architecture but is NOT yet production-deployed.

**Plan:** Once modular architecture is verified end-to-end, it will replace the
monolithic bundle in the canonical path. Until then, the monolithic
`/links-admin/assets/app.js` is the production source of truth.

---

## Verification Script

```bash
# Local check (pre-deploy)
node scripts/verify-admin-build.js

# Remote check (post-deploy)
node scripts/verify-admin-build.js --remote
```

Checks:
- All required files exist
- Deploy manifest is valid
- Expected UI markers present (Add CTA, Button Text, etc.)
- Deprecated markers removed (Add Button, old validation)
- Cache-busting params in place
- No duplicate admin roots (warns if found)
- Version consistency across files

---

## Environment Banner

The admin sidebar displays:
```
v2026.05.28-2
```

If Maria reports an issue, first ask: "What version do you see in the sidebar?"

If she sees an old version or no version → stale cache or wrong deploy path.

---

## Cache-Busting

Current strategy: query parameter `?v=YYYYMMDD-N`

Future upgrade path: content-hashed filenames (`app.a81f2.js`)

For now, the query param approach works because:
- No CDN in front (direct Apache/nginx serving)
- Simple to update manually
- Verification script checks it

---

## Common Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Maria sees old UI | Stale browser cache | CMD+SHIFT+R or incognito |
| Old UI after deploy | Forgot to update `?v=` param | Update index.html cache-bust |
| Version mismatch | Partial deploy | Re-run full deploy + verify |
| "Add Button" visible | Wrong admin path served | Check server config routes to `/links-admin/` |
