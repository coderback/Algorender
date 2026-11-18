import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// B2 of the math and ML path (vectors, the dot product, norms and matrix
// multiplication): the visualisers' handles, the concepts live on the map,
// and the matrix exercise judged on grids.

const narration = (page: Page) => page.getByTestId('narration');

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-hydrated="true"]').waitFor();
}

test('dragging u moves the sum, and the text input follows', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '/visualisers/vectors?preset=add&step=1');
  await expect(narration(page)).toContainText('you end at (4, 3)');
  await page.getByRole('button', { name: /^Tip of u at \(3, 1\)/ }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#custom-input')).toHaveValue('add 2.5 1 + 1 2');
  await expect(narration(page)).toContainText('you end at (3.5, 3)');
  expect(errors).toEqual([]);
});

test('moving B changes which point each ruler calls nearest', async ({ page }) => {
  await open(page, '/visualisers/norms?preset=nearest&step=4');
  await expect(narration(page)).toContainText('L2 picks B, L1 picks A and L∞ picks B');
  await page.getByRole('button', { name: /^Point B at \(2, 2\)/ }).focus();
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(page.locator('#custom-input')).toHaveValue('nearest 0 0, 3 0, 0 2');
  await expect(narration(page)).toContainText('all three rulers agree (B)');
});

test('dragging a column of B changes the composed product', async ({ page }) => {
  await open(page, '/visualisers/matrix-multiplication?preset=compose&step=1');
  await expect(narration(page)).toContainText('B sends î to its first column (2, 0)');
  await page.getByRole('button', { name: /^Where B sends î at \(2, 0\)/ }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#custom-input')).toHaveValue('compose [[0, -1], [1, 0]] [[2, 0], [0.5, 1]]');
  await expect(narration(page)).toContainText('B sends î to its first column (2, 0.5)');
});

test('B2’s concepts are live on the map, each opening its lesson', async ({ page }) => {
  for (const [id, lesson] of [
    ['vectors', 'Vectors'],
    ['dot-product', 'The dot product'],
    ['norms-distances', 'Lengths and distances'],
    ['matrix-multiplication', 'Matrix multiplication'],
  ]) {
    await page.goto(`/learn?concept=${id}`);
    await expect(page.locator(`#${id}`).getByRole('button', { pressed: true })).toBeVisible();
    await expect(page.locator(`a[href="/learn/${id}"]`).first()).toBeVisible();
    await page.goto(`/learn/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(lesson);
  }
});

test('the matrix exercise names the first wrong cell, then passes with the triple loop', async ({ page }) => {
  const errors = collectErrors(page);
  const solution = `function matmul(A, B) {
  const m = A.length;
  const n = B.length;
  const p = B[0].length;
  const C = table(m, p);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < n; k++) {
        C[i][j] = C[i][j] + A[i][k] * B[k][j];
      }
    }
  }
  return C;
}
`;
  const starter = solution.replace(/ {2}for \(let i[\s\S]*?\n {2}}\n/, '  // C[i][j] = row i of A times column j of B\n');
  // Saved code opens the editor (init scripts run in order, so the latest code wins).
  const save = (code: string) =>
    page.addInitScript((c) => {
      if (window !== window.top) return; // the code sandbox's frames have no storage
      localStorage.setItem('algorender:code:matrix-multiply:javascript', c);
      localStorage.setItem('algorender:language', 'javascript');
    }, code);
  await save(starter);
  await page.goto('/code/matrix-multiply');
  await expect(page.locator('.cm-content')).toContainText('row i of A times column j of B');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tests' })).toContainText('should be row 0 of A times column 0 of B', { timeout: 30_000 });
  await save(solution);
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('A[i][k] * B[k][j]');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tests' })).toContainText('All 6 tests pass.', { timeout: 30_000 });
  expect(errors).toEqual([]);
});
