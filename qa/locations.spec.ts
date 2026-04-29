import { test, expect } from '@playwright/test';

const BASE = 'https://www.bakudanramen.com';
const URL   = `${BASE}/locations.html`;

// ─── 1. Page loads ───────────────────────────────────────────────────────────
test('locations page loads with 200', async ({ page }) => {
  const res = await page.goto(URL, { waitUntil: 'networkidle' });
  expect(res?.status()).toBe(200);
});

// ─── 2. No placeholder text ──────────────────────────────────────────────────
test('no "Map Placeholder" text on page', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Map Placeholder')).toHaveCount(0);
});

// ─── 3. All 3 location names visible ─────────────────────────────────────────
test('all 3 location names are visible', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  // Use main content only to avoid footer / nav duplicates
  const main = page.locator('main');
  await expect(main.getByText('Bandera').first()).toBeVisible();
  await expect(main.getByText('Stone Oak').first()).toBeVisible();
  await expect(main.getByText('The Rim').first()).toBeVisible();
});

// ─── 4. Correct ZIP codes ────────────────────────────────────────────────────
test('Bandera ZIP is 78250 (not 78254)', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const main = page.locator('main');
  await expect(main.getByText('78250', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('78254', { exact: false })).toHaveCount(0);
});

test('The Rim ZIP is 78257 (not 78256)', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const main = page.locator('main');
  await expect(main.getByText('78257', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('78256', { exact: false })).toHaveCount(0);
});

// ─── 5. Google Maps iframes present ──────────────────────────────────────────
test('3 Google Maps iframes are embedded', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'networkidle' });
  const maps = page.locator('iframe[src*="google.com/maps"]');
  await expect(maps).toHaveCount(3);
});

// ─── 6. Maps are square (aspect-ratio 1:1) ───────────────────────────────────
test('each map container is square (width ≈ height ±10%)', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'networkidle' });
  const maps = page.locator('.location-card-map');
  const count = await maps.count();
  expect(count).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < count; i++) {
    const box = await maps.nth(i).boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      const ratio = box.width / box.height;
      expect(ratio).toBeGreaterThan(0.9);
      expect(ratio).toBeLessThan(1.1);
    }
  }
});

// ─── 7. Toast order links correct ────────────────────────────────────────────
test('Bandera order link uses correct Toast slug', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const link = page.locator('a[href*="bakudan-bandera"]').first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toContain('bakudan-bandera');
  expect(href).not.toContain('bakudan-the-rim');
});

test('Stone Oak order link uses correct Toast slug', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const link = page.locator('a[href*="bakudan-ramen-stone-oak"]').first();
  await expect(link).toBeVisible();
});

test('The Rim order link uses correct Toast slug', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const link = page.locator('a[href*="toasttab.com/online/bakudanramen"]').first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).not.toContain('bakudan-therim');
  expect(href).not.toContain('bakudan-the-rim');
});

// ─── 8. Directions links ─────────────────────────────────────────────────────
test('all 3 Get Directions links point to google.com/maps', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const dirLinks = page.locator('a:has-text("Get Directions")');
  const count = await dirLinks.count();
  expect(count).toBe(3);
  for (let i = 0; i < count; i++) {
    const href = await dirLinks.nth(i).getAttribute('href');
    expect(href).toContain('google.com/maps');
  }
});

// ─── 9. Favicon present ──────────────────────────────────────────────────────
test('favicon link tags are in <head>', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const favicon = await page.locator('link[rel="icon"]').count();
  expect(favicon).toBeGreaterThanOrEqual(1);
});

// ─── 10. No consultant stat ──────────────────────────────────────────────────
test.describe('index.html', () => {
  test('no "Renowned Consultant" text on home page', async ({ page }) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Renowned Consultant')).toHaveCount(0);
    await expect(page.getByText('studies in Japan')).toHaveCount(0);
  });

  test('#1 seller is on Garlic Tonkotsu, not Cilantro Lime', async ({ page }) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    const tonkotsu = page.locator('.bowl-card', { hasText: 'Garlic Tonkotsu' });
    await expect(tonkotsu.getByText('#1 seller')).toBeVisible();
    const cilantro = page.locator('.bowl-card', { hasText: 'Cilantro Lime' });
    await expect(cilantro.getByText('#1 seller')).toHaveCount(0);
  });

  test('stats section has exactly 2 items', async ({ page }) => {
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.stat-item')).toHaveCount(2);
  });

  test('hero background image loads (not 404)', async ({ page }) => {
    const failed: string[] = [];
    page.on('response', r => {
      if (r.url().includes('hero-bakudan') && r.status() >= 400) failed.push(r.url());
    });
    await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
    expect(failed).toHaveLength(0);
  });
});

// ─── 11. Mobile layout (375px) ──────────────────────────────────────────────
test('locations page is usable on mobile 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const main = page.locator('main');
  await expect(main.getByText('Bandera').first()).toBeVisible();
  await expect(page.getByText('Get Directions').first()).toBeVisible();
});

// ─── 12. Page title & meta ───────────────────────────────────────────────────
test('page title is correct', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Locations.*Bakudan Ramen/i);
});
