import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';
import { getExercise } from '../src/content/exercises';

// B5 of the math and ML path (counting to densities): the visualisers'
// handles and custom input, the concepts live on the map, and an exercise
// whose own code fills Pascal's triangle, judged from the starter and the
// solution.

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

test('dragging a bar of tickets moves the balance point', async ({ page }) => {
  await nudge(page, '/visualisers/random-variables?preset=tickets&step=2', /^tickets marked 1 at /, 'ArrowUp');
});

test('dragging the second circle changes the lens the darts measure', async ({ page }) => {
  await nudge(page, '/visualisers/monte-carlo?preset=area&step=2', /^the second circle’s centre at /, 'ArrowRight');
});

test('dragging x moves where the accumulated area’s slope is checked', async ({ page }) => {
  await nudge(page, '/visualisers/integral?preset=accumulate&step=5', /^x, where you check A’s slope at /, 'ArrowLeft');
});

test('dragging the right end of an interval changes the chance', async ({ page }) => {
  await nudge(page, '/visualisers/distributions?preset=interval&step=1', /^b, the right end at /, 'ArrowLeft');
});

test('dragging x along the CDF moves the area to the left', async ({ page }) => {
  await nudge(page, '/visualisers/distributions?preset=cdf&step=4', /^x, where the area stops at /, 'ArrowRight');
});

test('the two-dice board takes a new event as text', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '/visualisers/two-dice?preset=sum-seven');
  await expect(page.locator('[title="sum 7"]')).toHaveCount(1);
  await page.locator('#custom-input').fill('sum 9');
  await page.locator('#custom-input').press('Enter');
  // The toolbar's input chip now reads the new event.
  await expect(page.locator('[title="sum 9"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('B5’s concepts are live on the map, each opening its lesson', async ({ page }) => {
  for (const [id, lesson] of [
    ['counting-combinatorics', 'Counting and combinations'],
    ['probability-basics', 'Chance, events and independence'],
    ['random-variables', 'Random variables'],
    ['law-of-large-numbers', 'The law of large numbers'],
    ['integrals', 'Integrals'],
    ['continuous-distributions', 'Densities and the normal distribution'],
  ]) {
    await page.goto(`/learn?concept=${id}`);
    await expect(page.locator(`#${id}`).getByRole('button', { pressed: true })).toBeVisible();
    await expect(page.locator(`a[href="/learn/${id}"]`).first()).toBeVisible();
    await page.goto(`/learn/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(lesson);
  }
});

test('Pascal’s triangle fails from the starter, then passes when the code adds the two cells above', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const exercise = getExercise('pascal-choose')!;
  // Saved code opens the editor (init scripts run in order, so the latest code wins).
  const save = (code: string) =>
    page.addInitScript((c) => {
      if (window !== window.top) return; // the code sandbox's frames have no storage
      localStorage.setItem('algorender:code:pascal-choose:javascript', c);
      localStorage.setItem('algorender:language', 'javascript');
    }, code);
  await save(exercise.starter.javascript);
  await page.goto('/code/pascal-choose');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tests' })).not.toContainText(`All ${exercise.tests.length} tests pass.`, { timeout: 30_000 });
  await expect(page.getByRole('group', { name: 'Tests' })).toContainText(`of ${exercise.tests.length} tests pass.`, { timeout: 30_000 });
  await save(exercise.solution.javascript);
  await page.reload();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tests' })).toContainText(`All ${exercise.tests.length} tests pass.`, { timeout: 30_000 });
  expect(errors).toEqual([]);
});
