import { expect, test } from '@playwright/test';
import { caseStudies } from '../src/content/designs';
import { collectErrors } from './errors';

// Phase 6d: the system-design canvas. Add a cache, wire it in, run traffic,
// read the results, and keep the design in the link.

const node = (name: string) => new RegExp(`^${name}, `);

test('the sandbox adds and wires a cache, runs traffic, shows results and keeps the design in the link', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/design/sandbox');
  await expect(page.getByRole('heading', { level: 1, name: 'Free design canvas' })).toBeVisible({ timeout: 30_000 });
  const run = page.getByRole('button', { name: 'Run', exact: true });
  await expect(run).toBeEnabled();

  // A new cache sends its misses to the only database, but nothing reads from it yet: Run waits.
  await page.getByRole('toolbar', { name: 'Add a component' }).getByRole('button', { name: 'Cache' }).click();
  await expect(page.getByRole('button', { name: node('Cache') })).toBeVisible();
  await expect(run).toBeDisabled();
  await expect(page.getByRole('alert').filter({ hasText: 'Fix this to run' })).toContainText('isn’t connected');

  // Read through the cache.
  await page.getByRole('button', { name: node('App servers') }).click();
  await page.getByLabel('Reads from').selectOption({ label: 'Cache' });
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('img', { name: /Latency over time/ })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Each component' })).toContainText('hit rate');
  await expect(page.getByRole('button', { name: node('Cache') })).toHaveAccessibleName(/hit rate/);

  // The link holds the design: reloading it brings the cache back, still wired.
  expect(new URL(page.url()).searchParams.get('d')).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('button', { name: node('Cache') })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();

  // Removing the database leaves the cache and app with nowhere to send: a message explains, and Run waits.
  await page.getByRole('button', { name: node('Database') }).click();
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert').filter({ hasText: 'Fix this to run' })).toContainText('doesn’t send anywhere yet');

  expect(errors).toEqual([]);
});

test('a case study checks the design against its targets', async ({ page }) => {
  const errors = collectErrors(page);
  const study = caseStudies.find((c) => c.slug === 'url-shortener')!;
  await page.goto(`/design/${study.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: study.title })).toBeVisible({ timeout: 30_000 });

  // The starting design (two app servers, one database) is swamped: it misses
  // throughput, latency and errors, though it is cheap.
  await page.getByRole('button', { name: 'Run the checks' }).click();
  const checks = page.getByRole('group', { name: /targets missed/ });
  await expect(checks).toBeVisible({ timeout: 60_000 });
  await expect(checks).toHaveAccessibleName('3 of 4 targets missed.');
  await expect(checks).toContainText('Missed: Throughput');
  await expect(checks).toContainText('Met: Cost');

  // The reference design (a cache and more app servers) meets every target.
  await page.getByRole('button', { name: 'Show a solution' }).click();
  await expect(page.getByRole('button', { name: node('Cache') })).toBeVisible();
  await page.getByRole('button', { name: 'Run the checks' }).click();
  await expect(page.getByRole('heading', { name: 'Every target is met.' })).toBeVisible({ timeout: 60_000 });

  // Switching back restores the learner's own design.
  await page.getByRole('button', { name: 'Back to my design' }).click();
  await expect(page.getByRole('button', { name: node('Cache') })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('every case study page opens with its brief and targets', async ({ page }) => {
  await page.goto('/design');
  for (const study of caseStudies) await expect(page.getByRole('link', { name: new RegExp(study.title) })).toBeVisible({ timeout: 30_000 });
  for (const study of caseStudies) {
    await page.goto(`/design/${study.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: study.title })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Run the checks' })).toBeEnabled();
  }
});
