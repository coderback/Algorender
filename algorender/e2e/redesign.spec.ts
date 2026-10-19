import { expect, test } from '@playwright/test';
import { seed } from './seed';

// Screenshots of the redesigned routes at desktop and phone width in both
// themes, for a side-by-side check against docs/redesign/renders. Shots land in
// test-results/redesign/. No pixel diffs: the boards use sample data. Each
// phase adds the routes it finishes.
const ROUTES: { name: string; path: string; seeded?: boolean }[] = [
  { name: 'dev-ui', path: '/dev/ui' },
  // Phase 2: every page in its shell (hub, sub-page, detail, focused).
  { name: 'today', path: '/' },
  { name: 'explore', path: '/explore' },
  { name: 'learn', path: '/learn' },
  { name: 'placement', path: '/learn/placement' },
  { name: 'plan', path: '/plan' },
  { name: 'practice', path: '/practice' },
  { name: 'drills', path: '/practice/drills' },
  { name: 'code', path: '/code' },
  { name: 'code-exercise', path: '/code/bubble-sort' },
  { name: 'design', path: '/design' },
  { name: 'design-case', path: '/design/url-shortener' },
  { name: 'sandbox', path: '/design/sandbox' },
  { name: 'estimate', path: '/design/estimate' },
  { name: 'play', path: '/play' },
  { name: 'be-the-algorithm', path: '/play/be-the-algorithm/bubble-sort' },
  { name: 'budget', path: '/play/comparison-budget' },
  { name: 'break-it', path: '/play/break-it' },
  { name: 'account', path: '/account' },
  { name: 'visualiser', path: '/visualisers/bubble-sort' },
  { name: 'sysviz', path: '/visualisers/raft' },
  { name: 'compare', path: '/compare' },
  { name: 'lesson', path: '/learn/binary-search' },
  { name: 'problem', path: '/practice/two-sum' },
  { name: 'review', path: '/review' },
  { name: 'embed', path: '/embed/bubble-sort' },
  // Phase 3: Today and the review with a week of progress (the rows above show a new learner).
  { name: 'today-seeded', path: '/', seeded: true },
  { name: 'review-seeded', path: '/review', seeded: true },
];

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

for (const theme of ['light', 'dark'] as const) {
  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`${route.name} at ${vp.name} in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        if (route.seeded) {
          await page.goto('/explore');
          await seed(page);
        }
        const sep = route.path.includes('?') ? '&' : '?';
        const res = await page.goto(`${route.path}${sep}theme=${theme}`);
        expect(res?.status(), `${route.path} status`).toBe(200);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
        // No horizontal page scroll at any width.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, 'horizontal page scroll').toBeLessThanOrEqual(0);
        await page.screenshot({ path: `test-results/redesign/${route.name}-${vp.name}-${theme}.png`, fullPage: true });
      });
    }
  }
}
