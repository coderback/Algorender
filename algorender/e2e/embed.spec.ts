import { expect, test } from '@playwright/test';

// The page that explains embeds: pick a visualiser and its options, preview it, copy the iframe.

test('the embed page previews the chosen visualiser and builds its snippet', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/embed');
  await expect(page.getByRole('heading', { name: 'Embed a visualiser', level: 1 })).toBeVisible();
  const preview = page.locator('iframe[title^="Preview of the"]');
  await expect(preview).toHaveAttribute('src', '/embed/bubble-sort');

  await page.getByLabel('Visualiser').selectOption({ label: "Dijkstra's Algorithm" });
  await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Dark' }).click();
  await page.getByRole('group', { name: 'Opens in' }).getByRole('button', { name: 'Predict' }).click();
  await expect(preview).toHaveAttribute('src', '/embed/dijkstra?theme=dark&mode=predict');
  const code = page.getByLabel('Embed code');
  await expect(code).toContainText('/embed/dijkstra?theme=dark&mode=predict');
  await expect(code).toContainText('loading="lazy"');

  await page.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('/embed/dijkstra?theme=dark&mode=predict');

  // The embed itself opens in the mode the snippet names.
  await expect(preview.contentFrame().getByRole('button', { name: 'Predict', pressed: true })).toBeVisible();
});

test('the landing page links to the embed page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Embed a visualiser' }).click();
  await expect(page).toHaveURL(/\/embed$/);
});
