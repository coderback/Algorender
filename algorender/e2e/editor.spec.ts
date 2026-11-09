import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// The code editor's help (src/workspace/editor): syntax errors as you type,
// light autocomplete, search, and Vim keys, in the practice editor and the
// exercise editor alike.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const PASSWORD = 'a long enough password';
const freshEmail = () => `editor-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

type Editor = { name: string; path: string; draft: (language: string) => string };

const EDITORS: Editor[] = [
  { name: 'practice', path: '/practice/two-sum', draft: (l) => `algorender:code:problem:two-sum:${l}` },
  { name: 'exercise', path: '/code/bubble-sort-bug', draft: (l) => `algorender:code:bubble-sort-bug:${l}` },
];

const PYTHON = 'def two_sum(nums, target):\n    total = 0\n    return total\n';
const JS = 'function twoSum(nums, target) {\n  const runningTotal = 0;\n  return runningTotal;\n}\n';

/**
 * Opens an editor with code already saved, as if the learner had typed it, and
 * any preferences set. Init scripts run in every frame, and the code sandbox's
 * frames have no storage.
 */
async function open(page: Page, editor: Editor, language: string, code: string, prefs: Record<string, string> = {}) {
  await page.addInitScript(
    ([key, l, c, p]) => {
      if (window !== window.top) return;
      localStorage.setItem(key, c);
      // Exercises read the first; problems the second, which can also be Java, C++ or Go.
      if (l !== 'java') localStorage.setItem('algorender:language', l);
      localStorage.setItem('algorender:problem-language', l);
      for (const [k, v] of Object.entries(p)) localStorage.setItem(k, v);
    },
    [editor.draft(language), language, code, prefs] as const,
  );
  await page.goto(editor.path);
  await expect(page.locator('.cm-editor')).toBeAttached();
  // On a phone the practice editor waits in the Code pane.
  const show = page.getByRole('group', { name: 'Show' });
  if (await show.isVisible()) await show.getByRole('button', { name: 'Code' }).click();
  await expect(code_(page)).toBeVisible();
}

const code_ = (page: Page) => page.getByRole('textbox', { name: /^Your .+ code$/ });
const syntaxLine = (page: Page) => page.locator('[data-syntax-error]');

/** Clicks into the code and puts the cursor at its end. */
async function typeAtEnd(page: Page, text: string) {
  await code_(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(text);
}

for (const editor of EDITORS) {
  test.describe(`the ${editor.name} editor`, () => {
    test('underlines a syntax error as you type, explains it in words, and drops it once fixed', async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, editor, 'python', PYTHON);
      await typeAtEnd(page, 'if total > 1');
      await expect(syntaxLine(page)).toHaveText('Syntax error on Line 4: A line that starts with “if” must end with a colon (:).');
      const mark = page.locator('.cm-lintRange-error');
      await expect(mark).toHaveText('1');
      await mark.hover();
      await expect(page.locator('.cm-tooltip-lint')).toHaveText('A line that starts with “if” must end with a colon (:).');

      // The line number takes the learner to the mistake.
      await page.getByRole('heading', { level: 1 }).click();
      await syntaxLine(page).getByRole('button', { name: 'Line 4' }).click();
      await expect(code_(page)).toBeFocused();

      await page.keyboard.press('End');
      await page.keyboard.press('Shift+Home');
      await page.keyboard.press('Backspace');
      await expect(syntaxLine(page)).toHaveCount(0);
      await expect(mark).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    test('completes names from the file and keywords, and Ctrl/⌘ F searches the code', async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, editor, 'javascript', JS);
      await typeAtEnd(page, 'run');
      await expect(page.getByRole('option', { name: 'runningTotal' })).toBeVisible();
      // The list ignores Enter for its first 75 ms, so a keystroke meant for the code isn't taken as a pick.
      await page.waitForTimeout(150);
      await page.keyboard.press('Enter');
      await expect(page.locator('.cm-line').last()).toHaveText('runningTotal');
      await page.keyboard.type(';');
      await page.keyboard.press('Enter');
      await page.keyboard.type('whi');
      await expect(page.getByRole('option', { name: 'while' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('listbox')).toHaveCount(0);

      await page.keyboard.press('ControlOrMeta+f');
      const find = page.getByRole('textbox', { name: 'Find' });
      await expect(find).toBeFocused();
      // Typed, since the panel searches on key presses.
      await page.keyboard.type('runningTotal');
      await expect(page.locator('.cm-searchMatch')).toHaveCount(3);
      await expect(page.getByRole('textbox', { name: 'Replace with' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(find).toHaveCount(0);
      await expect(code_(page)).toBeFocused();
      expect(errors).toEqual([]);
    });

    test('offers no completions when autocomplete is turned off', async ({ page }) => {
      await open(page, editor, 'javascript', JS, { 'algorender:editor-autocomplete': 'off' });
      await typeAtEnd(page, 'run');
      await page.keyboard.press('Control+Space');
      await page.waitForTimeout(500);
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await expect(page.locator('.cm-line').last()).toHaveText('run');
    });
  });
}

test('Java, C++ and Go get no syntax checks: their grammars would flag good code', async ({ page }) => {
  await open(page, EDITORS[0], 'java', 'class Solution {\n  public int[] twoSum(int[] nums, int target) {\n    return new int[] {\n  }\n}\n');
  await typeAtEnd(page, 'int x = (');
  await page.waitForTimeout(1500);
  await expect(page.locator('.cm-lintRange')).toHaveCount(0);
  await expect(syntaxLine(page)).toHaveCount(0);
});

test.describe('on a phone 390 wide', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const editor of EDITORS) {
    test(`the ${editor.name} editor's error line, completions and search fit`, async ({ page }) => {
      await open(page, editor, 'python', PYTHON);
      await typeAtEnd(page, 'for x in tot');
      await expect(page.getByRole('option', { name: 'total' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(syntaxLine(page)).toContainText('A line that starts with “for” must end with a colon (:).');
      await page.keyboard.press('ControlOrMeta+f');
      await expect(page.getByRole('textbox', { name: 'Find' })).toBeFocused();
      for (const name of ['Next', 'Previous', 'All', 'Replace', 'Replace all', 'Close search']) {
        const box = (await page.locator('.cm-search').getByRole('button', { name, exact: true }).boundingBox())!;
        expect(box.x + box.width, name).toBeLessThanOrEqual(390);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBe(0);
    });
  }
});

test('the account page turns autocomplete off and Vim keys on, and Vim loads only then', async ({ page }) => {
  test.setTimeout(90_000);
  // Every script the page fetches, to see whether Vim's code came with it.
  const scripts: string[] = [];
  page.on('response', async (r) => {
    if (r.request().resourceType() === 'script') scripts.push(await r.text().catch(() => ''));
  });
  const vimLoaded = () => scripts.some((s) => s.includes('cm-vimCursorLayer'));

  await page.goto('/practice/two-sum');
  await expect(code_(page)).toBeVisible();
  await expect(page.locator('.cm-vim-panel')).toHaveCount(0);
  expect(vimLoaded()).toBe(false);

  await page.goto('/account');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Name').fill('Vi');
  await page.getByLabel('Email').fill(freshEmail());
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  const completion = page.getByRole('group', { name: 'Autocomplete in the code editor' });
  const keys = page.getByRole('group', { name: 'Code editor keys' });
  await expect(completion.getByRole('button', { name: 'On' })).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
  await expect(keys.getByRole('button', { name: 'Standard' })).toHaveAttribute('aria-pressed', 'true');
  await completion.getByRole('button', { name: 'Off' }).click();
  await keys.getByRole('button', { name: 'Vim' }).click();
  await expect(keys.getByRole('button', { name: 'Vim' })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/practice/two-sum');
  await expect(page.locator('.cm-vim-panel')).toHaveText('--NORMAL--');
  expect(vimLoaded()).toBe(true);
  await code_(page).click();
  // Vim: G to the last line, o for a new line under it, then type; no completions open.
  await page.keyboard.press('Shift+G');
  await page.keyboard.press('o');
  await expect(page.locator('.cm-vim-panel')).toContainText('INSERT');
  await page.keyboard.type('x = nu');
  await page.waitForTimeout(500);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(page.locator('.cm-line').last()).toHaveText('x = nu');
  // Esc leaves insert mode, and Esc then Tab still leaves the editor.
  await page.keyboard.press('Escape');
  await expect(page.locator('.cm-vim-panel')).toHaveText('--NORMAL--');
  await page.keyboard.press('Tab');
  await expect(code_(page)).not.toBeFocused();

  await page.goto('/account');
  await keys.getByRole('button', { name: 'Standard' }).click();
  await completion.getByRole('button', { name: 'On' }).click();
  expect(await page.evaluate(() => [localStorage.getItem('algorender:editor-vim'), localStorage.getItem('algorender:editor-autocomplete')])).toEqual([null, null]);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const editor of EDITORS) {
      test(`the ${editor.name} editor passes axe with an error, completions and the search panel showing`, async ({ page }) => {
        await open(page, editor, 'python', `${PYTHON}print((total)\n`);
        await expect(syntaxLine(page)).toContainText('Line 4');
        await typeAtEnd(page, 'tot');
        await expect(page.getByRole('option', { name: 'total' })).toBeVisible();
        await expectAxe(page);
        await page.keyboard.press('Escape');
        await page.keyboard.press('ControlOrMeta+f');
        await expect(page.getByRole('textbox', { name: 'Find' })).toBeFocused();
        await page.keyboard.type('total');
        await expect(page.locator('.cm-searchMatch').first()).toBeVisible();
        await expectAxe(page);
      });
    }

    test('Vim’s mode line and its search prompt pass axe', async ({ page }) => {
      await open(page, EDITORS[0], 'python', PYTHON, { 'algorender:editor-vim': '1' });
      await expect(page.locator('.cm-vim-panel')).toHaveText('--NORMAL--');
      await code_(page).click();
      await expectAxe(page);
      await page.keyboard.press('/');
      await expect(page.getByRole('textbox', { name: 'Vim search' })).toBeFocused();
      await page.keyboard.type('total');
      await expectAxe(page);
    });
  });
}

async function expectAxe(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}
