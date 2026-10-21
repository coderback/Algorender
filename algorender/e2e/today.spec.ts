import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { collectErrors } from './errors';
import { seed } from './seed';

// Today (/) and the daily review, for a new learner and for one with a week of progress.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

test('a new learner who skips the onboarding gets a first lesson and nothing to review', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/start');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(/\/$/);
  // The top of the map: Big-O, and its lesson.
  await expect(page.getByRole('heading', { name: 'Big-O: how the work grows with n' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start your first lesson' })).toHaveAttribute('href', '/learn/big-o');
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

test('a lesson read part of the way comes back on Today, and offers to continue from there', async ({ page }) => {
  await page.goto('/learn/binary-search');
  await page.waitForLoadState('networkidle');
  // The first section counts once it has been on screen for a couple of seconds; then read on to the third.
  await page.waitForTimeout(2500);
  const third = await page.locator('main section[id]').nth(2).getAttribute('id');
  await page.evaluate((id) => document.getElementById(id!)!.scrollIntoView({ block: 'start' }), third);
  await page.waitForTimeout(2500);

  await page.goto('/');
  const card = page.getByRole('article', { name: /Binary search/ });
  await expect(card.getByRole('list', { name: /^Read up to section 3 of \d+$/ })).toBeVisible();
  await expect(card).toContainText(/About \d+ minutes? left/);

  // The palette's Continue goes back to it too.
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('option', { name: /Continue learning/ })).toContainText('Back to');
  await page.keyboard.press('Escape');

  await card.getByRole('link', { name: 'Resume the lesson' }).click();
  const offer = page.getByRole('complementary', { name: 'Pick up where you left off' });
  await expect(offer).toContainText('section 3 of');
  await offer.getByRole('button', { name: /^Continue from / }).click();
  await expect(offer).toHaveCount(0);
  await expect(page.locator(`#${third}`)).toBeInViewport();
});
