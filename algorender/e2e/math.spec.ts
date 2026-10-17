import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

const narration = (page: Page) => page.getByTestId('narration');
const stepCounter = (page: Page) => page.getByText(/^\d+\/\d+$/);

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-hydrated="true"]').waitFor();
}

test('dragging a handle records the trace again on the same frame', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '/visualisers/linear-transformations?preset=stretch-shear&step=8');
  await expect(stepCounter(page)).toHaveText('9/9');
  const i = page.getByRole('button', { name: /^Where î lands at \(2, 0\)/ });
  const box = (await i.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Up and left; the handle snaps to half units, so the exact landing spot doesn't matter.
  for (let k = 1; k <= 8; k++) await page.mouse.move(x - 6 * k, y - 6 * k);
  await page.mouse.up();

  const moved = page.getByRole('button', { name: /^Where î lands at/ });
  await expect(moved).not.toHaveAccessibleName(/\(2, 0\)/);
  await expect(stepCounter(page)).toHaveText('9/9');
  await expect(page).toHaveURL(/input=/);
  await expect(page.locator('#custom-input')).not.toHaveValue('');
  expect(errors).toEqual([]);
});

test('arrow keys move a focused handle instead of stepping the trace', async ({ page }) => {
  await open(page, '/visualisers/linear-transformations?preset=shear&step=8');
  const j = page.getByRole('button', { name: /^Where ĵ lands at \(1, 1\)/ });
  await j.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: /^Where ĵ lands at \(1\.5, 1\)/ })).toBeFocused();
  await expect(stepCounter(page)).toHaveText('9/9');
  await expect(page.locator('#custom-input')).toHaveValue('[[1, 1.5], [0, 1]], v = (1, 2)');
  await expect(narration(page)).toContainText('1.5');
});

test('dragging the start point reruns gradient descent from there', async ({ page }) => {
  await open(page, '/visualisers/gradient-descent?preset=bowl');
  const start = page.getByRole('button', { name: /^Start at \(−2\.5, 2\)/ });
  await start.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByRole('button', { name: /^Start at \(−2\.1, 2\)/ })).toBeVisible();
  await expect(narration(page)).toContainText('(−2.1, 2)');
});

test('moving the query arrow re-scores every key', async ({ page }) => {
  await open(page, '/visualisers/attention?preset=pronoun&step=3');
  const q = page.getByRole('button', { name: /^Query of “it” at \(1\.6, 0\.2\)/ });
  await q.focus();
  await page.keyboard.press('Shift+ArrowUp');
  await expect(page.getByRole('button', { name: /^Query of “it” at \(1\.6, 0\.6\)/ })).toBeFocused();
  await expect(page.locator('#custom-input')).toHaveValue(/q = \(1\.6, 0\.6\)/);
  await expect(page).toHaveURL(/input=/);
});

test('the home page lists math and ML topics', async ({ page }) => {
  await page.goto('/?tab=math');
  await expect(page.getByRole('heading', { name: 'Linear Algebra' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Gradient Descent/ })).toBeVisible();
});
