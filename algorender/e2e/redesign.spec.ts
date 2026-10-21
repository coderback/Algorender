import { expect, test } from '@playwright/test';
import { seed } from './seed';

// Screenshots of the redesigned routes at desktop and phone width in both
// themes, for a side-by-side check against docs/redesign/renders. Shots land in
// test-results/redesign/. No pixel diffs: the boards use sample data. Each
// phase adds the routes it finishes.
const ROUTES: { name: string; path: string; seeded?: boolean; started?: boolean; signedIn?: boolean }[] = [
  // Phase 2: every page in its shell (hub, sub-page, detail, focused).
  { name: 'today', path: '/', started: true },
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
  // Phase 4: Learn with progress (path, lessons, plan) and a lesson part-way through.
  { name: 'learn-seeded', path: '/learn', seeded: true },
  { name: 'lessons', path: '/learn?tab=lessons', seeded: true },
  { name: 'plan-seeded', path: '/plan', seeded: true },
  { name: 'lesson-seeded', path: '/learn/binary-search', seeded: true },
  // Phase 5: Explore with statuses, a visualiser in Predict mode, a structure after operations, the race.
  { name: 'explore-seeded', path: '/explore', seeded: true },
  { name: 'visualiser-predict', path: '/visualisers/bubble-sort?preset=reversed&n=7&seed=1&mode=predict&step=2', seeded: true },
  { name: 'structure', path: '/visualisers/stack?start=example&ops=push:5;push:9;pop' },
  { name: 'math-visualiser', path: '/visualisers/gradient-descent' },
  // Phase 6: Practice with progress, a bug hunt, and a design problem with a class to write.
  { name: 'practice-seeded', path: '/practice', seeded: true },
  { name: 'code-bug', path: '/code/bubble-sort-bug' },
  { name: 'problem-design', path: '/practice/min-stack' },
  // Phase 7: Play with XP, levels and badges, and the games' index.
  { name: 'play-seeded', path: '/play', seeded: true },
  { name: 'be-the-algorithm-index', path: '/play/be-the-algorithm' },
  // Phase 8: the landing page (a first visit to /), the onboarding, and the account signed in with progress.
  { name: 'landing', path: '/' },
  { name: 'start', path: '/start' },
  { name: 'account-signed-in', path: '/account', seeded: true, signedIn: true },
  // Phase 9: one visualiser per view family a step in, on the stage system.
  { name: 'viz-graph', path: '/visualisers/dijkstra?step=6' },
  { name: 'viz-tree', path: '/visualisers/avl-tree' },
  { name: 'viz-grid', path: '/visualisers/n-queens?step=8' },
  { name: 'viz-text', path: '/visualisers/kmp?step=10' },
  { name: 'viz-hash', path: '/visualisers/hash-table' },
  { name: 'viz-plot', path: '/visualisers/k-means?step=4' },
  { name: 'viz-ring', path: '/visualisers/queue' },
  // Group 3: the embed page.
  { name: 'embed-builder', path: '/embed' },
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
        if (route.started) await page.addInitScript(() => window === window.top && localStorage.setItem('algorender:started', '1'));
        if (route.seeded) {
          await page.goto('/explore');
          await seed(page);
        }
        // Signing in claims the device's progress for the account.
        if (route.signedIn) {
          const res = await page.request.post('/api/auth/sign-up/email', {
            data: { name: 'Ada', email: `ada-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'correct horse battery' },
            headers: { origin: new URL(test.info().project.use.baseURL!).origin },
          });
          expect(res.ok(), 'sign up').toBe(true);
        }
        const sep = route.path.includes('?') ? '&' : '?';
        const res = await page.goto(`${route.path}${sep}theme=${theme}`);
        expect(res?.status(), `${route.path} status`).toBe(200);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
        if (route.signedIn) await expect(page.getByRole('status').filter({ hasText: /Synced/ })).toBeVisible({ timeout: 20_000 });
        // No horizontal page scroll at any width.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, 'horizontal page scroll').toBeLessThanOrEqual(0);
        await page.screenshot({ path: `test-results/redesign/${route.name}-${vp.name}-${theme}.png`, fullPage: true });
      });
    }
  }
}
