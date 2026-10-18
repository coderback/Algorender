import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// The AI tutor beside a practice problem. It needs a server with the tutor
// switched on: locally, start it with TUTOR_PROVIDER=fake, which answers from
// a stand-in model ("(fast model, level 1) …"). Without it these tests skip.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function signUp(page: Page) {
  await page.goto('/account');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Name').fill('Ada');
  await page.getByLabel('Email').fill(`tutor-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  await page.getByLabel('Password').fill('a long enough password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Synced/ })).toBeVisible({ timeout: 20_000 });
}

async function skipWithoutTutor(page: Page) {
  const res = await page.request.get('/api/tutor');
  const body = (await res.json()) as { enabled?: boolean };
  test.skip(!body.enabled, 'The tutor is off on this server (start it with TUTOR_PROVIDER=fake).');
}

test('a signed-out learner is asked to sign in', async ({ page }) => {
  await skipWithoutTutor(page);
  await page.goto('/practice/two-sum');
  await expect(page.getByRole('link', { name: 'Sign in to ask it' })).toBeVisible({ timeout: 30_000 });
});

test('the tutor climbs the hint ladder, points at a line, and reviews a failed run', async ({ page }) => {
  await skipWithoutTutor(page);
  const errors = collectErrors(page);
  // JavaScript runs at once; Python would wait for Pyodide to download. (The sandbox's frames have no storage.)
  await page.context().addInitScript(() => {
    if (window === window.top) localStorage.setItem('algorender:problem-language', 'javascript');
  });
  await signUp(page);
  await page.goto('/practice/two-sum');
  await page.getByRole('button', { name: /Stuck\? Ask the tutor/ }).click();
  const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Tutor' }) });
  await expect(panel.getByText(/30 turns left today/)).toBeVisible();

  // The first hint needs the learner's own account of what is happening.
  const nudge = panel.getByRole('button', { name: 'Get a nudge' });
  await expect(nudge).toBeDisabled();
  await panel.getByLabel(/what do you think is happening/).fill('I think I need to find two numbers that add up to the target.');
  await nudge.click();
  await expect(panel.getByText('(fast model, level 1)')).toBeVisible();
  await expect(panel.getByText(/29 turns left today/)).toBeVisible();
  await new AxeBuilder({ page }).withTags(TAGS).analyze().then(({ violations }) => expect(violations.map((v) => v.id)).toEqual([]));

  // One level at a time: the next button names the next level, and level 2 points at a line in the editor.
  await panel.getByLabel(/What will you try/).fill('Loop over pairs');
  await panel.getByRole('button', { name: 'Next hint: Where to look' }).click();
  await expect(panel.getByText('(fast model, level 2)')).toBeVisible();
  await expect(panel.getByText("I'll try: Loop over pairs")).toBeVisible();
  await expect(page.locator('.cm-point-line')).toHaveCount(1);
  await expect(panel.getByRole('button', { name: 'Show line 1' })).toBeVisible();

  // A review needs a failed run and a fresh account of what is wrong, and uses the strong model.
  const review = panel.getByRole('button', { name: 'Review my code' });
  await expect(review).toBeDisabled();
  await page.getByRole('button', { name: 'Run examples' }).click();
  await expect(page.getByRole('group', { name: 'Test results' })).toBeVisible({ timeout: 60_000 });
  await panel.getByLabel(/What do you think is wrong now/).fill('The starter returns nothing yet.');
  await review.click();
  await expect(panel.getByText('(strong model, level 2)')).toBeVisible();

  // A follow-up question stays at the current level.
  await panel.getByLabel('Ask a follow-up question').fill('Which data structure helps?');
  await panel.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(panel.getByText('Which data structure helps?')).toBeVisible();
  await expect(panel.getByText(/26 turns left today/)).toBeVisible();
  expect(errors).toEqual([]);
});
