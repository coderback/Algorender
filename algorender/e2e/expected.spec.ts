import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// The expected answer to a learner's own test on a practice problem: our
// solution's, from the server, for signed-in learners, compared with theirs.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const TWO_SUM_JS = `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
  return [];
}
`;

/** Forgets to reverse: hands the list back as it came. */
const REVERSE_WRONG_JS = `function reverseList(head) {
  return head;
}
`;

/** Its getMin gives the top instead. */
const MIN_STACK_WRONG_JS = `class MinStack {
  constructor() {
    this.items = [];
  }
  push(val) {
    this.items.push(val);
  }
  pop() {
    this.items.pop();
  }
  top() {
    return this.items[this.items.length - 1];
  }
  getMin() {
    return this.items[this.items.length - 1];
  }
}
`;

/** Code saved for each problem in JavaScript, before any page loads (the sandbox's frames have no storage). */
async function withCode(page: Page, codes: Record<string, string>) {
  await page.addInitScript((c) => {
    if (window !== window.top) return;
    localStorage.setItem('algorender:language', 'javascript');
    for (const [slug, code] of Object.entries(c)) localStorage.setItem(`algorender:code:problem:${slug}:javascript`, code);
  }, codes);
}

async function signUp(page: Page) {
  await page.goto('/account');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Name').fill('Ada');
  await page.getByLabel('Email').fill(`expected-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  await page.getByLabel('Password').fill('a long enough password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Synced/ })).toBeVisible({ timeout: 20_000 });
}

async function open(page: Page, slug: string) {
  await page.goto(`/practice/${slug}`);
  await expect(page.locator('.cm-editor')).toBeAttached();
}

const ownTest = (page: Page) => page.getByRole('region', { name: 'Your own test' });
const ownResult = (page: Page) => ownTest(page).getByRole('group', { name: 'Your test’s result' });
const run = (page: Page) => ownTest(page).getByRole('button', { name: 'Run your test' }).click();

test('a signed-in learner sees the expected answer beside their own, and whether they match', async ({ page }) => {
  const errors = collectErrors(page);
  await withCode(page, { 'two-sum': TWO_SUM_JS, 'reverse-linked-list': REVERSE_WRONG_JS, 'min-stack': MIN_STACK_WRONG_JS });
  await signUp(page);

  // Two Sum has several right answers: ours is one of them, and theirs is checked.
  await open(page, 'two-sum');
  await ownTest(page).getByLabel('nums', { exact: true }).fill('[5, 1, 5]');
  await ownTest(page).getByLabel('target', { exact: true }).fill('10');
  await run(page);
  await expect(ownResult(page).getByRole('term')).toHaveText(['Your answer', 'A right answer']);
  await expect(ownResult(page).getByRole('definition')).toHaveText(['[0, 2]', '[0, 2]']);
  await expect(ownResult(page)).toContainText('Right: it’s one of the right answers.');

  // A wrong answer says it doesn't match, under both answers.
  await open(page, 'reverse-linked-list');
  await run(page);
  await expect(ownResult(page).getByRole('definition')).toHaveText(['[4, 8, 15]', '[15, 8, 4]']);
  await expect(ownResult(page)).toContainText('Doesn’t match. It differs from the expected answer.');

  // A design problem marks the calls that differ.
  await open(page, 'min-stack');
  await ownTest(page).getByLabel('Calls, one per line').fill('MinStack()\npush(2)\npush(5)\ngetMin()\ntop()');
  await run(page);
  const calls = ownResult(page).getByRole('listitem');
  await expect(calls.nth(3)).toHaveText(/^getMin\(\).* 5 · expected 2$/);
  await expect(calls.nth(4)).toHaveText(/^top\(\).* 5$/);
  await expect(ownResult(page)).toContainText('Doesn’t match. Call 4, getMin(), should give 2, not 5.');

  // Calls the problem rules out (top() of an empty stack) have no expected answer.
  await ownTest(page).getByLabel('Calls, one per line').fill('MinStack()\ntop()');
  await run(page);
  await expect(ownResult(page)).toContainText('Our solution stops with an error at call 2, so this input is probably outside what the problem allows.');
  await expect(ownResult(page)).not.toContainText('match');
  expect(errors).toEqual([]);
});

test('signed out, the card offers sign-in for the expected answer', async ({ page }) => {
  await withCode(page, { 'two-sum': TWO_SUM_JS });
  await open(page, 'two-sum');
  await run(page);
  await expect(ownResult(page).getByRole('definition')).toHaveText('[0, 3]');
  const note = ownResult(page).getByText('to see the expected answer too');
  await expect(note).toBeVisible();
  await expect(note.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/account?next=%2Fpractice%2Ftwo-sum');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test('an answer that doesn’t match the expected one passes axe', async ({ page }) => {
      await withCode(page, { 'reverse-linked-list': REVERSE_WRONG_JS });
      await signUp(page);
      await open(page, 'reverse-linked-list');
      await run(page);
      await expect(ownResult(page)).toContainText('Doesn’t match.');
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
    });
  });
}
