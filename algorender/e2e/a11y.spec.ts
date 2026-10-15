import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { visualisers } from '../src/data/visualisers.js';
import { lessons } from '../src/content/lessons';

// WCAG 2.2 A/AA plus axe's best practices, on every page, in both themes.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const pages = [
  '/',
  '/?tab=algorithms',
  '/learn',
  ...lessons.map((l) => `/learn/${l.slug}`),
  '/compare',
  '/embed/bubble-sort',
  '/visualisers/bubble-sort?mode=predict',
  ...visualisers.filter((v: { hidden?: boolean }) => !v.hidden).map((v: { path: string }) => v.path),
];

async function scan(page: Page, path: string) {
  await page.goto(path);
  const stages = page.locator('[data-hydrated]');
  if ((await stages.count()) > 0) {
    await expect(page.locator('[data-hydrated="false"]')).toHaveCount(0);
    // A few steps in, so marked states (and their text colours) are on screen.
    // The button is renamed while a Predict question waits, and disabled at the end.
    const forward = stages.first().getByRole('button', { name: /Step forward/ });
    for (let i = 0; i < 3 && (await forward.count()) > 0 && (await forward.isEnabled()); i++) await forward.click();
  }
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const report = violations.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`);
  expect(report, report.join('\n')).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });
    for (const path of pages) test(`${path} passes axe`, async ({ page }) => scan(page, path));
  });
}

test('the theme toggle cycles system → light → dark and is remembered', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  const toggle = page.getByRole('button', { name: /^Theme:/ });
  await expect(toggle).toHaveAccessibleName('Theme: System. Switch to Light');
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(14, 17, 22)');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark'); // applied before paint, from storage
  await page.getByRole('button', { name: /^Theme:/ }).click();
  await expect(html).not.toHaveAttribute('data-theme', /.*/);
});

test('an embed can force a theme without saving it', async ({ page }) => {
  await page.goto('/embed/bubble-sort?theme=dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull();
});
