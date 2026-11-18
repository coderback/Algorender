import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// The math toolkit (B1 of the math and ML path): its visualisers' handles, its
// concepts live on the map, and its lessons' code exercises.

const narration = (page: Page) => page.getByTestId('narration');
const stepCounter = (page: Page) => page.getByText(/^\d+ \/ \d+$/);

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-hydrated="true"]').waitFor();
}

test('the anchor moves a graph sideways and the formula follows', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '/visualisers/functions?preset=parabola&step=9');
  await expect(stepCounter(page)).toHaveText('10 / 11');
  await page.getByRole('button', { name: /^Anchor \(h, k\) at \(2, −1\)/ }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: /^Anchor \(h, k\) at \(1\.5, −1\)/ })).toBeFocused();
  await expect(stepCounter(page)).toHaveText('10 / 11');
  await expect(page.locator('#custom-input')).toHaveValue('square a=1 h=1.5 k=-1');
  await expect(narration(page)).toContainText('y = (x − 1.5)² − 1');
  // The unit point sets the stretch: one step up from a = 1 is a = 1.5.
  await page.getByRole('button', { name: /^Unit point/ }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#custom-input')).toHaveValue('square a=1.5 h=1.5 k=-1');
  expect(errors).toEqual([]);
});

test('dragging P round the unit circle changes the angle', async ({ page }) => {
  await open(page, '/visualisers/unit-circle?preset=angle&step=2');
  await expect(narration(page)).toContainText('cos 60° = 0.5');
  await page.getByRole('button', { name: /^P on the circle at \(0\.5, 0\.87\)/ }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#custom-input')).toHaveValue('circle 72');
  await expect(narration(page)).toContainText('cos 72°');
});

test('dragging a bar moves the mean', async ({ page }) => {
  await open(page, '/visualisers/sigma-notation?preset=mean&step=2');
  await expect(narration(page)).toContainText('x̄ = 20 / 4 = 5');
  await page.getByRole('button', { name: /^x₃ at \(3, 9\)/ }).focus();
  await page.keyboard.press('Shift+ArrowDown');
  await expect(page.locator('#custom-input')).toHaveValue('mean 2 4 5 5');
  await expect(narration(page)).toContainText('x̄ = 16 / 4 = 4');
});

test('the math toolkit is live on the map, each concept opening its lesson', async ({ page }) => {
  for (const [id, lesson] of [
    ['functions-graphs', 'Functions and graphs'],
    ['exponents-logs', 'Exponents and logarithms'],
    ['sums-notation', 'Σ and friends'],
    ['trigonometry', 'Sine and cosine'],
  ]) {
    await page.goto(`/learn?concept=${id}`);
    await expect(page.locator(`#${id}`).getByRole('button', { pressed: true })).toBeVisible();
    await expect(page.locator(`a[href="/learn/${id}"]`).first()).toBeVisible();
    await page.goto(`/learn/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(lesson);
  }
});

test('the bug hunt’s product vanishes, and the sum of logs fixes it', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => window === window.top && localStorage.setItem('algorender:language', 'javascript'));
  await page.goto('/code/log-probability');
  await expect(page.locator('.cm-content')).toContainText('total * ps[i]');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tests' })).toContainText('underflowed to 0', { timeout: 30_000 });
  // Fixed: add the logs instead, saved as if typed.
  const fixed = `function logProb(ps, running) {
  let total = 0;
  for (let i = 0; i < ps.length; i++) {
    total = total + Math.log2(ps[i]);
    running[i] = total;
  }
  return total;
}
`;
  await page.evaluate((code) => localStorage.setItem('algorender:code:log-probability:javascript', code), fixed);
  await page.reload();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tests' })).toContainText('All 5 tests pass.');
  await expect(page.getByText(/^Fixed\./)).toBeVisible();
  expect(errors).toEqual([]);
});
