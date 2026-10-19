import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { collectErrors } from './errors';

// Accounts, synced progress and the daily review, against the app's own
// database (PGlite, or DATABASE_URL). Every test signs up a fresh learner.

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const PASSWORD = 'a long enough password';
const DAY = 86_400_000;

const TWO_SUM_JS = `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
  return [];
}
`;

const freshEmail = () => `learner-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

/** Code saved for a problem before the page loads, as if the learner had typed it. Skips the sandbox's frames, which have no storage. */
async function withCode(context: BrowserContext, slug: string, code: string) {
  await context.addInitScript(
    ([s, c]) => {
      if (window !== window.top) return;
      localStorage.setItem('algorender:language', 'javascript');
      localStorage.setItem(`algorender:code:problem:${s}:javascript`, c);
    },
    [slug, code],
  );
}

async function solveTwoSum(page: Page) {
  await page.goto('/practice/two-sum');
  await page.getByRole('button', { name: 'Submit' }).click();
  // The first run starts the sandboxed runner.
  await expect(page.getByRole('group', { name: 'Test results' })).toContainText(/Solved: all \d+ tests pass\./, { timeout: 30_000 });
}

async function signUp(page: Page, email: string, name = 'Ada') {
  await page.goto('/account');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Synced/ })).toBeVisible({ timeout: 20_000 });
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/account');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
}

const synced = (page: Page) => expect(page.getByRole('status').filter({ hasText: /Synced/ })).toBeVisible({ timeout: 20_000 });

test('work done before signing up comes with the account, and reaches another device', async ({ page, browser }) => {
  const errors = collectErrors(page);
  await withCode(page.context(), 'two-sum', TWO_SUM_JS);
  await solveTwoSum(page);
  const email = freshEmail();
  await signUp(page, email);
  await expect(page.getByRole('link', { name: /Problems solved/ })).toContainText('1');
  await expect(page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Ada' })).toBeVisible();

  const other = await browser.newContext();
  const phone = await other.newPage();
  await signIn(phone, email);
  await synced(phone);
  await phone.goto('/practice');
  await expect(phone.getByText(/^1 of \d+ solved in this browser$/)).toBeVisible();
  await other.close();
  expect(errors).toEqual([]);
});

test('signing out clears this device, and signing back in brings the progress back', async ({ page }) => {
  await withCode(page.context(), 'two-sum', TWO_SUM_JS);
  const email = freshEmail();
  await signUp(page, email);
  await solveTwoSum(page);
  await page.goto('/account');
  await synced(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Create an account' })).toBeVisible();
  await page.goto('/practice');
  await expect(page.getByText(/^0 of \d+ solved in this browser$/)).toBeVisible();

  await signIn(page, email);
  await synced(page);
  await page.goto('/practice');
  await expect(page.getByText(/^1 of \d+ solved in this browser$/)).toBeVisible();
});

test('a wrong password and a taken email are explained', async ({ page }) => {
  const email = freshEmail();
  await signUp(page, email);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Create an account' })).toBeVisible();
  await signIn(page, email, 'not the password');
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
});

test('a solved problem comes back for review a few days later', async ({ page }) => {
  const errors = collectErrors(page);
  await withCode(page.context(), 'two-sum', TWO_SUM_JS);
  await page.goto('/review');
  await expect(page.getByRole('heading', { name: 'No cards yet' })).toBeVisible();
  await solveTwoSum(page);

  await page.goto('/review');
  await expect(page.getByRole('heading', { name: 'Nothing due today.' })).toBeVisible();
  await expect(page.getByText('You have 1 card in all.')).toBeVisible();

  await page.clock.setFixedTime(new Date(Date.now() + 3 * DAY));
  // The rail shows the due count; the review itself is a focused page without it.
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Review: 1 due today' }).first()).toBeVisible();
  await page.goto('/review');
  await expect(page.getByRole('heading', { name: 'Two Sum' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('Hashing', { exact: true })).toBeVisible();
  await page.keyboard.press('3');
  await expect(page.getByRole('heading', { name: 'All done for today: 1 reviewed.' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a quiz question answered wrongly comes back the next day', async ({ page }) => {
  await page.goto('/learn/binary-search');
  const first = page.getByRole('group', { name: 'Question 1' });
  await first.getByRole('button').nth(1).click(); // a wrong answer: the right one is the first
  await page.clock.setFixedTime(new Date(Date.now() + DAY + 3_600_000));
  await page.goto('/review');
  await expect(page.getByText(/^From Binary search/)).toBeVisible();
  await page.getByRole('group', { name: 'Choices' }).getByRole('button').first().click();
  await expect(page.getByText('Right.')).toBeVisible();
  await page.getByRole('button', { name: /^Good/ }).click();
  await expect(page.getByRole('heading', { name: /All done for today/ })).toBeVisible();
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });

  test('the review opens offline, and ratings made offline sync when back', async ({ page, context }) => {
    await page.goto('/review');
    const registered = await page.evaluate(async () => {
      for (let i = 0; i < 30; i++) {
        if (await navigator.serviceWorker.getRegistration()) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    });
    test.skip(!registered, 'The service worker is registered in production builds only (npm run build, then next start).');
    await withCode(context, 'two-sum', TWO_SUM_JS);
    const email = freshEmail();
    await signUp(page, email);
    await solveTwoSum(page);
    await page.clock.setFixedTime(new Date(Date.now() + 3 * DAY));
    await page.goto('/review');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload(); // now under the worker's control, so the page is cached
    await expect(page.getByRole('heading', { name: 'Two Sum' })).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Daily review' })).toBeVisible();
    await page.getByRole('button', { name: /Show answer/ }).click();
    await page.getByRole('button', { name: /^Good/ }).click();
    await expect(page.getByRole('heading', { name: /All done for today/ })).toBeVisible();

    await context.setOffline(false);
    await page.goto('/account');
    await synced(page);
    await expect(page.getByRole('status').filter({ hasText: /changes? waits? to sync/ })).toHaveCount(0);
  });
});

test('deleting the account removes it', async ({ page }) => {
  const email = freshEmail();
  await signUp(page, email);
  await page.getByRole('button', { name: 'Delete account…' }).click();
  await page.getByLabel('Your password, to confirm').fill(PASSWORD);
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByRole('button', { name: 'Create an account' })).toBeVisible();
  await signIn(page, email);
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the signed-in account page and a review card pass axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await withCode(page.context(), 'two-sum', TWO_SUM_JS);
    await signUp(page, freshEmail());
    let { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);

    await solveTwoSum(page);
    await page.clock.setFixedTime(new Date(Date.now() + 3 * DAY));
    await page.goto('/review');
    await page.getByRole('button', { name: /Show answer/ }).click();
    ({ violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze());
    expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  });
}
