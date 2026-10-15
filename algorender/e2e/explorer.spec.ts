import { expect, test, type Page } from '@playwright/test';

const SORTS = [
  'bubble-sort',
  'selection-sort',
  'insertion-sort',
  'merge-sort',
  'quick-sort',
  'heap-sort',
  'counting-sort',
  'radix-sort',
];

const narration = (page: Page) => page.getByTestId('narration');
const stepCounter = (page: Page) => page.getByText(/^\d+\/\d+$/);
const mainLane = (page: Page) => page.locator('section[aria-label="Array"] p.sr-only');

/** Opens a visualiser and waits until React has attached its handlers. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-hydrated="true"]').waitFor();
}

/**
 * Clicks "Step forward" and samples an element's on-screen position on every
 * animation frame for `ms`. Sampling starts before the click, inside the page,
 * so a slow test machine can't miss the start of the animation.
 */
async function stepAndSample(page: Page, selector: string, ms: number) {
  return page.evaluate(
    async ({ selector, ms }) => {
      const samples: { t: number; x: number; y: number }[] = [];
      const first = document.querySelector(selector)!.getBoundingClientRect();
      samples.push({ t: 0, x: Math.round(first.x), y: Math.round(first.y) });
      document.querySelector<HTMLButtonElement>('button[aria-label^="Step forward"]')!.click();
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        const r = document.querySelector(selector)?.getBoundingClientRect();
        if (r) samples.push({ t: performance.now() - t0, x: Math.round(r.x), y: Math.round(r.y) });
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return samples;
    },
    { selector, ms },
  );
}

/** Distinct positions an element passed through. A jump has 2; a glide has many. */
function distinctPositions(samples: { x: number; y: number }[]) {
  return new Set(samples.map((s) => `${s.x},${s.y}`)).size;
}

for (const slug of SORTS) {
  test(`${slug} plays to a sorted end with no console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await open(page, `/visualisers/${slug}?preset=random&n=8&seed=3`);
    await expect(stepCounter(page)).toHaveText(/^1\/\d+$/);
    await page.keyboard.press('End');
    await expect(narration(page)).toContainText(/sorted/i);
    expect(errors).toEqual([]);
  });
}

// Seed 7, size 10 is [6, 10, 97, …]: step 7 compares 6 and 10, step 8 moves 6 into the merge buffer.
const MERGE_STEP_7 = '/visualisers/merge-sort?preset=random&n=10&seed=7&step=6';

test('a step moves bars smoothly instead of teleporting', async ({ page }) => {
  await open(page, MERGE_STEP_7);
  await expect(narration(page)).toHaveText('Compare the front of each half: 6 and 10.');

  const samples = await stepAndSample(page, '[title="6"]', 600);

  await expect(narration(page)).toContainText('take 6 from the left half');
  const first = samples[0];
  const last = samples[samples.length - 1];
  expect(last.y).toBeGreaterThan(first.y + 50); // it ends up in the buffer lane below
  // …and passes through the space in between. A teleport would show only 2 positions.
  expect(distinctPositions(samples)).toBeGreaterThanOrEqual(4);
});

test('reduced motion jumps straight to each new state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, MERGE_STEP_7);
  const samples = await stepAndSample(page, '[title="6"]', 400);
  await expect(narration(page)).toContainText('take 6 from the left half');
  expect(distinctPositions(samples)).toBeLessThanOrEqual(2);
});

test('keyboard: arrows step, Home/End jump, Space plays', async ({ page }) => {
  await open(page, '/visualisers/bubble-sort?preset=reversed&n=6&seed=1');
  await expect(stepCounter(page)).toHaveText(/^1\//);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(stepCounter(page)).toHaveText(/^3\//);
  await page.keyboard.press('ArrowLeft');
  await expect(stepCounter(page)).toHaveText(/^2\//);
  await page.keyboard.press('End');
  await expect(narration(page)).toContainText(/sorted/i);
  await page.keyboard.press('Home');
  await expect(stepCounter(page)).toHaveText(/^1\//);

  await page.getByLabel('Speed').selectOption('32');
  await narration(page).click(); // move focus off the select so Space reaches the player
  await page.keyboard.press('Space');
  await expect(narration(page)).toContainText(/sorted/i, { timeout: 10_000 });
});

test('step backward restores the exact earlier state', async ({ page }) => {
  await open(page, '/visualisers/quick-sort?preset=random&n=8&seed=11');
  const forward = page.getByRole('button', { name: /Step forward/ });
  const back = page.getByRole('button', { name: /Step back/ });
  for (let k = 0; k < 5; k++) await forward.click();
  const lane = await mainLane(page).textContent();
  const note = await narration(page).textContent();
  await forward.click();
  await forward.click();
  await back.click();
  await back.click();
  await expect(mainLane(page)).toHaveText(lane!);
  await expect(narration(page)).toHaveText(note!);
});

test('a deep link opens at the linked step', async ({ page }) => {
  await open(page, '/visualisers/heap-sort?preset=random&n=8&seed=5&step=12');
  await expect(stepCounter(page)).toHaveText(/^13\//);
});

test('custom input runs and updates the shareable URL', async ({ page }) => {
  await open(page, '/visualisers/insertion-sort');
  await page.getByLabel(/Your own values/).fill('42, 7, 19, 5');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page).toHaveURL(/input=42%2C7%2C19%2C5/);
  await expect(mainLane(page)).toHaveText('Array: 42, 7, 19, 5');
  await page.keyboard.press('End');
  await expect(mainLane(page)).toHaveText('Array: 5, 7, 19, 42');

  await page.getByLabel(/Your own values/).fill('12, banana');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'whole number' })).toBeVisible();
});

test('@mobile the visual, narration and controls fit without horizontal scroll', async ({ page }) => {
  await open(page, '/visualisers/merge-sort?preset=random&n=32&seed=2');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole('button', { name: /Play/ })).toBeVisible();
});

test('predict mode stops at a decision until the learner answers', async ({ page }) => {
  // Reversed input: the first comparison is out of order, so the answer is "Yes: swap them".
  await open(page, '/visualisers/bubble-sort?preset=reversed&n=5&seed=1&mode=predict');
  const forward = page.getByRole('button', { name: /Step forward|Answer the question first/ });
  await forward.click(); // intro → start of pass 1
  await forward.click(); // → first comparison, which asks a question
  await expect(page.getByRole('group', { name: 'Predict the next step' })).toContainText('out of order?');
  await expect(forward).toBeDisabled();

  await page.keyboard.press('1');
  await expect(page.getByText(/Right\. Step forward/)).toBeVisible();
  await expect(page.getByLabel('Predictions correct')).toHaveText('1/1 right');
  await expect(forward).toBeEnabled();
  await forward.click();
  await expect(narration(page)).toContainText('so swap them');
});

test('switching back to Watch mode removes the questions', async ({ page }) => {
  await open(page, '/visualisers/quick-sort?preset=random&n=6&seed=4&mode=predict');
  await page.keyboard.press('End');
  await page.getByRole('button', { name: 'Watch' }).click();
  await expect(page).not.toHaveURL(/mode=predict/);
  await page.keyboard.press('Home');
  await page.getByRole('button', { name: /Play/ }).click();
  await expect(page.getByRole('group', { name: 'Predict the next step' })).toHaveCount(0);
});
