import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// The replay console (the language tracks' L0 spike) in the real sandboxed
// workers: a two-file guessing game, answered line by line. Its page,
// /dev/console, is served only by `next dev`, so against a production build
// these tests skip themselves.

test.beforeEach(async ({ page }) => {
  const response = await page.goto('/dev/console');
  test.skip(response?.status() === 404, '/dev/console is served only by next dev');
});

/** Answers the program's prompt and waits for the rerun that echoes the answer. */
async function answer(page: Page, text: string) {
  const echoed = page.getByRole('log', { name: 'Console' }).locator('[data-kind="in"]');
  const before = await echoed.count();
  await page.getByLabel('Input for the program').fill(text);
  await page.getByLabel('Input for the program').press('Enter');
  await expect(echoed).toHaveCount(before + 1);
}

for (const language of ['Python', 'JavaScript', 'TypeScript'] as const) {
  test(`${language}: a program asks for input, imports its second file, and replays to the next prompt`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: language, exact: true }).click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    const console = page.getByRole('log', { name: 'Console' });
    await expect(console).toHaveText('Your name? ', { timeout: 60_000 });
    await expect(page.getByText('Waiting for input')).toBeVisible();

    await answer(page, 'Ada');
    await expect(console).toContainText("Your name? Ada\nHello, Ada. I'm thinking of a number from 1 to 20.\nGuess: ");

    // 0 and 21 are never right, so the replies are fixed whatever the seed.
    await answer(page, '0');
    await expect(console).toContainText('Guess: 0\nToo low\nGuess: ');
    await answer(page, '21');
    await expect(console).toContainText('Guess: 21\nToo high\nGuess: ');

    // Ending input reaches end of file at the next read.
    await page.getByRole('button', { name: 'End input' }).click();
    await expect(page.getByTestId('console').getByRole('alert')).toContainText('EOFError: EOF when reading a line');
    await expect(page.getByLabel('Input for the program')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('an error in the second file names that file and its line', async ({ page }) => {
  await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Python', exact: true }).click();
  await page.getByLabel('referee.py').fill('def verdict(guess, secret):\n    return 1 / 0\n');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await answer(page, 'Ada');
  await answer(page, '5');
  await expect(page.getByTestId('console').getByRole('alert')).toHaveText('ZeroDivisionError: division by zero (referee.py, line 2)');
});

test('the console page passes axe', async ({ page }) => {
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('Waiting for input')).toBeVisible({ timeout: 60_000 });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(results.violations).toEqual([]);
});
