import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';
import { getExercise } from '../src/content/exercises';

// B6 of the math and ML path (covariance to SGD): the visualisers' handles and
// custom input, the concepts live on the map, and an exercise whose own code
// runs a permutation test, judged from the starter and the solution.

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

test('dragging a student moves the scatter the correlation is read from', async ({ page }) => {
  await nudge(page, '/visualisers/correlation?preset=revision&step=1', /^Student 1 at /, 'ArrowUp');
});

test('dragging the guess p moves along the likelihood curve', async ({ page }) => {
  await nudge(page, '/visualisers/maximum-likelihood?preset=coin&step=1', /^your guess p \(drag it\) at /, 'ArrowRight');
});

test('dragging the bell’s centre changes its likelihood', async ({ page }) => {
  await nudge(page, '/visualisers/maximum-likelihood?preset=gaussian&step=1', /^μ, the centre \(drag it\) at /, 'ArrowLeft');
});

test('dragging group A’s mean moves every A score, and the test runs again', async ({ page }) => {
  await nudge(page, '/visualisers/permutation-test?preset=shuffle&step=8', /^group A’s mean: drag to move every A score at /, 'ArrowDown');
});

test('dragging the batch size changes the batches SGD steps on', async ({ page }) => {
  await nudge(page, '/visualisers/sgd?preset=batch-size&step=6', /^batch size at /, 'ArrowLeft');
});

test('the confidence intervals take a new seed as text', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '/visualisers/confidence-intervals?preset=intervals');
  await page.locator('#custom-input').fill('intervals seed 11');
  await page.locator('#custom-input').press('Enter');
  await expect(page.locator('[title="intervals seed 11"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('B6’s concepts are live on the map, each opening its lesson', async ({ page }) => {
  for (const [id, lesson] of [
    ['covariance-correlation', 'Covariance and correlation'],
    ['maximum-likelihood', 'Maximum likelihood'],
    ['estimation-confidence', 'Standard errors, confidence intervals and the bootstrap'],
    ['hypothesis-testing', 'Hypothesis tests and p-values'],
    ['stochastic-gradient-descent', 'Minibatches, epochs and schedules'],
  ]) {
    await page.goto(`/learn?concept=${id}`);
    await expect(page.locator(`#${id}`).getByRole('button', { pressed: true })).toBeVisible();
    await expect(page.locator(`a[href="/learn/${id}"]`).first()).toBeVisible();
    await page.goto(`/learn/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(lesson);
  }
});

test('the permutation test fails from the starter, then passes when the code shuffles and counts', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const exercise = getExercise('permutation-test')!;
  // Saved code opens the editor (init scripts run in order, so the latest code wins).
  const save = (code: string) =>
    page.addInitScript((c) => {
      if (window !== window.top) return; // the code sandbox's frames have no storage
      localStorage.setItem('algorender:code:permutation-test:javascript', c);
      localStorage.setItem('algorender:language', 'javascript');
    }, code);
  await save(exercise.starter.javascript);
  await page.goto('/code/permutation-test');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tests' })).not.toContainText(`All ${exercise.tests.length} tests pass.`, { timeout: 30_000 });
  await expect(page.getByRole('group', { name: 'Tests' })).toContainText(`of ${exercise.tests.length} tests pass.`, { timeout: 30_000 });
  await save(exercise.solution.javascript);
  await page.reload();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tests' })).toContainText(`All ${exercise.tests.length} tests pass.`, { timeout: 30_000 });
  expect(errors).toEqual([]);
});
