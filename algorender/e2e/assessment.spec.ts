import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// Phase 5d: common mistakes caught by quiz answers (named on the spot, listed
// on the concept map, asked again in review), and explain-it-back.

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

async function openLesson(page: Page, slug: string) {
  await page.goto(`/learn/${slug}`);
  await expect(page.locator('[data-hydrated="false"]')).toHaveCount(0, { timeout: 30_000 });
}

const DAY = 86_400_000;

test('a quiz answer that comes from a common mistake names it, lists it on the map, and asks about it again in review', async ({ page, context }) => {
  const errors = collectErrors(page);
  await openLesson(page, 'binary-search');
  // "lo ← mid" is the keep-mid mistake's trap.
  await page.getByRole('group', { name: 'Question 3' }).getByRole('button', { name: 'lo ← mid', exact: true }).click();
  const note = page.getByText('That answer comes from a common mistake:');
  await expect(note).toBeVisible();
  await expect(note.getByRole('link', { name: 'hi ← mid instead of hi ← mid − 1' })).toHaveAttribute('href', '#mistake-keep-mid');
  await expect(page.locator('#mistake-keep-mid [data-mistake="open"]')).toBeVisible();
  await expectAccessible(page);

  await page.goto('/learn');
  const panel = page.getByRole('region', { name: 'Mistakes to clear' });
  await expect(panel.getByRole('link', { name: /hi ← mid instead of hi ← mid − 1/ })).toBeVisible({ timeout: 30_000 });
  await expectAccessible(page);

  // Not due today; tomorrow the card asks one of the mistake's probe questions, then shows the correction.
  await page.goto('/review');
  await expect(page.getByText(/Nothing due today|All done/)).toBeVisible({ timeout: 30_000 });
  const tomorrow = await context.newPage();
  await tomorrow.clock.install({ time: new Date(Date.now() + 2 * DAY) });
  await tomorrow.goto('/review');
  const card = tomorrow.getByRole('article');
  await expect(card).toBeVisible({ timeout: 30_000 });
  // The quiz question itself is due too; answer it to reach the mistake's card.
  if (!(await card.getByText(/a mistake you made before/).isVisible())) {
    await card.getByRole('group', { name: 'Choices' }).getByRole('button').first().click();
    // The grades sit under the card.
    await tomorrow.getByRole('group', { name: 'Rate your recall' }).getByRole('button').first().click();
  }
  await expect(card.getByText(/a mistake you made before/)).toBeVisible();
  await expect(card.getByText('The mistake this checks')).toHaveCount(0);
  await card.getByRole('group', { name: 'Choices' }).getByRole('button').first().click();
  await expect(card.getByText('The mistake this checks: hi ← mid instead of hi ← mid − 1')).toBeVisible();
  await expectAccessible(tomorrow);
  expect(errors).toEqual([]);
});

test('explain it back: write it in your own words, then score it against the key points', async ({ page }) => {
  const errors = collectErrors(page);
  await openLesson(page, 'binary-search');
  const box = page.getByLabel(/Why may binary search throw away half the array/);
  await box.fill('Because it is sorted.');
  const check = page.getByRole('button', { name: /Check it (against the key points|myself instead)/ });
  await expect(check).toBeDisabled();
  await box.fill('Because the array is sorted, one comparison with the middle tells you which half can hold the target, so the other half goes.');
  await check.click();

  const points = page.getByRole('group').filter({ has: page.getByRole('radio') });
  await expect(points).toHaveCount(4);
  await expect(page.getByText('An example answer')).toBeVisible();
  const save = page.getByRole('button', { name: 'Save my score' });
  await expect(save).toBeDisabled();
  for (const [i, answer] of ['Yes', 'Yes', 'Partly', 'No'].entries()) await points.nth(i).getByRole('radio', { name: answer }).check();
  await expectAccessible(page);
  await save.click();
  await expect(page.getByText('2 of 4 key points covered, 1 partly.')).toBeVisible();
  await expect(page.getByText('Scored by you')).toBeVisible();

  // The score is kept; the draft too.
  await page.reload();
  await expect(page.getByText('Last time: 2 of 4 points covered, 1 partly.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel(/Why may binary search throw away half the array/)).toHaveValue(/one comparison with the middle/);
  expect(errors).toEqual([]);
});

test('with the tutor on, a signed-in learner’s explanation is scored by the model', async ({ page }) => {
  const res = await page.request.get('/api/explain');
  test.skip(!((await res.json()) as { enabled?: boolean }).enabled, 'The tutor is off on this server (start it with TUTOR_PROVIDER=fake).');
  const errors = collectErrors(page);
  await page.goto('/account');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Name').fill('Ada');
  await page.getByLabel('Email').fill(`explain-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  await page.getByLabel('Password').fill('a long enough password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Synced/ })).toBeVisible({ timeout: 20_000 });

  await openLesson(page, 'binary-search');
  // The stand-in model flags the lesson's first common mistake when the text says MISTAKE.
  await page.getByLabel(/Why may binary search throw away half the array/).fill('The array is sorted, so you keep mid in the window when it is too big. MISTAKE');
  await page.getByRole('button', { name: 'Score my explanation' }).click();
  await expect(page.getByText('1 of 4 key points covered, 1 partly.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Scored by the tutor model')).toBeVisible();
  await expect(page.getByText('You wrote: “The array is”')).toBeVisible();
  await expect(page.getByText('Your explanation says something the lesson lists as a common mistake:')).toBeVisible();
  await expect(page.locator('#mistake-keep-mid [data-mistake="open"]')).toBeVisible();
  await expectAccessible(page);
  expect(errors).toEqual([]);
});
