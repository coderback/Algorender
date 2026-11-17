import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// Mock interviews (/practice/interview). They need a server with the tutor's
// stand-in model: locally, start it with TUTOR_PROVIDER=fake (and
// BETTER_AUTH_RATE_LIMIT=off, as these tests sign up several learners).
// Without it these tests skip.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const origin = () => ({ origin: new URL(test.info().project.use.baseURL!).origin });

const TWO_SUM = `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
  return [];
}`;

const APPROACH = 'I walk the list once and keep a map from each number I have seen to its index, so the partner of each number is a single lookup away.';

async function skipWithoutInterviews(page: Page) {
  const res = await page.request.get('/api/interview');
  const body = (await res.json()) as { enabled?: boolean };
  test.skip(!body.enabled, 'Mock interviews are off on this server (start it with TUTOR_PROVIDER=fake).');
}

async function signUp(page: Page) {
  const res = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Ada', email: `interview-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'correct horse battery' },
    headers: origin(),
  });
  expect(res.ok(), 'sign up').toBe(true);
}

/** Posts an interview action as the signed-in learner. */
async function post(page: Page, body: Record<string, unknown>) {
  const res = await page.request.post('/api/interview', { data: body, headers: origin() });
  return { status: res.status(), body: (await res.json()) as { round: { id: string }; error?: string } };
}

const answered = (page: Page, action: string) =>
  page.waitForResponse((r) => r.url().endsWith('/api/interview') && r.request().method() === 'POST' && (r.request().postData() ?? '').includes(`"action":"${action}"`) && r.ok());

async function axe(page: Page) {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const report = violations.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`);
    expect(report, `${colorScheme}: ${report.join('\n')}`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: null });
}

/** The page at 1440 and 390, in both themes, beside the redesign's other shots. */
async function shots(page: Page, name: string) {
  for (const [vp, width, height] of [
    ['1440', 1440, 900],
    ['390', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${name} at ${vp}: horizontal page scroll`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/redesign/${name}-${vp}-${colorScheme}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ colorScheme: null });
}

test('a signed-out learner is asked to sign in', async ({ page }) => {
  await skipWithoutInterviews(page);
  await page.goto('/practice/interview');
  await expect(page.getByRole('link', { name: 'Interviews' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: /Sign in or create an account/ })).toBeVisible({ timeout: 30_000 });
  expect((await page.request.post('/api/interview', { data: { action: 'start', language: 'python', limit: 45 }, headers: origin() })).status()).toBe(401);
});

test('a full coding round: clarify, approach, code, test, then a debrief that meets the bar', async ({ page }) => {
  test.setTimeout(180_000);
  await skipWithoutInterviews(page);
  const errors = collectErrors(page);
  await signUp(page);
  const { body } = await post(page, { action: 'start', language: 'javascript', limit: 30, problem: 'two-sum' });
  const id = body.round.id;
  await page.goto(`/practice/interview/${id}`);
  const phases = page.getByRole('list', { name: 'Interview phases' });
  await expect(phases.getByRole('listitem').and(page.locator('[aria-current="step"]'))).toHaveText('Clarify', { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Two Sum' })).toBeVisible();
  // Interview conditions: no hints or approach panes, no tutor, no language choice.
  await expect(page.getByRole('button', { name: 'Hints' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Ask the tutor/ })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Language' })).toHaveCount(0);
  const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Interviewer' }) });

  // Clarify: a question, answered by the (fake) interviewer.
  await panel.getByLabel('Say something to the interviewer').fill('Can the same number appear twice?');
  await Promise.all([answered(page, 'say'), panel.getByRole('button', { name: 'Say' }).click()]);
  await expect(panel.getByText('(fake interviewer) Good question.')).toBeVisible();
  await axe(page);

  // Approach: words and both complexities before the code.
  await Promise.all([answered(page, 'phase'), panel.getByRole('button', { name: 'Move on: Approach' }).click()]);
  await expect(panel.getByRole('button', { name: 'Start coding' })).toBeDisabled();
  await panel.getByLabel('Your approach').fill(APPROACH);
  await panel.getByLabel('Time complexity').selectOption('O(n)');
  await panel.getByLabel('Space complexity').selectOption('O(n)');
  await Promise.all([answered(page, 'approach'), panel.getByRole('button', { name: 'Tell the interviewer' }).click()]);
  await expect(panel.getByText('(fake interviewer) Why that time complexity?')).toBeVisible();
  await Promise.all([answered(page, 'phase'), panel.getByRole('button', { name: 'Start coding' }).click()]);

  // Code: the editor opens; the examples run in the browser.
  await expect(phases.locator('[aria-current="step"]')).toHaveText('Code');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(TWO_SUM);
  await page.getByRole('button', { name: 'Run examples' }).click();
  await expect(page.getByRole('group', { name: 'Test results' })).toContainText(/All \d+ examples pass/, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: /Watch your code/ })).toHaveCount(0);
  await shots(page, 'interview-round');

  // Test: the cases before Submit, then every test.
  await Promise.all([answered(page, 'phase'), panel.getByRole('button', { name: 'Move on: Test' }).click()]);
  const submit = page.getByRole('button', { name: 'Submit all tests' });
  await expect(submit).toBeDisabled();
  await panel.getByLabel('Cases you’d test, one per line').fill('an empty answer is impossible\nthe same number twice\nnegative numbers');
  await expect(submit).toBeEnabled();
  await Promise.all([answered(page, 'submit'), submit.click()]);
  await expect(page.getByRole('group', { name: 'Test results' })).toContainText(/Solved: all \d+ tests pass/);

  // The debrief: correctness by code, the rest by the (fake) model, and the authored approach, open.
  await Promise.all([answered(page, 'end'), panel.getByRole('button', { name: 'Finish and get my debrief' }).click()]);
  await expect(page.getByText('Meets the bar', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Correctness: 4 of 4' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Approach: 3 of 4' })).toBeVisible();
  await expect(page.getByText('“I walk the”').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The approach' })).toBeVisible();
  await expect(page.getByRole('table', { name: /Minutes per phase/ })).toBeAttached();
  await axe(page);
  await shots(page, 'interview-debrief');

  // The transcript stays to reread, until it's deleted; the scores stay.
  await page.getByText(/Reread the interview/).click();
  await expect(page.getByText('Can the same number appear twice?')).toBeVisible();
  await page.getByRole('button', { name: 'Delete the transcript' }).click();
  await Promise.all([answered(page, 'delete'), page.getByRole('button', { name: 'Delete it' }).click()]);
  await expect(page.getByText('The transcript of this round was deleted.')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Correctness: 4 of 4' })).toBeVisible();

  // The hub lists it, and the badge is earned.
  await page.goto('/practice/interview');
  await expect(page.getByRole('link', { name: /Two Sum.*Meets the bar/ })).toBeVisible({ timeout: 30_000 });
  await shots(page, 'interview-hub');
  await page.goto('/play');
  await expect(page.getByText('Interview ready').first()).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('two rounds a day, a hub that starts and resumes them, and scoring it yourself when the model can’t', async ({ page }) => {
  test.setTimeout(120_000);
  await skipWithoutInterviews(page);
  await signUp(page);
  await page.addInitScript(() => window === window.top && localStorage.setItem('algorender:problem-language', 'javascript'));
  await page.goto('/practice/interview');
  await expect(page.getByText('of 2 rounds left today')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'System-design round' })).toBeVisible();

  // Surprise me: a round on some problem, ended early from the bar.
  await page.getByRole('button', { name: 'Surprise me' }).click();
  await expect(page).toHaveURL(/\/practice\/interview\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByRole('list', { name: 'Interview phases' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'End interview' }).click();
  await Promise.all([answered(page, 'end'), page.getByRole('button', { name: 'End it' }).click()]);
  await expect(page.getByText('Not yet', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('This problem is in your review for tomorrow')).toBeVisible();

  // The second round's scorer fails: the learner scores the rest against the rubric.
  const { body } = await post(page, { action: 'start', language: 'javascript', limit: 30, problem: 'two-sum' });
  const id = body.round.id;
  await post(page, { action: 'phase', round: id, to: 'approach' });
  await post(page, { action: 'approach', round: id, text: `${APPROACH} FAILDEBRIEF`, time: 'O(n)', space: 'O(n)' });
  // Unfinished, it waits on the hub.
  await page.goto('/practice/interview');
  await expect(page.getByRole('heading', { name: 'In progress' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: 'Resume' }).click();
  await expect(page.getByRole('list', { name: 'Interview phases' }).locator('[aria-current="step"]')).toHaveText('Approach', { timeout: 30_000 });
  await page.getByRole('button', { name: 'End interview' }).click();
  await Promise.all([answered(page, 'end'), page.getByRole('button', { name: 'End it' }).click()]);
  await expect(page.getByRole('heading', { name: 'Score your round' })).toBeVisible();
  for (const name of ['Approach', 'Complexity analysis', 'Testing', 'Communication']) await page.getByRole('group', { name, exact: true }).getByText('3 · Meets the bar').click();
  await axe(page);
  await Promise.all([answered(page, 'self'), page.getByRole('button', { name: 'Save my scores' }).click()]);
  await expect(page.getByRole('progressbar', { name: 'Testing: 3 of 4' })).toBeVisible();

  // That was the day's two.
  await page.goto('/practice/interview');
  await expect(page.getByText('of 2 rounds left today')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Start interview' })).toBeDisabled();
  await expect(page.getByRole('link', { name: /Meets the bar|Not yet|To score/ })).toHaveCount(2);
  const third = await post(page, { action: 'start', language: 'javascript', limit: 30 });
  expect(third.status).toBe(429);
  expect(third.body.error).toMatch(/today’s 2 mock interviews/);
});
