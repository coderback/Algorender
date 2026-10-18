import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// Be the algorithm (Phase 6a): the learner makes each swap the sort makes next.

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** The bars, left to right: each button is labelled "<value>, position <n>". */
async function bars(page: Page) {
  const buttons = page.getByRole('button', { name: /^\d+, position \d+/ });
  await expect(buttons.first()).toBeVisible({ timeout: 30_000 });
  const labels = await buttons.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
  return labels.map((label, i) => ({ value: Number(label.split(',')[0]), button: buttons.nth(i) }));
}

/** Selection sort's next swap: the first position holding more than the smallest value after it, with that smallest value's first position. */
function nextSelectionSwap(values: number[]): [number, number] | null {
  for (let i = 0; i < values.length - 1; i++) {
    const rest = values.slice(i + 1);
    const min = Math.min(...rest);
    if (values[i] > min) return [i, i + 1 + rest.indexOf(min)];
  }
  return null;
}

test('a learner who follows the rule wins a round of selection sort', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/play/be-the-algorithm/selection-sort?seed=12&size=7');
  await expect(page.getByRole('heading', { level: 1, name: 'Be selection sort' })).toBeVisible();
  await expectAccessible(page);

  for (let move = 1; move <= 8; move++) {
    await expect(page.getByText(`Move ${move}`, { exact: true })).toBeVisible();
    const current = await bars(page);
    const swap = nextSelectionSwap(current.map((b) => b.value));
    if (!swap) {
      await page.getByRole('button', { name: 'No more swaps' }).click();
      break;
    }
    await current[swap[0]].button.click();
    await expect(current[swap[0]].button).toHaveAttribute('aria-pressed', 'true');
    await current[swap[1]].button.click();
    await page.getByRole('button', { name: 'Swap these two' }).click();
    await expect(page.getByText('Right.', { exact: true })).toBeVisible();
  }

  await expect(page.getByText('Round over')).toBeVisible();
  const summary = await page.getByText(/^\d+ of \d+ moves right first time\.$/).textContent();
  const [score, max] = (summary ?? '').match(/\d+/g)!.map(Number);
  expect(score).toBe(max);
  await expect(page.getByText(/A perfect round/)).toBeVisible();
  await expectAccessible(page);
  expect(errors).toEqual([]);
});

test('a move the algorithm wouldn’t make shows the one it does', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/play/be-the-algorithm/bubble-sort?seed=5&size=7');
  const current = await bars(page);
  const values = current.map((b) => b.value);
  expect(values.some((v, i) => i > 0 && values[i - 1] > v)).toBe(true);

  // The array isn't sorted, so saying it is done is wrong.
  await page.getByRole('button', { name: 'No more swaps' }).click();
  await expect(page.getByText('Not that one.')).toBeVisible();
  await expect(page.getByText(/It swaps \d+ and \d+ next/)).toBeVisible();
  // Bubble sort's first swap: the first neighbours out of order.
  const j = values.findIndex((v, i) => i < values.length - 1 && v > values[i + 1]);
  await expect(page.getByRole('button', { name: /the algorithm’s pick/ })).toHaveCount(2);
  await expect(page.getByRole('button', { name: `${values[j]}, position ${j + 1}, the algorithm’s pick` })).toBeVisible();
  await expect(page.getByText('Misses: 1', { exact: false })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Move 2', { exact: true })).toBeVisible();
  // The verdict was about the last move; the next one starts clean.
  await expect(page.getByText('Not that one.')).toHaveCount(0);
  const after = (await bars(page)).map((b) => b.value);
  expect(after[j]).toBe(values[j + 1]);
  expect(after[j + 1]).toBe(values[j]);
  expect(errors).toEqual([]);
});

test('the game picker lists the playable sorts', async ({ page }) => {
  await page.goto('/play/be-the-algorithm');
  for (const name of ['Bubble Sort', 'Selection Sort', 'Quick Sort', 'Heap Sort']) {
    await expect(page.getByRole('link', { name: new RegExp(name, 'i') })).toBeVisible();
  }
  await expectAccessible(page);
});
