import { test, expect, Page } from '@playwright/test';

const BASE = 'https://www.bakudanramen.com';

// ── A. Hungry customer ──────────────────────────────────────────────
test.describe('A — Hungry customer: order flow', () => {
  test('Order Online button is visible on /links/', async ({ page }) => {
    await page.goto(`${BASE}/links/`);
    await expect(page.locator('text=Order Online')).toBeVisible({ timeout: 10000 });
  });

  test('Tapping Order Online expands store list', async ({ page }) => {
    await page.goto(`${BASE}/links/`);
    await page.locator('button.btn-order').click();
    // Store picker expands — check links inside .store-picker
    const picker = page.locator('#store-picker');
    await expect(picker).toBeVisible({ timeout: 5000 });
    await expect(picker.locator('.store-name').filter({ hasText: 'The Rim' })).toBeVisible();
    await expect(picker.locator('.store-name').filter({ hasText: 'Stone Oak' })).toBeVisible();
    await expect(picker.locator('.store-name').filter({ hasText: 'Bandera' })).toBeVisible();
  });

  test('The Rim order link points to toasttab', async ({ page }) => {
    await page.goto(`${BASE}/links/`);
    await page.locator('text=Order Online').first().click();
    const rimLink = page.locator('a[href*="toasttab"]').first();
    await expect(rimLink).toBeVisible();
    const href = await rimLink.getAttribute('href');
    expect(href).toContain('toasttab.com');
  });

  test('Temp linktree order flow works', async ({ page }) => {
    await page.goto(`${BASE}/links/bakudan-temp/`);
    await expect(page.locator('text=Order Delivery')).toBeVisible();
  });
});

// ── B. Location customer ─────────────────────────────────────────────
test.describe('B — Location customer: find directions', () => {
  test('Location section shows all 3 stores on /links/', async ({ page }) => {
    await page.goto(`${BASE}/links/`);
    const locSection = page.locator('text=Locations & Directions');
    await expect(locSection).toBeVisible();
    await expect(page.locator('.sec-lbl + a .lnk-title').first()).toContainText(/Rim|Stone Oak|Bandera/);
  });

  test('All 3 location links point to Google Maps', async ({ page }) => {
    await page.goto(`${BASE}/links/`);
    const mapLinks = page.locator('a[href*="maps.google.com"]');
    const count = await mapLinks.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('Temp linktree location selector loads', async ({ page }) => {
    await page.goto(`${BASE}/links/bakudan-temp/locations/`);
    await expect(page.locator('text=Choose Your Bakudan')).toBeVisible({ timeout: 8000 });
    // Use .loc-name to avoid matching the address text which also contains store name words
    await expect(page.locator('.loc-name').filter({ hasText: 'The Rim' })).toBeVisible();
    await expect(page.locator('.loc-name').filter({ hasText: 'Stone Oak' })).toBeVisible();
    await expect(page.locator('.loc-name').filter({ hasText: 'Bandera' })).toBeVisible();
  });

  test('Location links have correct Google Maps URLs', async ({ page }) => {
    await page.goto(`${BASE}/links/bakudan-temp/locations/`);
    const rimLink = page.locator('a[href*="google.com/maps"]').first();
    const href = await rimLink.getAttribute('href');
    expect(href).toContain('google.com/maps');
  });
});

// ── C. Social customer ───────────────────────────────────────────────
test.describe('C — Social customer: Instagram & Facebook', () => {
  test('Instagram and Facebook visible on /links/', async ({ page }) => {
    await page.goto(`${BASE}/links/`);
    await expect(page.locator('text=Instagram')).toBeVisible();
    await expect(page.locator('text=Facebook')).toBeVisible();
  });

  test('Instagram link points to instagram.com/bakudanramen', async ({ page }) => {
    await page.goto(`${BASE}/links/`);
    const igLink = page.locator('a[href*="instagram.com"]');
    const href = await igLink.getAttribute('href');
    expect(href).toContain('instagram.com/bakudanramen');
  });

  test('Facebook link points to facebook.com/bakudanramen', async ({ page }) => {
    await page.goto(`${BASE}/links/`);
    const fbLink = page.locator('a[href*="facebook.com"]');
    const href = await fbLink.getAttribute('href');
    expect(href).toContain('facebook.com/bakudanramen');
  });

  test('Tag Us (Instagram) visible on temp linktree', async ({ page }) => {
    await page.goto(`${BASE}/links/bakudan-temp/`);
    await expect(page.locator('text=@bakudanramen')).toBeVisible();
  });
});

// ── D. SEO / blog reader ─────────────────────────────────────────────
test.describe('D — Stories & blog reader', () => {
  test('/stories/ loads without error', async ({ page }) => {
    const response = await page.goto(`${BASE}/stories/`);
    expect(response?.status()).toBeLessThan(400);
    await expect(page).not.toHaveTitle(/404|Error/i);
  });

  test('/stories/ has correct title', async ({ page }) => {
    await page.goto(`${BASE}/stories/`);
    const title = await page.title();
    expect(title.toLowerCase()).toMatch(/bakudan|ramen|stories/i);
  });

  test('Public stories API returns valid JSON', async ({ request }) => {
    const res = await request.get(`${BASE}/api/public/stories`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('posts');
    expect(Array.isArray(body.posts)).toBe(true);
  });
});

// ── E. Admin workflow ────────────────────────────────────────────────
test.describe('E — Marketing admin: login + CMS', () => {
  test('/links-admin/ loads SPA', async ({ page }) => {
    const response = await page.goto(`${BASE}/links-admin/`);
    expect(response?.status()).toBe(200);
  });

  test('Login form is present', async ({ page }) => {
    await page.goto(`${BASE}/links-admin/#/login`);
    await expect(page.locator('input[type="email"], input[type="text"]').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('Login API accepts correct credentials', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { email: 'admin@bakudanramen.com', password: 'admin123' }
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(10);
  });

  test('Login does not show generic error on valid credentials', async ({ page }) => {
    await page.goto(`${BASE}/links-admin/#/login`);
    const emailInput = page.locator('input[type="email"], input[type="text"]').first();
    await emailInput.fill('admin@bakudanramen.com');
    await page.locator('input[type="password"]').fill('admin123');
    await page.locator('button').filter({ hasText: /sign in|login|submit/i }).click();
    await page.waitForTimeout(3000);
    const errorText = page.locator('text=/something went wrong/i');
    const count = await errorText.count();
    expect(count).toBe(0);
  });

  test('Dashboard API returns correct structure', async ({ request }) => {
    const loginRes = await request.post(`${BASE}/api/auth/login`, {
      data: { email: 'admin@bakudanramen.com', password: 'admin123' }
    });
    const { token } = await loginRes.json();
    const dashRes = await request.get(`${BASE}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(dashRes.status()).toBe(200);
    const body = await dashRes.json();
    expect(body).toHaveProperty('dashboard');
    expect(body.dashboard).toHaveProperty('clicks_24h');
    expect(body.dashboard).toHaveProperty('views_24h');
  });
});

// ── F. Mobile UX ─────────────────────────────────────────────────────
test.describe('F — Mobile UX: iPhone 12', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('/links/ renders without horizontal scroll on mobile', async ({ page }) => {
    await page.goto(`${BASE}/links/`);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = 390;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test('Order Online button is tappable size on mobile', async ({ page }) => {
    await page.goto(`${BASE}/links/`);
    const btn = page.locator('button.btn-order');
    const box = await btn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThan(200);
  });

  test('Temp linktree is mobile-stable', async ({ page }) => {
    await page.goto(`${BASE}/links/bakudan-temp/`);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(bodyWidth).toBeLessThanOrEqual(395);
  });
});
