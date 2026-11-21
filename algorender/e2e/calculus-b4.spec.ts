import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';
import { getExercise } from '../src/content/exercises';

// B4 of the math and ML path (contour maps to autograd): the visualisers'
// handles, the concepts live on the map, and a part of the second milestone
// project (micrograd from scratch) judged in judge mode.

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

test('dragging P along a contour map changes the walk', async ({ page }) => {
  await nudge(page, '/visualisers/contour-maps?preset=walk&step=2', /^P at /, 'ArrowRight');
});

test('dragging P moves both slices', async ({ page }) => {
  await nudge(page, '/visualisers/contour-maps?preset=slices&step=3', /^P at /, 'ArrowUp');
});

test('dragging P on the product moves the rectangle', async ({ page }) => {
  await nudge(page, '/visualisers/derivative-rules?preset=product&step=2', /^P on f·g at /, 'ArrowLeft');
});

test('dragging the first guess restarts Newton’s method', async ({ page }) => {
  await nudge(page, '/visualisers/taylor?preset=newton&step=2', /^x₀, the first guess at /, 'ArrowLeft');
});

test('dragging p moves the zoomed square of the Jacobian', async ({ page }) => {
  await nudge(page, '/visualisers/jacobian?preset=zoom&step=2', /^p at /, 'ArrowLeft');
});

test('dragging the start of training changes the run', async ({ page }) => {
  await nudge(page, '/visualisers/autograd?preset=train&step=3', /^Start at /, 'ArrowUp');
});

test('B4’s concepts are live on the map, each opening its lesson', async ({ page }) => {
  for (const [id, lesson] of [
    ['contour-maps', 'Contour maps'],
    ['derivative-rules', 'Derivative rules'],
    ['taylor-approximation', 'Tangents and parabolas'],
    ['jacobians', 'Jacobians'],
    ['autograd', 'Autograd'],
  ]) {
    await page.goto(`/learn?concept=${id}`);
    await expect(page.locator(`#${id}`).getByRole('button', { pressed: true })).toBeVisible();
    await expect(page.locator(`a[href="/learn/${id}"]`).first()).toBeVisible();
    await page.goto(`/learn/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(lesson);
  }
});

test('the project’s gradient check fails from the starter, then passes with central differences', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const exercise = getExercise('gradient-check')!;
  // Saved code opens the editor (init scripts run in order, so the latest code wins).
  const save = (code: string) =>
    page.addInitScript((c) => {
      if (window !== window.top) return; // the code sandbox's frames have no storage
      localStorage.setItem('algorender:code:gradient-check:javascript', c);
      localStorage.setItem('algorender:language', 'javascript');
    }, code);
  await save(exercise.starter.javascript);
  await page.goto('/code/gradient-check');
  // The editor draws only the lines in view: the starter opens with the parts written out for you.
  await expect(page.locator('.cm-content')).toContainText('Parts 1 to 3 of the project');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tests' })).toContainText(`0 of ${exercise.tests.length} tests pass.`, { timeout: 30_000 });
  await save(exercise.solution.javascript);
  await page.reload();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tests' })).toContainText(`All ${exercise.tests.length} tests pass.`, { timeout: 30_000 });
  expect(errors).toEqual([]);
});
