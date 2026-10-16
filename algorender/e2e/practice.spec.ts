import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

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

// Pairs every position with itself too: wrong when a number is half the target.
const TWO_SUM_WRONG = `function twoSum(nums, target) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = 0; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) return [i, j];
    }
  }
  return [];
}
`;

const TWO_SUM_PY = `def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
`;

const MIN_STACK_JS = `class MinStack {
  constructor() {
    this.items = [];
  }
  push(val) {
    const min = this.items.length ? Math.min(val, this.items[this.items.length - 1][1]) : val;
    this.items.push([val, min]);
  }
  pop() {
    this.items.pop();
  }
  top() {
    return this.items[this.items.length - 1][0];
  }
  getMin() {
    return this.items[this.items.length - 1][1];
  }
}
`;

/**
 * Opens a problem with code already saved for a language, as if the learner had typed it.
 * Init scripts run in every frame, and the code sandbox's frames have no storage.
 */
async function openWith(page: Page, slug: string, language: string, code: string) {
  await page.addInitScript(
    ([s, l, c]) => {
      if (window !== window.top) return;
      localStorage.setItem(`algorender:code:problem:${s}:${l}`, c);
      localStorage.setItem('algorender:language', l);
    },
    [slug, language, code],
  );
  await page.goto(`/practice/${slug}`);
  await expect(page.locator('.cm-editor')).toBeVisible();
}

const results = (page: Page) => page.getByRole('group', { name: 'Test results' });

test('the problem list groups by pattern, filters, and mixes the patterns away', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/practice');
  await expect(page.getByRole('heading', { level: 1, name: 'Practice problems' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Hashing' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Two Sum/ })).toBeVisible();

  await page.getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'Hard' }).click();
  await expect(page.getByRole('link', { name: /Two Sum/ })).toHaveCount(0);
  await page.getByRole('group', { name: 'Difficulty' }).getByRole('button', { name: 'All' }).click();

  await page.getByLabel('Mix them up and hide the patterns').check();
  await expect(page.getByRole('heading', { level: 2, name: 'Hashing' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Two Sum/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a wrong answer fails some tests, and a failing test can be watched line by line on the array', async ({ page }) => {
  const errors = collectErrors(page);
  await openWith(page, 'two-sum', 'javascript', TWO_SUM_WRONG);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(results(page)).toContainText(/\d+ of \d+ tests pass\./);
  // The first failure is selected: Example 2 pairs position 0 with itself.
  await expect(page.getByRole('button', { name: 'Example 2: wrong answer' })).toHaveAttribute('aria-pressed', 'true');
  await expect(results(page)).toContainText('The two indices must be different: [0, 0].');

  await page.getByRole('button', { name: 'Watch your code on this test' }).click();
  const watch = page.locator('#watch');
  await expect(watch.getByRole('heading', { name: 'Watching example 2' })).toBeVisible();
  // Line by line: a step in, the index variables are drawn under the array.
  const forward = watch.getByRole('button', { name: /Step forward/ });
  for (let i = 0; i < 3; i++) await forward.click();
  await expect(watch.getByTestId('narration')).toContainText('Line');
  await expect(page.locator('.cm-run-line')).toBeVisible();

  await watch.getByRole('button', { name: 'Line by line, with memory' }).click();
  await expect(watch.getByRole('heading', { name: 'Watching example 2, line by line' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a right answer solves the problem, and the list remembers it', async ({ page }) => {
  const errors = collectErrors(page);
  await openWith(page, 'two-sum', 'javascript', TWO_SUM_JS);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(results(page)).toContainText(/Solved: all \d+ tests pass\./);
  await page.goto('/practice');
  await expect(page.getByText(/1 of \d+ solved in this browser/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Two Sum/ }).getByLabel('Solved')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Python solves a problem in the browser', async ({ page }) => {
  test.slow(); // Pyodide loads on first use
  const errors = collectErrors(page);
  await openWith(page, 'two-sum', 'python', TWO_SUM_PY);
  await expect(page.getByText('Ready.')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Run examples' }).click();
  await expect(results(page)).toContainText('All 2 examples pass. Submit to run every test.');
  expect(errors).toEqual([]);
});

test('a design problem is judged call by call', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem('algorender:language', 'javascript');
  });
  await page.goto('/practice/min-stack');
  await page.getByRole('button', { name: 'Run examples' }).click();
  await expect(results(page)).toContainText('Call 5, getMin(), should give 2, not null.');

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(MIN_STACK_JS);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(results(page)).toContainText(/Solved: all \d+ tests pass\./);
  expect(errors).toEqual([]);
});

test('a syntax error is reported once, on its line', async ({ page }) => {
  await openWith(page, 'two-sum', 'javascript', 'function twoSum(nums, target) {\n  return [0, 1\n}\n');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Your code doesn’t parse' })).toContainText('on line 3');
  await expect(results(page)).toHaveCount(0);
});

test('pattern drills ask, explain, and score a round', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/practice/drills');
  const options = page.getByRole('group', { name: 'Which pattern fits best?' }).getByRole('button');
  await expect(options).toHaveCount(4);
  const total = Number((await page.getByText(/Question 1 of \d+/).textContent())!.match(/of (\d+)/)![1]);
  for (let i = 0; i < total; i++) {
    await options.first().click();
    await expect(page.getByText(/^(Right: |Not quite: it’s )/)).toBeVisible();
    await page.getByRole('button', { name: i + 1 < total ? 'Next question' : 'See your score' }).click();
  }
  await expect(page.getByRole('heading', { name: new RegExp(`You named \\d+ of ${total} patterns\\.`) })).toBeVisible();
  await page.getByRole('button', { name: 'Another round' }).click();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  expect(errors).toEqual([]);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const path of ['/practice', '/practice/drills', '/practice/min-stack', '/practice/rotate-image', '/practice/course-schedule-ii']) {
      test(`${path} passes axe`, async ({ page }) => {
        await page.goto(path);
        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
      });
    }

    test('results and a replay pass axe', async ({ page }) => {
      await openWith(page, 'two-sum', 'javascript', TWO_SUM_WRONG);
      await page.getByRole('button', { name: 'Submit' }).click();
      await expect(results(page)).toBeVisible();
      await page.getByText('Show the pattern').click();
      await page.getByRole('button', { name: 'Watch your code on this test' }).click();
      await page.locator('#watch').getByRole('button', { name: /Step forward/ }).click();
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
    });
  });
}
