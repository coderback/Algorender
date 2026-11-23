import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';
import { getExercise } from '../src/content/exercises';

// B7 of the math and ML path (overfitting to k-nearest neighbours, and the
// stage-3 project M3): the visualisers' handles and custom input, the concepts
// live on the map, a lesson exercise and a project part judged from the
// starter and from the solution.

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-hydrated="true"]').waitFor();
}

/** Focuses a handle by its accessible name and nudges it with an arrow key; the input text must change. */
async function nudge(page: Page, path: string, handle: RegExp, key: string) {
  const errors = collectErrors(page);
  await open(page, path);
  const before = await page.locator('#custom-input').inputValue();
  await page.getByRole('button', { name: handle }).first().focus();
  await page.keyboard.press(key);
  await expect(page.locator('#custom-input')).not.toHaveValue(before);
  expect(errors).toEqual([]);
}

test('dragging the degree refits the curve', async ({ page }) => {
  await nudge(page, '/visualisers/overfitting?preset=degree&step=7', /^degree at /, 'ArrowLeft');
});

test('dragging λ moves lasso’s weights', async ({ page }) => {
  await nudge(page, '/visualisers/regularisation?preset=lasso&step=5', /^λ at /, 'ArrowRight');
});

test('dragging the temperature reshapes the softmax bars', async ({ page }) => {
  await nudge(page, '/visualisers/softmax?preset=bars&step=3', /^temperature T at /, 'ArrowRight');
});

test('dragging the query point moves it through the three class regions', async ({ page }) => {
  await nudge(page, '/visualisers/softmax?preset=regions&step=2', /^query point at /, 'ArrowUp');
});

test('dragging the threshold recounts the four kinds of answer', async ({ page }) => {
  await nudge(page, '/visualisers/roc-curve?preset=threshold&step=2', /^threshold at /, 'ArrowLeft');
});

test('dragging the query point changes its nearest neighbours', async ({ page }) => {
  await nudge(page, '/visualisers/k-nearest-neighbours?preset=query&step=2', /^Query point q at /, 'ArrowUp');
});

test('k-nearest neighbours takes a query, k and seed as text', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '/visualisers/k-nearest-neighbours?preset=query');
  await page.locator('#custom-input').fill('query 0.5 -1 k 5 seed 7');
  await page.locator('#custom-input').press('Enter');
  await expect(page.locator('[title="query 0.5 -1 k 5 seed 7"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('B7’s concepts are live on the map, each opening its lesson', async ({ page }) => {
  for (const [id, lesson] of [
    ['overfitting-bias-variance', 'Overfitting, validation and bias–variance'],
    ['regularisation', 'Regularisation: ridge, lasso and priors'],
    ['softmax-regression', 'Softmax and many classes'],
    ['classification-metrics', 'Precision, recall and ROC'],
    ['k-nearest-neighbours', 'k-nearest neighbours'],
  ]) {
    await page.goto(`/learn?concept=${id}`);
    await expect(page.locator(`#${id}`).getByRole('button', { pressed: true })).toBeVisible();
    await expect(page.locator(`a[href="/learn/${id}"]`).first()).toBeVisible();
    await page.goto(`/learn/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(lesson);
  }
});

/** Saved code opens the editor (init scripts run in order, so the latest code wins). */
const save = (page: Page, slug: string, code: string) =>
  page.addInitScript(
    ([s, c]) => {
      if (window !== window.top) return; // the code sandbox's frames have no storage
      localStorage.setItem(`algorender:code:${s}:javascript`, c);
      localStorage.setItem('algorender:language', 'javascript');
    },
    [slug, code] as const,
  );

async function judged(page: Page, slug: string) {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const exercise = getExercise(slug)!;
  const tests = page.getByRole('group', { name: 'Tests' });
  await save(page, slug, exercise.starter.javascript);
  await page.goto(`/code/${slug}`);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(tests).toContainText(`of ${exercise.tests.length} tests pass.`, { timeout: 30_000 });
  await expect(tests).not.toContainText(`All ${exercise.tests.length} tests pass.`);
  await save(page, slug, exercise.solution.javascript);
  await page.reload();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(tests).toContainText(`All ${exercise.tests.length} tests pass.`, { timeout: 30_000 });
  expect(errors).toEqual([]);
}

test('the stable softmax bug hunt fails as given, then passes once the largest score is subtracted', async ({ page }) => {
  await judged(page, 'stable-softmax');
});

test('M3’s confusion matrix part fails from the starter, then passes when the code counts and divides', async ({ page }) => {
  await judged(page, 'confusion-matrix');
});
