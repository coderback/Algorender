import { expect, test, type Locator, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// Phone usability at 390 × 844, from the mobile UX test of 2026-11-20: a tap's
// result must happen on screen, nothing may scroll sideways, and controls are
// finger-sized.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const stage = (page: Page) => page.locator('[data-stage]');
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Whether an element's box lies inside the viewport, at least `share` of it. */
async function onScreen(el: Locator, share = 0.5) {
  return el.evaluate((node, s) => {
    const r = node.getBoundingClientRect();
    const seen = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    return seen >= Math.min(r.height, innerHeight) * s;
  }, share);
}

test('Parsons: every line added, nothing scrolls sideways and every control is reachable and finger-sized', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/code/bubble-sort');
  const add = page.getByRole('button', { name: /^Add “/ });
  await expect(add.first()).toBeVisible({ timeout: 30_000 });
  while ((await add.count()) > 0) await add.first().click();
  expect(await sideways(page)).toBe(0);
  const program = page.getByRole('group', { name: /^Your program/ });
  for (const button of await program.getByRole('button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.x + box.width, (await button.getAttribute('aria-label')) ?? undefined).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(39.5);
  }
  // The stage tabs keep to one row.
  const tabs = await page.getByRole('tablist', { name: 'Ways to practise' }).getByRole('tab').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(new Set(tabs).size).toBe(1);
  expect(errors).toEqual([]);
});

test('fill the gaps: each gap is a finger-sized target', async ({ page }) => {
  await page.goto('/code/bubble-sort');
  await page.getByRole('tab', { name: /Fill the gaps/ }).click();
  const gap = page.getByRole('textbox', { name: /^Gap 1 of/ });
  await expect(gap).toBeVisible({ timeout: 30_000 });
  expect((await gap.boundingBox())!.height).toBeGreaterThanOrEqual(36);
  expect(await sideways(page)).toBe(0);
});

test('a structure operation plays on screen: the stage comes back into view', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/visualisers/lru-cache');
  const operations = page.getByRole('group', { name: 'Operations' });
  const key = operations.getByRole('textbox', { name: /^Get:/ });
  await expect(key).toBeVisible({ timeout: 30_000 });
  await key.fill('B');
  const run = operations.getByRole('button', { name: 'Get', exact: true });
  await run.evaluate((e) => e.scrollIntoView({ block: 'start' }));
  expect(await onScreen(stage(page).getByRole('group', { name: /^Table/ }), 0.01)).toBe(false);
  await run.click();
  await expect(operations).not.toContainText('No operations yet.');
  await expect.poll(() => onScreen(stage(page).getByRole('group', { name: /^Table/ }), 0.9)).toBe(true);
  expect(errors).toEqual([]);
});

test('the Learn path opens a tapped concept under its node', async ({ page }) => {
  await page.goto('/learn');
  const nodes = page.locator('ol[id^="track-"] > li > button[aria-pressed="false"]').filter({ visible: true });
  await expect(nodes.first()).toBeVisible({ timeout: 30_000 });
  const node = nodes.first();
  const name = (await node.locator('span span').first().textContent())!;
  await node.click();
  const card = page.locator('#selected-title-here');
  await expect(card).toHaveText(name);
  expect(await onScreen(card, 1)).toBe(true);
  await expect(page.locator('#selected-title')).toBeHidden();
});

test('Today in the tab bar opens Today on a fresh device, with the tab bar still there', async ({ page }) => {
  await page.goto('/explore');
  const bar = page.getByRole('navigation', { name: 'Main' });
  await bar.getByRole('link', { name: 'Today' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(bar).toBeVisible();
  await expect(bar.locator('[aria-current="page"]')).toHaveText('Today');
});

test('full screen keeps the player in view and hides the code peek', async ({ page }) => {
  await page.goto('/visualisers/dijkstra');
  const full = page.getByRole('button', { name: 'Full screen' });
  await expect(full).toBeVisible({ timeout: 30_000 });
  await full.click();
  await expect(page.getByRole('button', { name: 'Exit full screen' })).toBeVisible();
  const play = page.getByRole('button', { name: /^(Play|Pause|Replay)/ }).first();
  expect(await onScreen(play, 1)).toBe(true);
  await expect(page.locator('button[aria-haspopup="dialog"][data-sticks="bottom"]')).toBeHidden();
});

for (const { path, language, first } of [
  { path: '/practice/two-sum', language: 'python', first: 'Colon' },
  { path: '/code/bubble-sort-bug', language: 'javascript', first: 'Opening parenthesis' },
]) {
  test(`the symbol bar comes up in ${path}'s editor, the most used keys first`, async ({ page }) => {
    await page.addInitScript((l) => {
      if (window !== window.top) return;
      localStorage.setItem('algorender:language', l);
      localStorage.setItem('algorender:problem-language', l);
    }, language);
    await page.goto(path);
    const code = page.getByRole('textbox', { name: /^Your .+ code$/ });
    if (path.startsWith('/practice')) await page.getByRole('button', { name: 'Code', exact: true }).click();
    await expect(code).toBeVisible({ timeout: 30_000 });
    await code.click();
    const bar = page.getByRole('toolbar', { name: 'Symbols' });
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button').first()).toHaveAccessibleName(first);
  });
}

test('a plane handle has a 44px hit area', async ({ page }) => {
  await page.goto('/visualisers/linear-transformations');
  const handle = page.locator('[aria-roledescription="draggable point"]').first();
  await expect(handle).toBeVisible({ timeout: 30_000 });
  const box = (await handle.boundingBox())!;
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(43);
});

test('the LRU table header reads in full', async ({ page }) => {
  await page.goto('/visualisers/lru-cache');
  const header = page.getByText('Last used', { exact: true });
  await expect(header).toBeVisible({ timeout: 30_000 });
  expect(await header.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
});

test("tab rows don't clip silently, and Plan's hours stay on one line each", async ({ page }) => {
  await page.goto('/play');
  const play = page.getByRole('navigation', { name: 'Play' });
  await expect(play).toBeVisible({ timeout: 30_000 });
  // Wider than the screen: the cut-off edge fades rather than ending mid-word.
  await expect(play).toHaveAttribute('data-more-end', 'true');
  expect(await sideways(page)).toBe(0);

  await page.goto('/learn/placement');
  const learn = page.getByRole('navigation', { name: 'Section' });
  // The active tab is scrolled into view.
  expect(await onScreen(learn.locator('[aria-current="page"]'), 1)).toBe(true);

  await page.goto('/plan');
  const hours = page.locator('input[name="hours"]').locator('xpath=..');
  await expect(hours.first()).toBeVisible({ timeout: 30_000 });
  const boxes = await hours.evaluateAll((els) => els.map((e) => ({ top: e.getBoundingClientRect().top, h: e.getBoundingClientRect().height })));
  expect(new Set(boxes.map((b) => b.top)).size).toBe(1);
  for (const b of boxes) expect(b.h).toBeLessThan(48);
});

test('a design case keeps its diagram top to bottom with a cache added, and a run scrolls to its results', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/design/url-shortener');
  const add = page.getByRole('toolbar', { name: 'Add a component' });
  await expect(add).toBeVisible({ timeout: 30_000 });
  await add.getByRole('button', { name: 'Cache' }).click();
  const cache = page.getByRole('button', { name: /^Cache, / });
  await expect(cache).toBeVisible();
  // Every node sits inside the diagram's box: no 976px left-to-right layout.
  const fits = await cache.evaluate((node) => {
    const box = node.closest('.overflow-x-auto')!;
    return box.scrollWidth <= box.clientWidth + 1;
  });
  expect(fits).toBe(true);
  // A node's name isn't cut short by its cost tag.
  const lb = page.getByRole('button', { name: /^Load balancer, / });
  if ((await lb.count()) > 0) {
    const name = lb.locator('[title="Load balancer"]');
    expect(await name.evaluate((e) => e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight + 1)).toBe(true);
  }
  // Back to the starting design (the cache isn't wired in), then run the checks.
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(cache).toHaveCount(0);
  const run = page.getByRole('button', { name: 'Run the checks' });
  await run.evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await run.click();
  const results = page.getByRole('heading', { name: 'Results' });
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => onScreen(results, 1)).toBe(true);
  expect(errors).toEqual([]);
});
