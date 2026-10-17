import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';
import { visualisers } from '../src/data/visualisers.js';

const narration = (page: Page) => page.getByTestId('narration');

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-hydrated="true"]').waitFor();
}

// Smoke test every visualiser on the site: it hydrates, narrates, and an
// algorithm can be run to its last step, with no console errors.
for (const v of visualisers.filter((v: { hidden?: boolean }) => !v.hidden)) {
  test(`${v.slug} loads and runs`, async ({ page }) => {
    const errors = collectErrors(page);

    await open(page, v.path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(v.name);
    await expect(narration(page)).not.toBeEmpty();
    if (v.type === 'algorithm') {
      await page.keyboard.press('End');
      await expect(narration(page)).not.toBeEmpty();
    }
    expect(errors).toEqual([]);
  });
}

test('a data-structure operation animates, is recorded in the URL, and can be undone', async ({ page }) => {
  await open(page, '/visualisers/stack?start=example');
  const push = page.locator('form').filter({ has: page.getByRole('button', { name: 'Push', exact: true }) });
  await push.locator('input').fill('42');
  await push.getByRole('button', { name: 'Push', exact: true }).click();

  await expect(page).toHaveURL(/ops=push%3A42|ops=push:42/);
  await page.keyboard.press('End');
  await expect(page.getByRole('region', { name: 'Operations' })).toBeVisible();
  await expect(page.getByText('Push 42', { exact: true })).toBeVisible(); // history chip

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page).not.toHaveURL(/ops=/);
  await expect(narration(page)).toContainText('Undid');
});

test('a shared operations link rebuilds the same structure', async ({ page }) => {
  await open(page, '/visualisers/stack?start=empty&ops=push:5;push:9;pop');
  await expect(page.getByText('Push 5', { exact: true })).toBeVisible();
  await expect(page.getByText('Pop', { exact: true }).first()).toBeVisible();
  // Popping an empty stack is blocked, so a hand-edited link can't run it.
  await open(page, '/visualisers/stack?start=empty&ops=pop');
  await expect(page.getByText('No operations yet.')).toBeVisible();
});
