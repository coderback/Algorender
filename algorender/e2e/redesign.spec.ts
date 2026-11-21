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
  // Math and ML B0: a stage's checkpoint (open, and not yet open) and a visualiser whose weights load on demand.
  { name: 'checkpoint', path: '/learn/checkpoint/2' },
  { name: 'checkpoint-closed', path: '/learn/checkpoint/7' },
  { name: 'viz-diffusion', path: '/visualisers/diffusion?step=3' },
  // 6f: the mock interviews hub, signed out (e2e/interview.spec.ts shoots a round, its debrief and the hub signed in).
  { name: 'interviews', path: '/practice/interview' },
  // Math and ML B1: the math toolkit's visualisers a few steps in, and its lessons.
  { name: 'b1-functions', path: '/visualisers/functions?preset=parabola&step=10' },
  { name: 'b1-logarithms', path: '/visualisers/logarithms?preset=product-uneven&step=3' },
  { name: 'b1-sigma', path: '/visualisers/sigma-notation?preset=square&step=1' },
  { name: 'b1-double-sum', path: '/visualisers/sigma-notation?preset=double&step=7' },
  { name: 'b1-unit-circle', path: '/visualisers/unit-circle?preset=wave&step=5' },
  { name: 'b1-lesson-functions', path: '/learn/functions-graphs' },
  { name: 'b1-lesson-logs', path: '/learn/exponents-logs' },
  { name: 'b1-lesson-sums', path: '/learn/sums-notation' },
  { name: 'b1-lesson-trig', path: '/learn/trigonometry' },
  { name: 'b1-exercise', path: '/code/variance' },
  // Math and ML B2: vectors to matrix multiplication, a few steps in, its lessons and the matrix exercise.
  { name: 'b2-vectors', path: '/visualisers/vectors?preset=add&step=2' },
  { name: 'b2-dot-angle', path: '/visualisers/dot-product?preset=angle&step=4' },
  { name: 'b2-dot-similar', path: '/visualisers/dot-product?preset=similar&step=2' },
  { name: 'b2-norms', path: '/visualisers/norms?preset=distance&step=4' },
  { name: 'b2-matmul', path: '/visualisers/matrix-multiplication?preset=cells&step=3' },
  { name: 'b2-compose', path: '/visualisers/matrix-multiplication?preset=compose&step=5' },
  { name: 'b2-lesson-vectors', path: '/learn/vectors' },
  { name: 'b2-lesson-dot', path: '/learn/dot-product' },
  { name: 'b2-lesson-norms', path: '/learn/norms-distances' },
  { name: 'b2-lesson-matmul', path: '/learn/matrix-multiplication' },
  { name: 'b2-exercise', path: '/code/matrix-multiply' },
  // Math and ML B3: determinants to least squares, a few steps in, its lessons and the first project's parts.
  { name: 'b3-area', path: '/visualisers/inverse-matrix?preset=area&step=2' },
  { name: 'b3-eliminate', path: '/visualisers/inverse-matrix?preset=eliminate&step=4' },
  { name: 'b3-span', path: '/visualisers/span?preset=span&step=3' },
  { name: 'b3-rank', path: '/visualisers/span?preset=rank&step=3' },
  { name: 'b3-basis', path: '/visualisers/change-of-basis?preset=coords&step=3' },
  { name: 'b3-eigenbasis', path: '/visualisers/change-of-basis?preset=eigenbasis&step=4' },
  { name: 'b3-supervised', path: '/visualisers/supervised-learning?preset=fit&step=3' },
  { name: 'b3-split', path: '/visualisers/supervised-learning?preset=split&step=3' },
  { name: 'b3-shadow', path: '/visualisers/least-squares?preset=shadow&step=3' },
  { name: 'b3-fit', path: '/visualisers/least-squares?preset=line&step=4' },
  { name: 'b3-lesson-det', path: '/learn/determinants-inverses' },
  { name: 'b3-lesson-span', path: '/learn/span-basis-rank' },
  { name: 'b3-lesson-basis', path: '/learn/change-of-basis' },
  { name: 'b3-lesson-supervised', path: '/learn/supervised-learning' },
  { name: 'b3-lesson-lsq', path: '/learn/projections-least-squares' },
  { name: 'b3-lesson-matrices', path: '/learn/linear-transformations' },
  { name: 'b3-exercise-solve', path: '/code/solve-system' },
  { name: 'b3-exercise-fit', path: '/code/fit-curves' },
  // Math and ML B4: contour maps to autograd, a few steps in, its lessons and the second project's parts.
  { name: 'b4-contour-table', path: '/visualisers/contour-maps?preset=table&step=8' },
  { name: 'b4-contour-slices', path: '/visualisers/contour-maps?preset=slices&step=3' },
  { name: 'b4-rules-product', path: '/visualisers/derivative-rules?preset=product&step=3' },
  { name: 'b4-rules-numeric', path: '/visualisers/derivative-rules?preset=numeric&step=10' },
  { name: 'b4-taylor-fits', path: '/visualisers/taylor?preset=fits&step=6' },
  { name: 'b4-taylor-newton', path: '/visualisers/taylor?preset=newton&step=3' },
  { name: 'b4-jacobian-zoom', path: '/visualisers/jacobian?preset=zoom&step=3' },
  { name: 'b4-jacobian-chain', path: '/visualisers/jacobian?preset=chain&step=3' },
  { name: 'b4-autograd-order', path: '/visualisers/autograd?preset=order&step=6' },
  { name: 'b4-autograd-train', path: '/visualisers/autograd?preset=train&step=8' },
  { name: 'b4-lesson-contour', path: '/learn/contour-maps' },
  { name: 'b4-lesson-rules', path: '/learn/derivative-rules' },
  { name: 'b4-lesson-taylor', path: '/learn/taylor-approximation' },
  { name: 'b4-lesson-jacobians', path: '/learn/jacobians' },
  { name: 'b4-lesson-autograd', path: '/learn/autograd' },
  { name: 'b4-exercise-heights', path: '/code/height-table' },
  { name: 'b4-exercise-train', path: '/code/train-neuron' },
  // Math and ML B5: counting to densities, a few steps in, its lessons and two of its exercises.
  { name: 'b5-counting-orders', path: '/visualisers/counting?preset=orders&step=3' },
  { name: 'b5-counting-pascal', path: '/visualisers/counting?preset=pascal&step=14' },
  { name: 'b5-dice-or', path: '/visualisers/two-dice?preset=or&step=1' },
  { name: 'b5-dice-throws', path: '/visualisers/two-dice?preset=throws&step=4' },
  { name: 'b5-rv-spread', path: '/visualisers/random-variables?preset=spread&step=6' },
  { name: 'b5-rv-coins', path: '/visualisers/random-variables?preset=coins&step=12' },
  { name: 'b5-mc-dice', path: '/visualisers/monte-carlo?preset=dice&seed=26&step=5' },
  { name: 'b5-mc-darts', path: '/visualisers/monte-carlo?preset=darts&seed=3&step=10' },
  { name: 'b5-integral-sums', path: '/visualisers/integral?preset=sums&step=3' },
  { name: 'b5-integral-accumulate', path: '/visualisers/integral?preset=accumulate&step=5' },
  { name: 'b5-dist-interval', path: '/visualisers/distributions?preset=interval&step=1' },
  { name: 'b5-dist-cdf', path: '/visualisers/distributions?preset=cdf&step=4' },
  { name: 'b5-lesson-counting', path: '/learn/counting-combinatorics' },
  { name: 'b5-lesson-chance', path: '/learn/probability-basics' },
  { name: 'b5-lesson-rv', path: '/learn/random-variables' },
  { name: 'b5-lesson-lln', path: '/learn/law-of-large-numbers' },
  { name: 'b5-lesson-integrals', path: '/learn/integrals' },
  { name: 'b5-lesson-densities', path: '/learn/continuous-distributions' },
  { name: 'b5-exercise-pascal', path: '/code/pascal-choose' },
  { name: 'b5-exercise-pi', path: '/code/estimate-pi' },
  // Language tracks L1: a sample task of each kind shipped (e2e/tasks.spec.ts shoots them after a failed check).
  { name: 'task-program', path: '/learn/tasks/py-greet-by-name' },
  { name: 'task-output', path: '/learn/tasks/py-two-names-one-value' },
  // Language tracks L2 batch 1: a Python topic (theory, a prediction, the task strip), Learn filtered to languages, a fill task.
  { name: 'l2-topic', path: '/learn/py-variables' },
  { name: 'l2-topic-loops', path: '/learn/py-nested-loops' },
  { name: 'l2-learn-languages', path: '/learn?area=languages' },
  { name: 'l2-task-fill', path: '/learn/tasks/py-is-even' },
  // L2 batch 2: the flagship references topic, scope (closures), lists, and a function task and a tests task.
  { name: 'l2-topic-references', path: '/learn/py-references' },
  { name: 'l2-topic-scope', path: '/learn/py-scope' },
  { name: 'l2-topic-lists', path: '/learn/py-lists' },
  { name: 'l2-task-function', path: '/learn/tasks/py-sum-to' },
  { name: 'l2-task-tests', path: '/learn/tasks/py-make-multiplier' },
  // L2 batch 3: dictionaries, the regex topic (a match object on the memory view), errors (a caught exception
  // traced), and a unit's closing explain-back (sorting ends unit 4).
  { name: 'l2-topic-dicts', path: '/learn/py-dicts' },
  { name: 'l2-topic-regex', path: '/learn/py-regex' },
  { name: 'l2-topic-exceptions', path: '/learn/py-exceptions' },
  { name: 'l2-topic-sorting', path: '/learn/py-sorting' },
  { name: 'l2-task-dict', path: '/learn/tasks/py-count-words' },
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

// The code editor's help on the practice and exercise editors: a syntax error
// with completions open, then the search panel.
const EDITORS = [
  { name: 'problem', path: '/practice/two-sum', draft: 'algorender:code:problem:two-sum:python' },
  { name: 'code-bug', path: '/code/bubble-sort-bug', draft: 'algorender:code:bubble-sort-bug:python' },
];

for (const theme of ['light', 'dark'] as const) {
  for (const vp of VIEWPORTS) {
    for (const editor of EDITORS) {
      test(`${editor.name} editor help at ${vp.name} in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.addInitScript((key) => {
          if (window !== window.top) return;
          localStorage.setItem(key, 'def two_sum(nums, target):\n    total = 0\n    return total\n');
          localStorage.setItem('algorender:language', 'python');
          localStorage.setItem('algorender:problem-language', 'python');
        }, editor.draft);
        await page.goto(`${editor.path}?theme=${theme}`);
        await expect(page.locator('.cm-editor')).toBeAttached();
        const show = page.getByRole('group', { name: 'Show' });
        if (await show.isVisible()) await show.getByRole('button', { name: 'Code' }).click();
        await page.evaluate(() => document.fonts.ready);
        const code = page.getByRole('textbox', { name: /^Your .+ code$/ });
        await code.click();
        await page.keyboard.press('ControlOrMeta+End');
        await page.keyboard.type('for n in nums');
        // Escape first, so Enter can't pick from the list that "nums" opened.
        await page.keyboard.press('Escape');
        await page.keyboard.press('Enter');
        await page.keyboard.type('tot');
        await expect(page.locator('[data-syntax-error]')).toBeVisible();
        await expect(page.getByRole('option', { name: 'total' })).toBeVisible();
        await page.screenshot({ path: `test-results/redesign/${editor.name}-editor-error-${vp.name}-${theme}.png` });
        await page.keyboard.press('Escape');
        await page.keyboard.press('ControlOrMeta+f');
        await page.keyboard.type('total');
        await expect(page.locator('.cm-searchMatch').first()).toBeVisible();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, 'horizontal page scroll').toBeLessThanOrEqual(0);
        await page.screenshot({ path: `test-results/redesign/${editor.name}-editor-search-${vp.name}-${theme}.png` });
      });
    }
  }
}
