import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// B3 of the math and ML path (determinants to least squares): the visualisers'
// handles, the concepts live on the map, and a part of the first milestone
// project judged in judge mode.

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-hydrated="true"]').waitFor();
}

test('dragging where î lands changes A, and its determinant with it', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '/visualisers/inverse-matrix?preset=area&step=1');
  await page.getByRole('button', { name: /^Where î lands at \(2, 1\)/ }).focus();
  await page.keyboard.press('ArrowRight');
  // [[2, 1], [1, 2]] becomes [[2.5, 1], [1, 2]]: det 2.5·2 − 1·1 = 4.
  await expect(page.locator('#custom-input')).toHaveValue('area [[2.5, 1], [1, 2]]');
  await expect(page.getByTestId('narration')).toContainText('4');
  expect(errors).toEqual([]);
});

test('dragging v onto u’s line collapses the span', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '/visualisers/span?preset=span&step=4');
  const before = await page.locator('#custom-input').inputValue();
  const v = page.getByRole('button', { name: /^v at / });
  await v.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#custom-input')).not.toHaveValue(before);
  expect(errors).toEqual([]);
});

test('dragging a data point refits the least-squares line', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page, '/visualisers/least-squares?preset=line&step=3');
  const before = await page.locator('#custom-input').inputValue();
  const point = page.getByRole('button', { name: /^Point 1 at / });
  await point.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#custom-input')).not.toHaveValue(before);
  expect(errors).toEqual([]);
});

test('B3’s concepts are live on the map, each opening its lesson', async ({ page }) => {
  for (const [id, lesson] of [
    ['determinants-inverses', 'Determinants, inverses'],
    ['span-basis-rank', 'Span, basis and rank'],
    ['change-of-basis', 'Change of basis'],
    ['supervised-learning', 'What learning from examples means'],
    ['projections-least-squares', 'Least squares'],
  ]) {
    await page.goto(`/learn?concept=${id}`);
    await expect(page.locator(`#${id}`).getByRole('button', { pressed: true })).toBeVisible();
    await expect(page.locator(`a[href="/learn/${id}"]`).first()).toBeVisible();
    await page.goto(`/learn/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(lesson);
  }
});

test('the project’s solve part checks A·x against b, then passes with elimination', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  // Saved code opens the editor (init scripts run in order, so the latest code wins).
  const save = (code: string) =>
    page.addInitScript((c) => {
      if (window !== window.top) return; // the code sandbox's frames have no storage
      localStorage.setItem('algorender:code:solve-system:javascript', c);
      localStorage.setItem('algorender:language', 'javascript');
    }, code);
  // Zeros for x: the check works out A·x and names the first row that misses b.
  await save(`function solve(A, b) {
  const x = array(A.length);
  return x;
}
`);
  await page.goto('/code/solve-system');
  await expect(page.locator('.cm-content')).toContainText('array(A.length)');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tests' })).toContainText('Check with A·x', { timeout: 30_000 });
  await save(`function solve(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let r = k + 1; r < n; r++) if (Math.abs(M[r][k]) > Math.abs(M[p][k])) p = r;
    const t = M[k]; M[k] = M[p]; M[p] = t;
    for (let r = k + 1; r < n; r++) {
      const f = M[r][k] / M[k][k];
      for (let c = k; c <= n; c++) M[r][c] -= f * M[k][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}
`);
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('M[r][c] -= f * M[k][c]');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tests' })).toContainText('All 5 tests pass.', { timeout: 30_000 });
  expect(errors).toEqual([]);
});
