import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// Mock interviews' system-design rounds (REVAMP_PLAN.md 6f-2). They need a
// server with the tutor's stand-in model, built and started with
// TUTOR_PROVIDER=fake (pages read the switch at build time), and
// BETTER_AUTH_RATE_LIMIT=off, as these tests sign up several learners.
// Without it these tests skip.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const origin = () => ({ origin: new URL(test.info().project.use.baseURL!).origin });

const EXPLAIN = 'I keep the popular menus in memory in a cache in front of the database, edits invalidate it, and four app servers share the scans.';

type Component = { id: string; kind: string; [key: string]: unknown };
type Round = { id: string; design: { components: Component[] } };

async function skipWithoutInterviews(page: Page) {
  const res = await page.request.get('/api/interview');
  const body = (await res.json()) as { enabled?: boolean };
  test.skip(!body.enabled, 'Mock interviews are off on this server (build and start it with TUTOR_PROVIDER=fake).');
}

async function signUp(page: Page) {
  const res = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Ada', email: `design-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`, password: 'correct horse battery' },
    headers: origin(),
  });
  expect(res.ok(), 'sign up').toBe(true);
}

async function post(page: Page, body: Record<string, unknown>) {
  const res = await page.request.post('/api/interview', { data: body, headers: origin() });
  return { status: res.status(), body: (await res.json()) as { round: Round; error?: string } };
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

/** The page at 1440 and 390, in both themes, beside the redesign's other shots (from the top, so sticky panels sit where they start). */
async function shots(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
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

/**
 * The variant's starting design with a cache in front of the database and
 * four app servers: what the canvas would hold after the learner built it,
 * kept as the round's draft on this device (base64url JSON of the components,
 * as src/components/design/url.ts encodes it).
 */
function withCache(start: Round['design']): string {
  const components = start.components.map((c) => (c.kind === 'app' ? { ...c, instances: 4, reads: 'cache', writes: 'cache' } : c));
  components.push({ id: 'cache', label: 'Cache', kind: 'cache', nodes: 2, capacity: 10_000, policy: 'lru', serviceMs: 1, writes: 'invalidate', to: 'db' });
  return Buffer.from(JSON.stringify(components)).toString('base64url');
}

test('a full design round: requirements, estimates, the design checked on the server, a deep dive, then a debrief that meets the bar', async ({ page }) => {
  test.setTimeout(240_000);
  await skipWithoutInterviews(page);
  const errors = collectErrors(page);
  await signUp(page);
  const { body } = await post(page, { action: 'start', format: 'design', limit: 45, variant: 'qr-menus' });
  const round = body.round;
  await page.goto(`/practice/interview/${round.id}`);
  const phases = page.getByRole('list', { name: 'Interview phases' });
  const current = phases.locator('[aria-current="step"]');
  await expect(current).toHaveText('Requirements', { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Menus behind QR codes', level: 1 })).toBeVisible();
  await expect(page.getByText('Shown once you’ve given the interviewer your estimates.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The canvas opens in the Design phase' })).toBeVisible();
  const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Interviewer' }) });

  // Requirements: a question, answered by the (fake) interviewer.
  await panel.getByLabel('Say something to the interviewer').fill('Do edits have to show up on the very next scan?');
  await Promise.all([answered(page, 'say'), panel.getByRole('button', { name: 'Say' }).click()]);
  await expect(panel.getByText('(fake interviewer) Good question.')).toBeVisible();
  await axe(page);
  await shots(page, 'interview-design-requirements');

  // Estimate: every number, readable, before the design.
  await Promise.all([answered(page, 'phase'), panel.getByRole('button', { name: 'Move on: Estimate' }).click()]);
  await expect(current).toHaveText('Estimate');
  await expect(panel.getByRole('button', { name: 'Start designing' })).toBeDisabled();
  const peak = panel.getByLabel(/how many requests a second/);
  await peak.fill('lots');
  await expect(panel.getByRole('button', { name: 'Tell the interviewer' })).toBeDisabled();
  await peak.fill('5k');
  await panel.getByLabel(/how much data a second/).fill('100 MB/s');
  await Promise.all([answered(page, 'estimate'), panel.getByRole('button', { name: 'Tell the interviewer' }).click()]);
  await expect(panel.getByText('(fake interviewer) How did you get to the first of those numbers?')).toBeVisible();
  await Promise.all([answered(page, 'phase'), panel.getByRole('button', { name: 'Start designing' }).click()]);

  // Design: the traffic shows now, and the canvas; the design is the learner's (kept as a draft on this device).
  await expect(current).toHaveText('Design');
  await expect(page.getByText('5K requests a second, 95% reads')).toBeVisible();
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [`algorender:design:interview:${round.id}`, withCache(round.design)] as const);
  await page.reload();
  await expect(current).toHaveText('Design', { timeout: 30_000 });
  // The canvas's text list of components now has the cache (the draft came back).
  await expect(page.getByText(/^Cache, Cache: 2 nodes/)).toBeAttached();
  // No hints or solution on the canvas in an interview.
  await expect(page.getByRole('button', { name: 'Show a solution' })).toHaveCount(0);
  await expect(page.getByText('8 of 8 checks left.')).toBeVisible();
  await Promise.all([answered(page, 'check'), page.getByRole('button', { name: 'Run the checks' }).click()]);
  await expect(page.getByRole('status').filter({ hasText: 'Every target is met.' })).toBeAttached();
  await expect(page.getByText('7 of 8 checks left.')).toBeVisible();
  await panel.getByLabel('Your design, in words').fill(EXPLAIN);
  await Promise.all([answered(page, 'explain'), panel.getByRole('button', { name: 'Explain it to the interviewer' }).click()]);
  await expect(panel.getByText('(fake interviewer) What does that choice cost you')).toBeVisible();
  await axe(page);
  await shots(page, 'interview-design-round');

  // The deep dive: the server says what goes wrong, and checks now run through it.
  await Promise.all([answered(page, 'phase'), panel.getByRole('button', { name: 'Move on: Deep dive' }).click()]);
  await expect(current).toHaveText('Deep dive');
  await expect(panel.getByText('one of your app servers crashes and stays down')).toBeVisible();
  await Promise.all([answered(page, 'check'), page.getByRole('button', { name: 'Run the checks' }).click()]);
  await expect(page.getByText('An app server crashes at 3 s: errors').first()).toBeVisible();
  await panel.getByLabel('Say something to the interviewer').fill('The other three app servers take its share, and the cache still answers most scans.');
  await Promise.all([answered(page, 'say'), panel.getByRole('button', { name: 'Say' }).click()]);

  // The debrief: targets, estimation and cost by code, the rest by the (fake) model.
  await Promise.all([answered(page, 'end'), panel.getByRole('button', { name: 'Finish and get my debrief' }).click()]);
  await expect(page.getByText('Meets the bar', { exact: true }).first()).toBeVisible();
  for (const name of ['Targets: 4 of 4', 'Estimation: 4 of 4', 'Cost: 4 of 4', 'Trade-offs: 3 of 4', 'Communication: 3 of 4']) await expect(page.getByRole('progressbar', { name })).toBeVisible();
  await expect(page.getByText('System-design round · 45 minutes')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The trade-off' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'One design that meets every target' })).toBeVisible();
  await expect(page.getByText('“I keep the”').first()).toBeVisible();
  await expect(page.getByRole('table', { name: /Minutes per phase/ })).toBeAttached();
  await expect(page.getByText('This problem is in your review for tomorrow')).toHaveCount(0);
  await axe(page);
  await shots(page, 'interview-design-debrief');

  // The hub lists it as a design round.
  await page.goto('/practice/interview');
  await expect(page.getByRole('link', { name: /Menus behind QR codes.*Meets the bar/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/System design · \d+ min of 45/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('the hub starts a design round, and the learner scores it when the model can’t', async ({ page }) => {
  test.setTimeout(120_000);
  await skipWithoutInterviews(page);
  await signUp(page);
  await page.goto('/practice/interview');
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'System-design round' }) });
  await expect(card.getByRole('button', { name: 'Start design round' })).toBeEnabled({ timeout: 30_000 });
  await card.getByLabel('Case study').selectOption('chat');
  await card.getByRole('button', { name: 'Start design round' }).click();
  await expect(page).toHaveURL(/\/practice\/interview\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByRole('list', { name: 'Interview phases' }).locator('[aria-current="step"]')).toHaveText('Requirements', { timeout: 30_000 });
  const id = page.url().split('/').at(-1)!;

  // Through the API to the Design phase, with an explanation the stand-in debrief can't score.
  await post(page, { action: 'phase', round: id, to: 'estimate' });
  const { body } = await post(page, { action: 'phase', round: id, to: 'estimate' });
  expect(body.error).toBeTruthy();
  const start = await page.request.get(`/api/interview?round=${id}`);
  const variant = ((await start.json()) as { round: { variant: string } }).round.variant;
  expect(['sensor-readings', 'game-moves']).toContain(variant);
  await post(page, { action: 'estimate', round: id, answers: [{ id: 'peak', text: '10k' }, { id: 'storage', text: '30 TB' }] });
  await post(page, { action: 'phase', round: id, to: 'design' });
  await post(page, { action: 'explain', round: id, text: `${EXPLAIN} FAILDEBRIEF` });
  await page.reload();
  await expect(page.getByRole('list', { name: 'Interview phases' }).locator('[aria-current="step"]')).toHaveText('Design', { timeout: 30_000 });
  await page.getByRole('button', { name: 'End interview' }).click();
  await Promise.all([answered(page, 'end'), page.getByRole('button', { name: 'End it' }).click()]);
  await expect(page.getByRole('heading', { name: 'Score your round' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: /^Targets: \d of 4$/ })).toBeVisible();
  for (const name of ['Trade-offs', 'Communication']) await page.getByRole('group', { name, exact: true }).getByText('3 · Meets the bar').click();
  await axe(page);
  await Promise.all([answered(page, 'self'), page.getByRole('button', { name: 'Save my scores' }).click()]);
  await expect(page.getByRole('progressbar', { name: 'Trade-offs: 3 of 4' })).toBeVisible();
});
