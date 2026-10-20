import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { collectErrors } from './errors';
import { seed } from './seed';

// Today (/) and the daily review, for a new learner and for one with a week of progress.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

test('a new learner gets a first lesson and nothing to review', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  // The top of the map: Big-O, which starts in its visualiser.
  await expect(page.getByRole('heading', { name: 'Big-O and growth' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open the visualiser' })).toHaveAttribute('href', '/compare');
  await expect(page.getByText('Nothing due, nice.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Set a goal' })).toBeVisible();
  // Mastery and mistakes wait until there is something to show.
  await expect(page.getByRole('heading', { name: 'Mastery by track' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Mistakes to clear' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Today picks up a learner’s week: the lesson in progress, reviews, plan, mistakes', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/explore');
  await seed(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Binary search: halve it until you find it' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Resume the lesson' })).toHaveAttribute('href', '/learn/binary-search');
  await expect(page.getByRole('heading', { name: 'Review due' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start review' })).toBeVisible();
  await expect(page.getByText(/Coding interviews · week \d+ of \d+ · 5 h a week/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mastery by track' })).toBeVisible();
  await expect(page.getByText('hi ← mid instead of hi ← mid − 1')).toBeVisible();
  await expect(page.getByText('Problem for today')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Your activity this week' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the review reveals with Space, grades with a number key, and counts progress', async ({ page }) => {
  await page.goto('/explore');
  await seed(page);
  await page.goto('/review');
  const progress = page.getByRole('progressbar', { name: 'Review progress' });
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  const total = Number(await progress.getAttribute('aria-valuemax'));
  await expect(page.getByRole('heading', { name: 'Two Sum' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('Hashing', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Rate your recall' }).getByRole('button')).toHaveCount(4);
  await page.keyboard.press('3');
  await expect(progress).toHaveAttribute('aria-valuenow', '2');
  await expect(progress).toHaveAttribute('aria-valuemax', String(total));
  await expect(page.getByRole('img', { name: /2 cards graded today: 2 Good/ })).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`Today and the review pass axe with progress (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/explore');
    await seed(page);
    for (const path of ['/', '/review']) {
      await page.goto(path);
      await page.getByRole('heading').first().waitFor();
      if (path === '/review') {
        await page.getByRole('button', { name: /Show answer/ }).click();
      } else {
        await expect(page.getByRole('heading', { name: 'Review due' })).toBeVisible();
      }
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`), path).toEqual([]);
    }
  });
}
