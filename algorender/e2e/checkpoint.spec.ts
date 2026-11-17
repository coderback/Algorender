import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// The math and ML path's infrastructure (batch B0): its tracks on the concept
// map, a stage's checkpoint, and its milestones in a study plan.

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`a checkpoint asks a round, says what to look at again, and waits a week to be retaken (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    const errors = collectErrors(page);
    await page.goto('/learn/checkpoint/2');
    await expect(page.getByRole('heading', { name: 'Checkpoint 2 of 10' })).toBeVisible();
    await expect(page.getByText('Calculus and backpropagation', { exact: true })).toBeVisible();
    const start = page.getByRole('button', { name: 'Start' });
    await expect(start).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /^12 questions, about \d+ minutes$/ })).toBeVisible();
    await expectAccessible(page);

    await start.click();
    for (let i = 1; i <= 12; i++) {
      await expect(page.getByText(new RegExp(`question ${i} of 12$`))).toBeVisible();
      // Answer the first half with the first choice, then say "Not sure".
      if (i <= 6) await page.getByRole('group', { name: 'Choices' }).getByRole('button').first().click();
      else await page.getByRole('button', { name: 'Not sure' }).click();
      await expect(page.getByRole('status').filter({ hasText: /Right\.|Not quite\.|No problem\.|common mistake/ })).toBeVisible();
      if (i === 1) await expectAccessible(page);
      await page.getByRole('button', { name: i === 12 ? 'See how it went' : 'Next', exact: true }).click();
    }

    await expect(page.getByRole('heading', { name: /^Done: \d+ of 12 right$/ })).toBeVisible();
    await expect(page.getByRole('list', { name: 'By concept' }).getByRole('listitem').first()).toBeVisible();
    // Six "not sure" answers leave something worth another look.
    await expect(page.getByText('Worth another look')).toBeVisible();
    await expectAccessible(page);

    // The round is in the event log: back at the start it shows, and the retake waits a week.
    await page.reload();
    await expect(page.getByText(/^Last time: \d+ of 12 right/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Take it again' })).toBeDisabled();
    await expect(page.getByText(/^You can take it again from /)).toBeVisible();
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });
}

test('a checkpoint whose stage has too few lessons yet says it isn’t open', async ({ page }) => {
  await page.goto('/learn/checkpoint/7');
  await expect(page.getByRole('heading', { name: 'Not open yet' })).toBeVisible();
  await expect(page.getByText(/0 of its 8 concepts have lessons so far/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
});

test('the concept map shows the math and ML tracks, with the road ahead coming soon', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/learn');
  for (const track of ['The math toolkit', 'Linear algebra', 'Calculus and optimisation', 'Probability and statistics', 'Classical machine learning', 'Deep learning', 'Language models']) {
    await expect(page.getByRole('heading', { name: track, level: 2 })).toBeVisible({ timeout: 30_000 });
  }
  // Interpretability has nothing available yet, so it waits under "coming next".
  await expect(page.getByRole('heading', { name: 'Interpretability', level: 2 })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show all tracks' }).click();
  const interpretability = page.getByRole('region', { name: 'Interpretability' });
  await expect(interpretability).toBeVisible();
  await expect(interpretability.getByText('Coming soon').first()).toBeVisible();

  // A planned concept opens as coming soon, with what it builds on.
  const linear = page.getByRole('region', { name: 'Linear algebra' });
  await linear.getByRole('button', { name: /Matrix multiplication/ }).click();
  const selected = page.getByRole('region', { name: 'Matrix multiplication' });
  await expect(selected.getByText('Coming soon')).toBeVisible();
  await expectAccessible(page);
  expect(errors).toEqual([]);
});

test('a plan toward machine learning from zero schedules the stages’ checkpoints', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/plan');
  await expect(page.getByRole('button', { name: 'Make my plan' })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Machine learning from zero').check();
  await page.getByText('5 h', { exact: true }).click();
  await page.getByRole('button', { name: 'Make my plan' }).click();
  await expect(page.getByRole('heading', { name: 'Machine learning from zero' })).toBeVisible();
  const milestone = page.getByRole('link', { name: /Milestone 1.*Checkpoint: Vectors, matrices and least squares/ });
  await expect(milestone).toBeVisible();
  await expectAccessible(page);
  await milestone.click();
  await expect(page).toHaveURL(/\/learn\/checkpoint\/1$/);
  await expect(page.getByRole('heading', { name: 'Checkpoint 1 of 10' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a visualiser with pretrained weights fetches them before it plays', async ({ page }) => {
  const errors = collectErrors(page);
  const fetched: string[] = [];
  page.on('request', (r) => r.url().includes('/models/') && fetched.push(new URL(r.url()).pathname));
  await page.goto('/visualisers/bubble-sort');
  await page.locator('[data-hydrated="true"]').waitFor();
  expect(fetched).toEqual([]);
  await page.goto('/visualisers/diffusion');
  await page.locator('[data-hydrated="true"]').waitFor();
  expect(fetched).toEqual(['/models/diffusion.json']);
  await expect(page.getByRole('button', { name: /Step forward/ })).toBeEnabled();
  expect(errors).toEqual([]);
});
