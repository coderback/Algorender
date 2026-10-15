import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

const BUBBLE_JS = `function bubbleSort(arr) {
  for (let i = 0; i < arr.length - 1; i++) {
    for (let j = 0; j < arr.length - 1 - i; j++) {
      if (arr[j] > arr[j + 1]) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
      }
    }
  }
}
`;

const BUBBLE_PY = `def bubble_sort(arr):
    for i in range(len(arr) - 1):
        for j in range(len(arr) - 1 - i):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
`;

/** Opens an exercise with code already saved for a language, as if the learner had typed it. */
async function openWith(page: Page, slug: string, language: string, code: string) {
  await page.addInitScript(
    ([s, l, c]) => {
      localStorage.setItem(`algorender:code:${s}:${l}`, c);
      localStorage.setItem('algorender:language', l);
    },
    [slug, language, code],
  );
  await page.goto(`/code/${slug}`);
  await expect(page.locator('.cm-editor')).toBeVisible();
}

const tests = (page: Page) => page.getByRole('region', { name: 'Tests' });

test('a correct JavaScript solution passes every test and drives the array view', async ({ page }) => {
  const errors = collectErrors(page);
  await openWith(page, 'bubble-sort', 'javascript', BUBBLE_JS);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(tests(page).getByRole('heading')).toContainText('All 7 tests pass.');
  await expect(page.getByTestId('narration')).toHaveText('Your function receives arr = [5, 2, 9, 1, 6, 3].');
  await page.getByRole('button', { name: /Step forward/ }).click();
  await expect(page.getByTestId('narration')).toHaveText('Line 4 is arr[0] (5) > arr[1] (2)? Yes.');
  // The editor highlights the line the trace is on, and the code panel numbers every line.
  await expect(page.locator('.cm-run-line')).toHaveText(/if \(arr\[j\] > arr\[j \+ 1\]\)/);
  const codePanel = page.locator('section', { has: page.getByRole('heading', { name: 'Your code' }) });
  await expect(codePanel.locator('[aria-current="step"]')).toContainText('if (arr[j] > arr[j + 1])');
  expect(errors).toEqual([]);
});

test('a correct Python solution runs in Pyodide and passes', async ({ page }) => {
  test.setTimeout(120_000); // the first load fetches Python (~6 MB) from the CDN
  await openWith(page, 'bubble-sort', 'python', BUBBLE_PY);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(tests(page).getByRole('heading')).toContainText('All 7 tests pass.', { timeout: 90_000 });
  await page.getByRole('button', { name: /Step forward/ }).click();
  await expect(page.getByTestId('narration')).toHaveText('Line 4 is arr[0] (5) > arr[1] (2)? Yes.');
});

test('a syntax error is reported on its line and runs no tests', async ({ page }) => {
  await openWith(page, 'bubble-sort', 'javascript', 'function bubbleSort(arr) {\n  for (let i = 0; i < arr.length; i++ {\n  }\n}\n');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'doesn’t parse' });
  await expect(alert).toContainText('on line 2');
  await expect(tests(page)).toHaveCount(0);
  await expect(page.locator('.cm-error-line')).toHaveText(/for \(let i = 0/);
});

test('each language keeps its own code, and reset asks before discarding it', async ({ page }) => {
  await openWith(page, 'insertion-sort', 'javascript', '// my attempt\nfunction insertionSort(arr) {}\n');
  await expect(page.locator('.cm-content')).toContainText('// my attempt');
  await page.getByRole('button', { name: 'Python', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('def insertion_sort(arr):');
  await page.getByRole('button', { name: 'JavaScript', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('// my attempt');

  await page.getByRole('button', { name: 'Reset code' }).click();
  await page.getByRole('button', { name: 'Keep it' }).click();
  await expect(page.locator('.cm-content')).toContainText('// my attempt');
  await page.getByRole('button', { name: 'Reset code' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText('Slide each element left');
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`a finished run passes axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await openWith(page, 'bubble-sort', 'javascript', BUBBLE_JS);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(tests(page).getByRole('heading')).toContainText('All 7 tests pass.');
    await page.getByRole('button', { name: /Step forward/ }).click();
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('a visualiser links to its exercise, and /code lists them', async ({ page }) => {
  await page.goto('/visualisers/selection-sort');
  await page.getByRole('link', { name: /Write it yourself/ }).click();
  await expect(page).toHaveURL(/\/code\/selection-sort$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Write selection sort');
  await page.goto('/code');
  await expect(page.getByRole('link', { name: /Write binary search/ })).toBeVisible();
});
