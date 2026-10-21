import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('a study plan schedules a goal and moves on as concepts become known', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/plan');
  await expect(page.getByRole('button', { name: 'Make my plan' })).toBeVisible({ timeout: 30_000 });
  await expectAccessible(page);

  await page.getByLabel('Coding interviews').check();
  await page.getByText('5 h', { exact: true }).click();
  await page.getByRole('button', { name: 'Make my plan' }).click();

  await expect(page.getByRole('heading', { name: 'Coding interviews' })).toBeVisible();
  await expect(page.getByText('On track.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Week \d+ · now/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What’s left this week' })).toBeVisible();
  const upNext = page.locator('article', { has: page.getByText('Up next', { exact: true }) });
  await expect(upNext.getByRole('heading', { level: 3 })).toHaveText('Big-O and growth');
  await expectAccessible(page);

  await upNext.getByRole('button', { name: 'I already know this' }).click();
  await expect(upNext.getByRole('heading', { level: 3 })).toHaveText('Arrays');
  await expect(page.getByRole('img', { name: '1 of 27 concepts known' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Practise:/ }).first()).toBeVisible();

  // The concept map links to the plan, and the plan survives a reload (it lives in the event log).
  await page.goto('/learn');
  await expect(page.getByRole('link', { name: 'Open your study plan' })).toBeVisible({ timeout: 30_000 });
  await page.goto('/plan');
  await expect(page.getByRole('heading', { name: 'Coding interviews' })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Stop plan' }).click();
  await expect(page.getByRole('button', { name: 'Make my plan' })).toBeVisible();
  expect(errors).toEqual([]);
});
