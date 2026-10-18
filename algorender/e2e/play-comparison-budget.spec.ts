import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// The comparison budget game: compare hidden cards, prove an order, beat merge sort.

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

const LABELS = 'ABCDEFGH';

test('binary insertion, driven by the comparisons, proves the order within the budget', async ({ page }) => {
  const errors = collectErrors(page);
  const n = 6;
  await page.goto(`/play/comparison-budget?n=${n}&seed=4242`);
  await expect(page.getByRole('heading', { level: 1, name: 'Comparison budget' })).toBeVisible();
  const cards = page.getByRole('group', { name: 'Cards' });
  await expect(cards.getByRole('button', { name: /^Card [A-F]$/ })).toHaveCount(n, { timeout: 30_000 });
  await expect(page.getByTestId('orders-left')).toHaveText('720');
  await expectAccessible(page);

  const log = page.getByTestId('comparison-log').getByRole('listitem');
  const card = (label: string) => page.getByRole('button', { name: `Card ${label}`, exact: true });
  let made = 0;
  /** Compares two cards and says whether the first is the smaller. */
  const smaller = async (a: string, b: string) => {
    await card(a).click();
    await card(b).click();
    await page.getByRole('button', { name: `Compare ${a} and ${b}` }).click();
    made++;
    await expect(log).toHaveCount(made);
    const [lo] = (await log.nth(made - 1).innerText()).split(' < ');
    return lo.trim() === a;
  };

  const row: string[] = [];
  for (const label of LABELS.slice(0, n)) {
    let lo = 0;
    let hi = row.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (await smaller(label, row[mid])) hi = mid;
      else lo = mid + 1;
    }
    await card(label).click();
    await page.getByRole('button', { name: `Put ${label} at position ${lo + 1}` }).click();
    row.splice(lo, 0, label);
  }

  // Binary insertion pins down a single order, within merge sort's worst case (11 for six cards).
  await expect(page.getByTestId('orders-left')).toHaveText('1');
  expect(made).toBeLessThanOrEqual(11);
  await expect(page.getByTestId('comparisons-used')).toHaveText(String(made));
  await page.getByRole('button', { name: 'Check my order' }).click();
  await expect(page.getByRole('heading', { name: 'Sorted, and proved, within the budget.' })).toBeVisible();
  await expect(page.getByText(/no method can promise fewer than 10/)).toBeVisible();
  await expect(page.getByText(/Why 10\?/)).toBeVisible();
  // The cards are face up now, in the order placed.
  const revealed = page.getByRole('group', { name: 'Your order' }).getByRole('button', { name: /^Card [A-F]: \d+$/ });
  await expect(revealed).toHaveCount(n);
  const values = await revealed.evaluateAll((els) => els.map((e) => Number(e.getAttribute('aria-label')!.split(': ')[1])));
  expect(values).toEqual([...values].sort((a, b) => a - b));
  await expectAccessible(page);
  expect(errors).toEqual([]);
});

test('a right order the comparisons don’t prove is a lucky guess', async ({ page }) => {
  await page.goto('/play/comparison-budget?n=4&seed=7');
  const card = (label: string) => page.getByRole('button', { name: `Card ${label}`, exact: true });
  await expect(card('A')).toBeVisible({ timeout: 30_000 });
  // Place all four without comparing: whatever the order, it isn't proved.
  for (const label of 'ABCD') {
    await card(label).click();
    await page.getByRole('button', { name: `Put ${label} at position 1` }).click();
  }
  await page.getByRole('button', { name: 'Check my order' }).click();
  await expect(page.getByRole('heading', { name: /lucky guess|Not quite/ })).toBeVisible();
  await expect(page.getByTestId('orders-left')).toHaveText('24');
});
