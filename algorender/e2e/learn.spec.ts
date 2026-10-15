import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

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
