import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// Phase 6a: Break it. Craft the input that hurts: quicksort's worst case, a
// greedy coin-change counterexample, a hash flood.

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

const challenge = (page: Page, name: string) => page.getByRole('region', { name });

test('break quicksort, greedy coin change and a hash table', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/play/break-it');
  await expect(page.getByRole('heading', { level: 1, name: 'Break it' })).toBeVisible({ timeout: 30_000 });

  // Quicksort: a wrong count is explained, a balanced input doesn't break it, a sorted one does.
  const quick = challenge(page, 'Make quicksort slow');
  const values = quick.getByLabel('10 values for quicksort');
  await values.fill('10 20 30');
  await quick.getByRole('button', { name: 'Try it' }).click();
  await expect(quick.getByText('Enter exactly 10 numbers; you entered 3.')).toBeVisible();
  await expect(values).toHaveAttribute('aria-invalid', 'true');
  await values.fill('30 10 20 50 40 80 60 90 70 55');
  await quick.getByRole('button', { name: 'Try it' }).click();
  await expect(quick.getByRole('status')).toContainText('Not broken yet.');
  await values.fill('10 20 30 40 50 60 70 80 90 95');
  await quick.getByRole('button', { name: 'Try it' }).click();
  await expect(quick.getByRole('status')).toContainText('Broken! 45 comparisons');
  await expect(quick.getByRole('link', { name: 'Watch quicksort on your input' })).toHaveAttribute('href', '/visualisers/quick-sort?input=10%2C20%2C30%2C40%2C50%2C60%2C70%2C80%2C90%2C95');

  // Greedy coins: 8 is fine with [1, 3, 4]; 6 isn't.
  const coins = challenge(page, 'Fool the greedy cashier');
  await coins.getByRole('radio', { name: '1, 3, 4' }).check();
  await coins.getByLabel('Amount').fill('8');
  await coins.getByRole('button', { name: 'Try it' }).click();
  await expect(coins.getByRole('status')).toContainText('Greedy found the fewest coins here.');
  await coins.getByLabel('Amount').fill('6');
  await coins.getByRole('button', { name: 'Try it' }).click();
  await expect(coins.getByRole('status')).toContainText('Broken! Greedy needed 3 coins where 2 will do');
  await expect(coins.getByText('4 + 1 + 1 → 3 coins')).toBeVisible();
  await expect(coins.getByText('3 + 3 → 2 coins')).toBeVisible();

  // Hash flood: multiples of 8 all land in bucket 0.
  const flood = challenge(page, 'Flood the hash table');
  await flood.getByLabel('8 different keys').fill('0 8 16 24 32 40 48 56');
  await flood.getByRole('button', { name: 'Try it' }).click();
  await expect(flood.getByRole('status')).toContainText('Broken! All 8 keys share one bucket');
  await expect(flood.getByText('longest: 8')).toBeVisible();

  await expectAccessible(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectAccessible(page);
  expect(errors).toEqual([]);
});
