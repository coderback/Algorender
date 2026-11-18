import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';
import { seed } from './seed';

// Mock interviews on Today and in the study plan (6f-3). Like
// interview.spec.ts, these need a server (and a build) with the tutor's
// stand-in model, TUTOR_PROVIDER=fake, and BETTER_AUTH_RATE_LIMIT=off; without
// it they skip.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const origin = () => ({ origin: new URL(test.info().project.use.baseURL!).origin });

/** A learner on the Coding interviews plan who has solved two hashing problems. */
const PRACTISED: [string, Record<string, unknown>, number][] = [
  ['plan.set', { goal: 'interviews', hours: 5 }, 2],
  ['problem.submitted', { problem: 'two-sum', language: 'javascript', passed: true, tests: 12, failed: 0 }, 1],
  ['problem.submitted', { problem: 'contains-duplicate', language: 'javascript', passed: true, tests: 10, failed: 0 }, 1],
];

async function skipWithoutInterviews(page: Page) {
  const res = await page.request.get('/api/interview');
  const body = (await res.json()) as { enabled?: boolean };
  test.skip(!body.enabled, 'Mock interviews are off on this server (build and start it with TUTOR_PROVIDER=fake).');
}

async function signUp(page: Page) {
  const res = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Ada', email: `interview-today-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'correct horse battery' },
    headers: origin(),
  });
  expect(res.ok(), 'sign up').toBe(true);
}

async function post(page: Page, body: Record<string, unknown>) {
  const res = await page.request.post('/api/interview', { data: body, headers: origin() });
  expect(res.ok(), `${body.action}: ${res.status()}`).toBe(true);
  return (await res.json()) as { round: { id: string } };
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

test('Today offers a round on a practised pattern, resumes one, shows the last result, and the plan keeps one a week', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await skipWithoutInterviews(page);
  await page.addInitScript(() => window === window.top && localStorage.setItem('algorender:problem-language', 'javascript'));
  // The practice is this device's, then signing in claims it for the account.
  await page.goto('/explore');
  await seed(page, PRACTISED);
  await signUp(page);

  await page.goto('/');
  const card = page.getByRole('region', { name: 'Mock interview' });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText('2 of 2 rounds left today')).toBeVisible();
  await expect(card.getByText('Hashing', { exact: true })).toBeVisible();
  await expect(card.getByText(/You’ve solved 2 problems in it, and no round on one meets the bar yet/)).toBeVisible();
  await expect(card.getByText('In this week’s plan')).toBeVisible();
  await expect(card.getByText('Last round')).toHaveCount(0);
  await axe(page);
  await shots(page, 'today-interview');

  // The plan keeps an hour for it this week.
  await page.goto('/plan');
  await expect(page.getByText(/about [\d.]+ of them for review and 1 h for a mock interview/)).toBeVisible({ timeout: 30_000 });
  const now = page.locator('li', { has: page.getByRole('heading', { name: /Week \d+ · now/ }) });
  await expect(now.getByRole('link', { name: 'Mock interview' })).toBeVisible();
  const round = page.getByRole('article', { name: 'This week’s round' });
  await expect(round.getByRole('link', { name: 'Take a mock interview' })).toHaveAttribute('href', '/practice/interview');

  // Start it from Today: a hashing problem, ended early.
  await page.goto('/');
  await Promise.all([answered(page, 'start'), card.getByRole('button', { name: 'Start the round' }).click()]);
  await expect(page).toHaveURL(/\/practice\/interview\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByRole('list', { name: 'Interview phases' })).toBeVisible({ timeout: 30_000 });
  const title = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
  await page.getByRole('button', { name: 'End interview' }).click();
  await Promise.all([answered(page, 'end'), page.getByRole('button', { name: 'End it' }).click()]);
  await expect(page.getByText('Not yet', { exact: true }).first()).toBeVisible();

  // Back on Today: one round left, the last result, and this week's round done. Hashing still hasn't met the bar.
  await page.goto('/');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByText('1 of 2 rounds left today')).toBeVisible();
  await expect(card.getByText('This week’s round is done')).toBeVisible();
  const last = card.getByRole('link', { name: /Last round/ });
  await expect(last).toContainText('Not yet');
  await expect(last).toContainText(title);
  await expect(card.getByText('Hashing', { exact: true })).toBeVisible();
  await axe(page);
  await shots(page, 'today-interview-done');

  await page.goto('/plan');
  await expect(round.getByText('Done this week')).toBeVisible({ timeout: 30_000 });
  await expect(now.getByRole('img', { name: 'done' })).toBeVisible();
  await axe(page);
  await shots(page, 'plan-interview');

  // A round left unfinished is offered to resume, even with none left to start.
  const second = await post(page, { action: 'start', language: 'javascript', limit: 30 });
  await page.goto('/');
  await expect(card.getByRole('link', { name: 'Resume the round' })).toHaveAttribute('href', `/practice/interview/${second.round.id}`, { timeout: 30_000 });
  await expect(card.getByText('0 of 2 rounds left today')).toBeVisible();

  // Once it's ended, nothing is left today: the card goes.
  await post(page, { action: 'end', round: second.round.id });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today’s challenge' })).toBeVisible({ timeout: 30_000 });
  await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('signed out, Today has no interview card, and the plan still keeps the weekly round', async ({ page }) => {
  const errors = collectErrors(page);
  await skipWithoutInterviews(page);
  await page.goto('/explore');
  await seed(page, PRACTISED);
  await page.goto('/');
  await expect(page.getByText(/Coding interviews · week \d+ of \d+ · 5 h a week/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Today’s challenge' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Mock interview' })).toHaveCount(0);

  await page.goto('/plan');
  const round = page.getByRole('article', { name: 'This week’s round' });
  await expect(round.getByRole('link', { name: 'Take a mock interview' })).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});
