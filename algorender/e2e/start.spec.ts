import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { lessons } from '../src/content/lessons';
import { visualisers } from '../src/data/visualisers.js';
import { collectErrors } from './errors';
import { seed } from './seed';

// The way in (Phase 8): the landing page for a first visit to /, Today once
// there is progress, and the onboarding at /start.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

test('a first visit to / gets the landing page, counted from content', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Watch algorithms think.' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' })).toHaveCount(0);
  const stats = page.getByRole('region', { name: 'What’s inside' });
  const listed = visualisers.filter((v: { hidden?: boolean }) => !v.hidden).length;
  await expect(stats.getByText(String(listed), { exact: true })).toBeVisible();
  await expect(stats.getByText(String(lessons.length), { exact: true })).toBeVisible();
  await expect(stats.getByText('6 languages')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start learning, free' }).first()).toHaveAttribute('href', '/start');
  await expect(page.getByRole('link', { name: 'Try one now, no account' })).toHaveAttribute('href', '/visualisers/bubble-sort');

  // The hero is a real bubble sort, paused at a Predict question.
  const demo = page.getByRole('group', { name: /Try bubble sort/ });
  await expect(demo.getByText('Are 4 and 3 out of order?')).toBeVisible();
  await expect(demo.getByRole('button', { name: 'Next step' })).toBeDisabled();
  await demo.getByRole('button', { name: 'Yes' }).click();
  await expect(demo.getByRole('status')).toHaveText('Right. 1 of 1 so far.');
  await expect(demo.getByRole('button', { name: 'Next step' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('/ is Today for a learner with progress on the device', async ({ page }) => {
  await page.goto('/explore');
  await seed(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Review due' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Watch algorithms think.' })).toHaveCount(0);
  // The next visit knows before the store is read: no landing page in between.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-home', 'today');
});

test('the onboarding sets a goal and hours, and Today follows the plan', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/start');
  await expect(page.getByRole('heading', { level: 1, name: 'What are you learning for?' })).toBeVisible();
  await page.getByText('Machine learning foundations', { exact: true }).click();
  await expect(page.getByRole('radio', { name: /^Machine learning foundations/ })).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'How much time do you have?' })).toBeFocused();
  await page.getByText('8 h', { exact: true }).click();
  await expect(page.getByRole('radio', { name: /^8 h/ })).toBeChecked();
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  await page.getByRole('button', { name: 'Continue' }).click();

  // The placement check is there to take, but optional.
  await expect(page.getByRole('heading', { level: 1, name: 'What do you already know?' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Machine learning/ })).toBeChecked();
  await page.getByRole('button', { name: 'Skip the check' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Your plan' })).toBeVisible();
  await expect(page.getByText(/^\d+ weeks?$/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Week 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Start learning' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/Machine learning foundations · week 1 of \d+ · 8 h a week/)).toBeVisible();
  expect(errors).toEqual([]);
});
