import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

/** The same axe rules as a11y.spec.ts, on whatever the page shows now. */
async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

const lessonPaths = ['binary-search', 'two-pointers', 'memoization', 'dijkstra'];

async function openLesson(page: Page, slug: string) {
  await page.goto(`/learn/${slug}`);
  // Every embedded visualiser hydrates independently.
  await expect(page.locator('[data-hydrated="false"]')).toHaveCount(0);
  await expect(page.locator('[data-hydrated="true"]').first()).toBeVisible();
}

test('the concept map links lessons and visualisers', async ({ page }) => {
  await page.goto('/learn');
  await expect(page.getByRole('heading', { level: 1, name: 'The concept map' })).toBeVisible();
  await page.getByRole('link', { name: /Lesson/ }).first().click();
  await expect(page).toHaveURL(/\/learn\/[a-z-]+$/, { timeout: 30_000 }); // the first visit compiles the route in dev
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the placement check lets a beginner off early and says where to start', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/learn');
  await expect(page.getByRole('heading', { name: 'Where to start' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: 'Take the placement check' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Placement check' })).toBeVisible({ timeout: 30_000 });
  // Data structures and algorithms is picked by default; three misses there end the check.
  await page.getByRole('button', { name: 'Start' }).click();
  await expectAccessible(page);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Not sure' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Done: 0 of 3 right' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Big-O and growth/ })).toBeVisible();

  await page.getByRole('link', { name: 'See the concept map' }).click();
  await expect(page.getByRole('heading', { name: 'Your next steps' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Retake the placement check' })).toBeVisible();
  await expect(page.locator('#big-o [data-status="new"]')).toHaveText('Ready to start');
  await expectAccessible(page);
  expect(errors).toEqual([]);
});

test('answering a lesson question puts its concept in progress on the map', async ({ page }) => {
  await openLesson(page, 'binary-search');
  await page.getByRole('group', { name: 'Question 1' }).getByRole('button').first().click();
  await page.goto('/learn');
  await expect(page.locator('#binary-search [data-status="learning"]')).toHaveText('Learning', { timeout: 30_000 });
  await expect(page.getByText('Pick up where you left off')).toBeVisible();
});

for (const slug of lessonPaths) {
  test(`${slug} lesson renders every stage with no console errors`, async ({ page }) => {
    const errors = collectErrors(page);
    await openLesson(page, slug);
    for (const stage of ['Why it matters', 'Key parts', 'See it work', 'Predict', 'Check yourself', 'Recap']) {
      await expect(page.getByText(stage, { exact: true }).first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test('keyboard shortcuts only drive the visualiser being used', async ({ page }) => {
  await openLesson(page, 'binary-search');
  const stages = page.locator('[data-hydrated="true"]');
  const first = stages.nth(0);
  const second = stages.nth(1);
  await first.getByRole('button', { name: /Step forward/ }).click();
  await page.keyboard.press('ArrowRight');
  await expect(first.getByText(/^3\/\d+$/)).toBeVisible();
  await expect(second.getByText(/^1\/\d+$/)).toBeVisible();
});

test('the prediction challenge counts answers towards its goal', async ({ page }) => {
  await openLesson(page, 'binary-search');
  const challenge = page.locator('.space-y-3', { has: page.getByText(/Make 4 predictions/) }).first();
  const forward = challenge.getByRole('button', { name: /Step forward|Answer the question first/ });
  const question = challenge.getByRole('group', { name: 'Predict the next step' });
  for (let answered = 0; answered < 4; ) {
    await page.waitForTimeout(150); // let the last step render before deciding
    // An answered question stays on screen (with its feedback) until you step on.
    const choice = question.getByRole('button').first();
    if ((await question.isVisible()) && (await choice.isEnabled())) {
      await choice.click();
      answered++;
    } else {
      await forward.click();
    }
  }
  // The banner that identified the challenge now reads "Done", so look page-wide.
  await expect(page.getByText(/Done: \d of 4 predictions right/)).toBeVisible();
});

test('a quiz scores answers and completion is remembered', async ({ page }) => {
  await openLesson(page, 'two-pointers');
  const questions = page.getByRole('group', { name: /^Question \d$/ });
  const count = await questions.count();
  for (let i = 0; i < count; i++) await questions.nth(i).getByRole('button').first().click();
  await expect(page.getByText(new RegExp(`\\d of ${count} right`))).toBeVisible();

  await page.getByRole('button', { name: 'Mark as complete' }).click();
  await expect(page.getByRole('button', { name: 'Completed' })).toBeVisible();
  await page.goto('/learn');
  await expect(page.locator('#two-pointers').getByText('Done')).toBeVisible();
});
