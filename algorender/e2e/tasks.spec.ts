import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// The language tracks' tasks (L1, program mode): the sample tasks on their
// own pages under Learn, checked in the real sandboxed Python worker. A
// program task's failed case shows its input and a line diff with
// whitespace made visible; an error is explained in plain words; an output
// task compares what the learner typed; the phone symbol bar types into the
// editor. Then axe and screenshots at 1440 and 390 in both themes, with a
// failed check's diff and an explained error on screen.

const GREET = '/learn/tasks/py-greet-by-name';
const PREDICT = '/learn/tasks/py-two-names-one-value';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** Opens the greeting task with code already typed (a draft on the device). */
async function openGreet(page: Page, code: string, theme?: 'light' | 'dark') {
  await page.addInitScript((c) => {
    if (window === window.top) localStorage.setItem('algorender:code:task:py-greet-by-name:python', c);
  }, code);
  await page.goto(theme ? `${GREET}?theme=${theme}` : GREET);
  await expect(page.locator('.cm-editor')).toBeVisible();
}

const check = (page: Page) => page.getByRole('button', { name: 'Check', exact: true });
const results = (page: Page) => page.getByRole('region', { name: 'Check results' });

test('a program task: a formatting slip shows its input and the first line that differs, then the fix passes', async ({ page }) => {
  const errors = collectErrors(page);
  await openGreet(page, 'name = input("Name: ")\nprint("Hello,", name + "!")\nprint()\n');
  await check(page).click();
  // print() adds a blank line at the end, which the checker forgives, and the prompt is left out.
  await expect(results(page)).toHaveAttribute('data-verdict', 'passed', { timeout: 60_000 });
  await expect(results(page)).toContainText('All 3 cases pass');

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('name = input("Name: ")\nprint("Hello," + name + "!")\n');
  await check(page).click();
  await expect(results(page)).toContainText('3 of 3 cases fail');
  const first = results(page).locator('[data-case="failed"]').first();
  await expect(first).toContainText('Line 1 differs.');
  await expect(first.locator('pre').first()).toHaveText('Ada'); // the input that produced it
  const diff = first.locator('[data-output-diff]');
  await expect(diff.locator('tr[data-first]')).toContainText('Hello,·Ada!⏎');
  await expect(diff.locator('tr[data-first]')).toContainText('Hello,Ada!⏎');

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('name = input("Who? ")\nprint(f"Hello, {name}!")\n');
  await check(page).click();
  await expect(results(page)).toHaveAttribute('data-verdict', 'passed');
  await expect(results(page)).toContainText('All 3 cases pass');
  expect(errors).toEqual([]);
});

test('an error is explained in plain words, with the line marked in the editor', async ({ page }) => {
  await openGreet(page, 'name = input()\nprint("Hello, " + name + 1)\n');
  await check(page).click();
  const failed = results(page).locator('[data-case="failed"]').first();
  await expect(failed.locator('[data-run-error]')).toContainText('TypeError: can only concatenate str (not "int") to str (line 2)', { timeout: 60_000 });
  await expect(failed.locator('[data-error-help]')).toContainText('Joining text to a number');
  await expect(failed.locator('[data-error-help]')).toContainText('Where to look:');
  await expect(page.locator('.cm-error-line')).toContainText('print("Hello, " + name + 1)');
});

test('the console runs the program with typed input, and explains its error too', async ({ page }) => {
  await openGreet(page, 'name = input("Name? ")\nprint(f"Hello, {name}!")\nprint(int(name))\n');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const console = page.getByRole('log', { name: 'Console' });
  await expect(console).toHaveText('Name? ', { timeout: 60_000 });
  await page.getByLabel('Input for the program').fill('Ada');
  await page.getByLabel('Input for the program').press('Enter');
  await expect(console).toContainText('Name? Ada\nHello, Ada!');
  await expect(page.locator('[data-error-help]')).toContainText('Text that isn’t a whole number');
});

test('an output task: a wrong prediction shows what it really prints', async ({ page }) => {
  await page.goto(PREDICT);
  const answer = page.getByLabel('What does it print?');
  await answer.fill('4 4\nababab');
  await check(page).click();
  await expect(results(page)).toHaveAttribute('data-verdict', 'failed', { timeout: 60_000 });
  await expect(results(page).locator('tr[data-first]')).toContainText('4·3⏎');
  await answer.fill('4 3\nababab\n');
  await check(page).click();
  await expect(results(page)).toHaveAttribute('data-verdict', 'passed');
});

test('hints open one at a time', async ({ page }) => {
  await page.goto(PREDICT);
  await page.getByRole('button', { name: 'Show a hint (1 of 3)' }).click();
  await page.getByRole('button', { name: 'Another hint (2 of 3)' }).click();
  await expect(page.getByRole('article', { name: 'The task' }).locator('ol li')).toHaveCount(2);
});

test('@mobile the symbol bar types brackets and indents into the editor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGreet(page, '');
  // next dev's corner badge sits over the bar; a production build has none.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  await expect(page.getByRole('toolbar', { name: 'Symbols' })).toHaveCount(0);
  await page.locator('.cm-content').click();
  const bar = page.getByRole('toolbar', { name: 'Symbols' });
  await expect(bar).toBeVisible();
  await page.keyboard.insertText('print');
  await bar.getByRole('button', { name: 'Opening parenthesis' }).click();
  await bar.getByRole('button', { name: 'Double quote' }).click();
  await expect(page.locator('.cm-content')).toContainText('print("');
  await bar.getByRole('button', { name: 'Indent' }).click();
  await expect(page.locator('.cm-content')).toContainText('    print("');
  // The editor kept focus throughout, so the keyboard would have stayed up.
  await expect(page.locator('.cm-editor')).toHaveClass(/cm-focused/);
  // No horizontal page scroll with the bar showing.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

for (const theme of ['light', 'dark'] as const) {
  for (const vp of VIEWPORTS) {
    test(`a failed check passes axe and fits at ${vp.name} in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openGreet(page, 'name = input("Name: ")\nprint("Hello," + name + "!")\nprint(name + 1)\n', theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await check(page).click();
      await expect(results(page)).toHaveAttribute('data-verdict', 'failed', { timeout: 60_000 });
      await page.getByRole('button', { name: 'Show a hint (1 of 3)' }).click();
      // The editor focused, so the phone's symbol bar is on screen too.
      await page.locator('.cm-content').click();
      await page.evaluate(() => document.fonts.ready);
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const report = violations.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`);
      expect(report, report.join('\n')).toEqual([]);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'horizontal page scroll').toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/redesign/task-program-${vp.name}-${theme}.png`, fullPage: true });
    });

    test(`an output task passes axe at ${vp.name} in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${PREDICT}?theme=${theme}`);
      await page.getByLabel('What does it print?').fill('4 4\nabab');
      await check(page).click();
      await expect(results(page)).toHaveAttribute('data-verdict', 'failed', { timeout: 60_000 });
      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      await page.screenshot({ path: `test-results/redesign/task-output-${vp.name}-${theme}.png`, fullPage: true });
    });
  }
}
