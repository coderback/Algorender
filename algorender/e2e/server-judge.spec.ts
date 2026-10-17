import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// Java, C++ and Go on a practice problem: they run on the server judge, so
// they need an account. Locally the judge is the Docker sandbox
// (npm run judge:image); without it the server says it isn't set up, and
// the tests that run code are skipped.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const TWO_SUM_JAVA = `class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            Integer j = seen.get(target - nums[i]);
            if (j != null) return new int[] {j, i};
            seen.put(nums[i], i);
        }
        return new int[0];
    }
}
`;

/** Java chosen, with this code saved, before the page loads (the sandbox's frames have no storage). */
async function withJava(context: BrowserContext, code: string) {
  await context.addInitScript((c) => {
    if (window !== window.top) return;
    localStorage.setItem('algorender:problem-language', 'java');
    localStorage.setItem('algorender:code:problem:two-sum:java', c);
  }, code);
}

async function signUp(page: Page) {
  await page.goto('/account');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Name').fill('Ada');
  await page.getByLabel('Email').fill(`judge-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  await page.getByLabel('Password').fill('a long enough password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Synced/ })).toBeVisible({ timeout: 20_000 });
}

/** Skips the rest of a test when this server has no sandbox to run code in. */
async function skipWithoutJudge(page: Page) {
  const unavailable = page.locator('main').getByRole('alert').filter({ hasText: 'isn’t set up here' });
  const results = page.getByRole('group', { name: 'Test results' }).or(page.locator('main').getByRole('alert'));
  await expect(results.first()).toBeVisible({ timeout: 90_000 });
  test.skip(await unavailable.isVisible(), 'No server judge here: build the Docker image with npm run judge:image.');
}

test('Java asks a signed-out learner to sign in, and keeps their code', async ({ page }) => {
  const errors = collectErrors(page);
  await withJava(page.context(), TWO_SUM_JAVA);
  await page.goto('/practice/two-sum');
  await expect(page.getByRole('button', { name: 'Java', pressed: true })).toBeVisible();
  await expect(page.getByText('Java runs on our server, so it needs an account')).toBeVisible();
  await page.getByRole('button', { name: 'Run examples' }).click();
  const card = page.locator('main').getByRole('alert').filter({ hasText: 'Sign in to run Java' });
  await expect(card).toBeVisible({ timeout: 20_000 }); // The first request also starts the database.
  await expect(card.getByRole('link', { name: /Sign in or create an account/ })).toHaveAttribute('href', '/account?next=%2Fpractice%2Ftwo-sum');
  // Errors expected here: the judge's 401.
  expect(errors.filter((e) => !/401/.test(e))).toEqual([]);
});

test('a signed-in learner solves a problem in Java on the server, and it counts as solved', async ({ page }) => {
  await withJava(page.context(), TWO_SUM_JAVA);
  await signUp(page);
  await page.goto('/practice/two-sum');
  await expect(page.getByText('Java is compiled and judged on our server')).toBeVisible();
  await page.getByRole('button', { name: 'Submit' }).click();
  await skipWithoutJudge(page);
  await expect(page.getByRole('group', { name: 'Test results' })).toContainText(/Solved: all \d+ tests pass\./);
  await expect(page.getByText('Compiled and judged on our server, in a sandbox.')).toBeVisible();
  await page.goto('/practice');
  await expect(page.getByText(/^1 of \d+ solved in this browser$/)).toBeVisible();
});

test('a compile error shows the compiler’s message at its line, and passes axe', async ({ page }) => {
  await withJava(page.context(), TWO_SUM_JAVA.replace('seen.put(nums[i], i);', 'seen.put(nums[i], i)'));
  await signUp(page);
  await page.goto('/practice/two-sum');
  await page.getByRole('button', { name: 'Run examples' }).click();
  await skipWithoutJudge(page);
  const error = page.locator('main').getByRole('alert').filter({ hasText: 'didn’t compile' });
  await expect(error).toContainText('on line 7');
  await expect(error).toContainText("Solution.java:7: error: ';' expected");
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  }
});
