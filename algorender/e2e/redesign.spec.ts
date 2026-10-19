import { expect, test } from '@playwright/test';

// Screenshots of the redesigned routes at desktop and phone width in both
// themes, for a side-by-side check against docs/redesign/renders. Shots land in
// test-results/redesign/. No pixel diffs: the boards use sample data. Each
// phase adds the routes it finishes.
const ROUTES: { name: string; path: string }[] = [{ name: 'dev-ui', path: '/dev/ui' }];

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

for (const theme of ['light', 'dark'] as const) {
  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${route.name} at ${vp.name} in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const sep = route.path.includes('?') ? '&' : '?';
        const res = await page.goto(`${route.path}${sep}theme=${theme}`);
        expect(res?.status(), `${route.path} status`).toBe(200);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.evaluate(() => document.fonts.ready);
        // No horizontal page scroll at any width.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, 'horizontal page scroll').toBeLessThanOrEqual(0);
        await page.screenshot({ path: `test-results/redesign/${route.name}-${vp.name}-${theme}.png`, fullPage: true });
      });
    }
  }
}
