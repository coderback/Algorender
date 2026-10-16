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

const tests = (page: Page) => page.getByRole('group', { name: 'Tests' });

test('a correct JavaScript solution passes every test and drives the array view', async ({ page }) => {
  const errors = collectErrors(page);
  await openWith(page, 'bubble-sort', 'javascript', BUBBLE_JS);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(tests(page)).toContainText('All 7 tests pass.');
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
  await expect(tests(page)).toContainText('All 7 tests pass.', { timeout: 90_000 });
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
    await expect(tests(page)).toContainText('All 7 tests pass.');
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

test('Parsons: ordering and indenting the lines solves bubble sort in Python', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem('algorender:language', 'python'));
  await page.goto('/code/bubble-sort');
  await page.getByRole('tab', { name: /Order the lines/ }).click();
  const lines: [string, number][] = [
    ['def bubble_sort(arr):', 0],
    ['n = len(arr)', 1],
    ['for i in range(n - 1):', 1],
    ['for j in range(n - 1 - i):', 2],
    ['if arr[j] > arr[j + 1]:', 3],
    ['arr[j], arr[j + 1] = arr[j + 1], arr[j]', 4],
  ];
  for (const [text, indent] of lines) {
    await page.getByRole('button', { name: `Add “${text}” to your program` }).click();
    for (let i = 0; i < indent; i++) await page.getByRole('button', { name: `Indent “${text}”` }).click();
  }
  // The two distractors are left over.
  await expect(page.getByRole('button', { name: /to your program$/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(tests(page)).toContainText('All 7 tests pass.', { timeout: 90_000 });
  await expect(page.getByRole('tab', { name: /Order the lines/ }).getByLabel('done')).toBeVisible();
});

test('fill the gaps: a wrong answer fails, a revealed gap passes, and levels hide more', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('algorender:language', 'javascript'));
  await page.goto('/code/insertion-sort');
  await page.getByRole('tab', { name: /Fill the gaps/ }).click();
  const gap = page.getByLabel('Gap 1 of 1, line 5');
  await gap.fill('arr[j] < key');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(tests(page)).not.toContainText('All 7 tests pass.');
  await page.getByRole('button', { name: 'Reveal a gap' }).click();
  await expect(gap).toHaveValue('arr[j] > key');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(tests(page)).toContainText('All 7 tests pass.');
  await page.getByRole('button', { name: '5 gaps' }).click();
  await expect(page.getByLabel(/^Gap \d of 5/)).toHaveCount(5);
});

test('a bug hunt explains the bug once it is fixed', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('algorender:language', 'javascript'));
  await page.goto('/code/bubble-sort-bug');
  await expect(page.locator('.cm-content')).toContainText('j < n - i');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(tests(page)).toContainText('RangeError');
  // The fixed code, saved as if typed (typing into the editor would fight its auto-indent).
  await page.evaluate((code) => localStorage.setItem('algorender:code:bubble-sort-bug:javascript', code), BUBBLE_JS);
  await page.reload();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(tests(page)).toContainText('All 7 tests pass.');
  await expect(page.getByText(/^Fixed\./)).toBeVisible();
});

test('the PRIMM lesson asks for a prediction before it runs the code', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('algorender:language', 'javascript'));
  await page.goto('/learn/sorting-in-code');
  const run = page.getByRole('button', { name: /Run it on mixed input/ });
  await expect(run).toBeDisabled();
  await page.getByRole('group', { name: 'Predict' }).getByRole('button', { name: 'At the end, index 5' }).click();
  await expect(page.getByRole('group', { name: 'Predict' })).toContainText('Right.');
  await run.click();
  await page.getByRole('button', { name: /Step forward/ }).first().click();
  await expect(page.getByTestId('narration').first()).toHaveText('Line 5 is arr[0] (5) > arr[1] (2)? Yes.');
  // Modify and Make embed their exercises.
  await expect(page.getByRole('heading', { name: 'Make bubble sort put the largest first' })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Ways to practise' })).toBeVisible();
});

test('line by line: an exercise run can play on the memory view', async ({ page }) => {
  const errors = collectErrors(page);
  await openWith(page, 'bubble-sort', 'javascript', BUBBLE_JS);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(tests(page)).toContainText('All 7 tests pass.');
  // Switching re-runs the same code, now recording every line.
  await page.getByLabel('Line by line, with memory').check();
  const memory = page.getByRole('group', { name: 'Memory' });
  await expect(memory).toBeVisible();
  await expect(page.getByTestId('narration')).toHaveText('The program starts at line 1.');
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: /Step forward/ }).click();
  await expect(page.getByTestId('narration')).toHaveText('Line 4: arr[j] > arr[j + 1]? Yes, so line 5 runs next.');
  await expect(memory.getByRole('group', { name: 'Frames' })).toContainText('bubbleSort, the current frame: arr refers to Array 1, i is 0, j is 0.');
  await expect(tests(page)).toContainText('All 7 tests pass.');
  expect(errors).toEqual([]);
});

test('the recursion lesson traces the call stack, and asks before the second run', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => localStorage.setItem('algorender:language', 'javascript'));
  await page.goto('/learn/recursion');
  const runs = page.getByRole('button', { name: 'Run it line by line' });
  await runs.first().click();
  const memory = page.getByRole('group', { name: 'Memory' }).first();
  await expect(memory).toBeVisible();
  const forward = page.getByRole('button', { name: /Step forward/ }).first();
  for (let i = 0; i < 8; i++) await forward.click();
  await expect(page.getByTestId('narration').first()).toHaveText('Line 5 calls factorial(1).');
  await expect(memory.getByRole('group', { name: 'Frames' })).toContainText('factorial (call 4), the current frame: n is 1');
  await forward.click();
  await expect(page.getByTestId('narration').first()).toHaveText('Line 2: n <= 1? Yes, so line 3 runs next.');

  await expect(runs.nth(1)).toBeDisabled();
  await page.getByRole('group', { name: 'Predict' }).getByRole('button', { name: 'One, shared by every call' }).click();
  await expect(page.getByRole('group', { name: 'Predict' })).toContainText('Right.');
  await runs.nth(1).click();
  await expect(page.getByTestId('narration').nth(1)).toHaveText('The program starts at line 1.');
  await page.getByRole('button', { name: /Step forward/ }).nth(1).click();
  await expect(page.getByTestId('narration').nth(1)).toHaveText('Line 1 defines total.');
  await expect(page.getByRole('group', { name: 'Memory' }).nth(1).getByRole('group', { name: 'Objects' })).toContainText('Function total (new).');
  expect(errors).toEqual([]);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the memory view passes axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.addInitScript(() => localStorage.setItem('algorender:language', 'javascript'));
    await page.goto('/learn/recursion');
    await page.getByRole('button', { name: 'Run it line by line' }).first().click();
    await expect(page.getByRole('group', { name: 'Memory' }).first()).toBeVisible();
    for (let i = 0; i < 9; i++) await page.getByRole('button', { name: /Step forward/ }).first().click();
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

const BFS_JS = `function bfsLevels(graph, start) {
  const level = { [start]: 0 };
  const queue = [start];
  while (queue.length > 0) {
    const u = queue.shift();
    for (const v of graph[u]) {
      if (!(v in level)) {
        level[v] = level[u] + 1;
        queue.push(v);
      }
    }
  }
  return level;
}
`;

const INSERT_JS = `function insert(root, val) {
  if (root === null) {
    return new TreeNode(val);
  }
  if (val < root.val) {
    root.left = insert(root.left, val);
  } else {
    root.right = insert(root.right, val);
  }
  return root;
}
`;

/** Steps forward until the narration says `text`, at most `limit` times. */
async function stepUntil(page: Page, text: string, limit = 40) {
  const narration = page.getByTestId('narration');
  for (let i = 0; i < limit && (await narration.textContent()) !== text; i++) {
    await page.getByRole('button', { name: /Step forward/ }).click();
  }
  await expect(narration).toHaveText(text);
}

test('graphs: a BFS in JavaScript passes, and its own queue and reads drive the graph view', async ({ page }) => {
  const errors = collectErrors(page);
  await openWith(page, 'bfs-levels', 'javascript', BFS_JS);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(tests(page)).toContainText('All 9 tests pass.');
  await expect(page.getByTestId('narration')).toHaveText('The program starts at line 1.');
  await stepUntil(page, 'Line 6 reads A’s neighbours (B, C), takes the edge A – B and sets v to "B".');
  await stepUntil(page, 'Line 9 appends "B" to queue.');
  await expect(page.getByRole('group', { name: 'queue' })).toContainText('B');
  await expect(page.getByText('Under each node:')).toContainText('level');
  // The memory diagram is one switch away, for the same run.
  await page.getByLabel('Show the memory diagram').check();
  await expect(page.getByRole('group', { name: 'Memory' })).toBeVisible();
  await expect(tests(page)).toContainText('All 9 tests pass.');
  expect(errors).toEqual([]);
});

test('trees: a BST insert in JavaScript passes, and the new node floats free until it is linked in', async ({ page }) => {
  const errors = collectErrors(page);
  await openWith(page, 'bst-insert', 'javascript', INSERT_JS);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(tests(page)).toContainText('All 8 tests pass.');
  await expect(tests(page)).toContainText('5 is in place: the left child of 7.');
  await stepUntil(page, 'insert returns TreeNode(5).');
  await expect(page.getByText(/2 separate trees of 5 nodes/)).toBeAttached();
  await page.getByRole('button', { name: /Step forward/ }).click();
  await expect(page.getByTestId('narration')).toHaveText('Line 6 sets root.left to TreeNode(5).');
  await expect(page.getByText(/A tree of 5 nodes, level by level: 4, 2, 7, 3, 5\./)).toBeAttached();
  expect(errors).toEqual([]);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the graph and tree views of learner code pass axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    const scan = async () => {
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    };
    await openWith(page, 'bfs-levels', 'javascript', BFS_JS);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await stepUntil(page, 'Line 9 appends "C" to queue.');
    await scan();
    await openWith(page, 'bst-insert', 'javascript', INSERT_JS);
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await stepUntil(page, 'insert returns TreeNode(5).');
    await scan();
  });
}

test('/code groups the exercises by kind', async ({ page }) => {
  await page.goto('/code');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Write it', 'Change it', 'Find the bug']);
});
