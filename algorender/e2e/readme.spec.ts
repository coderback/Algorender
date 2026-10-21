import { expect, test, type Page } from '@playwright/test';
import { seed } from './seed';

// The README's screenshots, into docs/screenshots/. Skipped unless asked for:
// README_SHOTS=1 npm run e2e -- readme --project=desktop

test.skip(!process.env.README_SHOTS, 'set README_SHOTS=1 to update the README screenshots');

const OUT = 'docs/screenshots';

async function open(page: Page, path: string, theme: 'light' | 'dark', { seeded = false } = {}) {
  if (seeded) {
    await page.goto('/explore');
    await seed(page);
  }
  const sep = path.includes('?') ? '&' : '?';
  await page.goto(`${path}${sep}theme=${theme}`);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

const desktop = { width: 1440, height: 900 };

test('today', async ({ page }) => {
  await page.setViewportSize(desktop);
  await open(page, '/', 'light', { seeded: true });
  await page.screenshot({ path: `${OUT}/today.jpg`, type: 'jpeg', quality: 82 });
});

test('visualiser', async ({ page }) => {
  await page.setViewportSize(desktop);
  await open(page, '/visualisers/bubble-sort?preset=reversed&n=7&seed=1&mode=predict&step=2', 'light');
  await page.screenshot({ path: `${OUT}/visualiser.jpg`, type: 'jpeg', quality: 82 });
});

test('learn in dark', async ({ page }) => {
  await page.setViewportSize(desktop);
  await open(page, '/learn', 'dark', { seeded: true });
  await page.screenshot({ path: `${OUT}/learn-dark.jpg`, type: 'jpeg', quality: 82 });
});

test('phone', async ({ page }) => {
  const phone = { width: 390, height: 844 };
  await page.setViewportSize(phone);
  await open(page, '/explore', 'light', { seeded: true });
  const explore = (await page.screenshot()).toString('base64');
  await open(page, '/visualisers/dijkstra?step=9', 'dark');
  const visualiser = (await page.screenshot()).toString('base64');

  // The two phones side by side on a neutral backdrop.
  const gap = 32;
  await page.setViewportSize({ width: phone.width * 2 + gap * 3, height: phone.height + gap * 2 });
  await page.setContent(`
    <body style="margin:0;background:#dcd9d0;display:flex;gap:${gap}px;padding:${gap}px">
      <img src="data:image/png;base64,${explore}" style="border-radius:28px" />
      <img src="data:image/png;base64,${visualiser}" style="border-radius:28px" />
    </body>`);
  await page.screenshot({ path: `${OUT}/phone.jpg`, type: 'jpeg', quality: 82 });
});
