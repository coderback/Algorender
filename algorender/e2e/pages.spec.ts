import { expect, test } from '@playwright/test';

test('the sorting race runs to a winner', async ({ page }) => {
  await page.goto('/compare');
  await page.getByLabel('Speed').selectOption('250');
  await page.getByRole('button', { name: 'Start the race' }).click();
  await expect(page.getByText(/finished first with \d+ operations/)).toBeVisible({ timeout: 15_000 });
});

test('the growth chart has a legend, a keyboard-readable crosshair and a table view', async ({ page }) => {
  await page.goto('/compare');
  await expect(page.getByRole('list', { name: 'Legend' })).toContainText('Merge Sort');
  const reader = page.getByRole('group', { name: /against input size n/ }).getByRole('slider', { name: /Input size/ });
  await reader.focus();
  await expect(page.getByRole('status').filter({ hasText: 'n = 64' })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('status').filter({ hasText: 'n = 60' })).toBeVisible();
  await expect(reader).toHaveAttribute('aria-valuetext', 'n = 60');
  await page.getByRole('button', { name: 'Show as a table' }).click();
  await expect(page.getByRole('table')).toContainText('64');
});

test('the race explains itself in the Big-O lesson', async ({ page }) => {
  await page.goto('/compare');
  await page.getByRole('link', { name: 'Why: Big-O and growth' }).click();
  await expect(page).toHaveURL(/\/learn\/big-o$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Big-O: how the work grows with n' })).toBeVisible();
  // Its charts are measured runs, readable at any n.
  await expect(page.getByRole('group', { name: 'Comparisons against input size n, for Bubble Sort, Merge Sort' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Probes against input size n, for Linear Search, Binary Search' })).toBeVisible();
});

test('at most four algorithms can be compared at once', async ({ page }) => {
  await page.goto('/compare');
  await expect(page.getByRole('button', { name: 'Heap Sort' })).toBeDisabled();
  await page.getByRole('button', { name: 'Bubble Sort' }).click();
  await expect(page.getByRole('button', { name: 'Heap Sort' })).toBeEnabled();
});

test('embeds render the visualiser without the site chrome', async ({ page }) => {
  await page.goto('/embed/quick-sort?preset=sorted&n=6&seed=1&step=4');
  await page.locator('[data-hydrated="true"]').waitFor();
  await expect(page.getByRole('link', { name: /Open in Algorender/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await expect(page.getByText(/^5 \/ \d+$/)).toBeVisible();
});

test('the sitemap lists the visualisers', async ({ request }) => {
  const xml = await (await request.get('/sitemap.xml')).text();
  expect(xml).toContain('/visualisers/bubble-sort');
  expect(xml).toContain('/compare');
  expect(xml).toContain('/explore');
  expect(xml).toContain('/visualisers/bloom-filter');
});
