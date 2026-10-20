import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The app shell: the rail and tab bar, the command palette, and which pages
// get which frame.

const rail = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

test('the rail marks the section a page belongs to', async ({ page }) => {
  // / is Today once the learner has started (a first visit gets the landing page, with no rail).
  await page.addInitScript(() => window === window.top && localStorage.setItem('algorender:started', '1'));
  for (const [path, place] of [
    ['/', 'Today'],
    ['/plan', 'Learn'],
    ['/learn/placement', 'Learn'],
    ['/compare', 'Explore'],
    ['/visualisers/stack', 'Explore'],
    ['/code', 'Practice'],
    ['/design/sandbox', 'Practice'],
    ['/play/break-it', 'Play'],
  ] as const) {
    await page.goto(path);
    await expect(rail(page).locator('[aria-current="page"]'), path).toHaveText(place);
  }
});

test('focused pages have no rail and one way out', async ({ page }) => {
  for (const [path, parent] of [
    ['/learn/binary-search', '/learn'],
    ['/practice/two-sum', '/practice'],
    ['/review', '/'],
  ] as const) {
    await page.goto(path);
    await expect(rail(page)).toHaveCount(0);
    // Lessons and the review close; a problem goes back to the list. Either way, one link out.
    await expect(page.getByRole('link', { name: /^Close|^Back to the problems$/ })).toHaveAttribute('href', parent);
  }
});

test('the command palette finds a visualiser and opens it from the keyboard', async ({ page }) => {
  await page.goto('/learn');
  await page.waitForLoadState('networkidle');
  const trigger = page.getByRole('button', { name: /Search visualisers, lessons, problems/ });
  await trigger.focus();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search and actions' });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('dijkstra');
  await expect(dialog.getByRole('option', { name: /Dijkstra/ }).first()).toBeVisible();

  // Tab switches the filter without leaving the input.
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Visualisers', pressed: true })).toBeVisible();
  await expect(input).toBeFocused();
  await expect(dialog.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/visualisers\/dijkstra/);
  await expect(dialog).toHaveCount(0);
});

test('escape closes the palette and focus returns to the trigger', async ({ page }) => {
  await page.goto('/practice');
  const trigger = page.getByRole('button', { name: /Search visualisers, lessons, problems/ });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('the palette passes axe in both themes', async ({ page }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/explore');
    await page.waitForLoadState('networkidle'); // the shortcut works once the page has hydrated
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox').fill('sort');
    await expect(dialog.getByRole('option').first()).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`), colorScheme).toEqual([]);
  }
});

test('G then R starts the review', async ({ page }) => {
  await page.goto('/explore');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('g');
  await page.keyboard.press('r');
  await expect(page).toHaveURL(/\/review$/);
});

test('old catalogue links land on Explore', async ({ page }) => {
  await page.goto('/?tab=systems');
  await expect(page).toHaveURL(/\/explore\?(.*&)?kind=systems/);
  await expect(page.getByRole('group', { name: 'Kind' }).getByRole('button', { name: /Systems/ })).toHaveAttribute('aria-pressed', 'true');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('hubs show the tab bar; pages below them get a back button instead', async ({ page }) => {
    await page.goto('/practice');
    await expect(rail(page)).toBeVisible();
    await expect(rail(page).locator('[aria-current="page"]')).toHaveText('Practice');

    await page.goto('/practice/drills');
    await expect(rail(page)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/practice');

    await page.goto('/visualisers/stack');
    await expect(page.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/explore');
  });
});
