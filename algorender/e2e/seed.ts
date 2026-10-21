import type { Page } from '@playwright/test';

// A learner's progress written straight into the device's event store
// (IndexedDB, as src/progress/store.ts keeps it), for pages that show it.

const DAY = 86_400_000;

type Seed = [kind: string, data: Record<string, unknown>, daysAgo: number];

/** About a week of learning: a plan, a finished lesson, one in progress, two solved problems, a mistake, a review today. */
export const LEARNER: Seed[] = [
  ['plan.set', { goal: 'interviews', hours: 5 }, 9],
  ['quiz.answered', { lesson: 'recursion', quiz: 'quiz', question: 0, correct: true }, 8],
  ['quiz.answered', { lesson: 'recursion', quiz: 'quiz', question: 1, correct: true }, 8],
  ['lesson.completed', { lesson: 'recursion', done: true }, 8],
  ['problem.submitted', { problem: 'two-sum', language: 'python', passed: true, tests: 12, failed: 0 }, 6],
  ['problem.submitted', { problem: 'contains-duplicate', language: 'python', passed: true, tests: 10, failed: 0 }, 5],
  ['quiz.answered', { lesson: 'binary-search', quiz: 'quiz', question: 0, correct: true }, 2],
  ['quiz.answered', { lesson: 'binary-search', quiz: 'quiz', question: 1, correct: false }, 2],
  ['misconception.picked', { lesson: 'binary-search', misconception: 'keep-mid', from: 'quiz' }, 2],
  ['game.played', { game: 'break-it', item: 'greedy-coins', score: 1, max: 1, won: true }, 1],
  ['review.rated', { card: 'quiz:recursion:quiz:0', rating: 3 }, 0],
];

/** Writes the events for the signed-out learner on this device. Call it on a page of the app, then navigate. */
export async function seed(page: Page, events: Seed[] = LEARNER) {
  const now = Date.now();
  // A minute in the past, so "today" holds whatever time zone the browser is in.
  const rows = events.map(([kind, data, daysAgo]) => ({ kind, data, at: new Date(now - daysAgo * DAY - 60_000).toISOString() }));
  // Wait until the app has created its store (Dexie makes the tables on first
  // open). Opening it ourselves any earlier would create an empty database.
  const ready = () =>
    page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      if (!dbs.some((d) => d.name === 'algorender-progress')) return false;
      return new Promise<boolean>((ok) => {
        const req = indexedDB.open('algorender-progress');
        req.onsuccess = () => {
          const has = req.result.objectStoreNames.contains('events');
          req.result.close();
          ok(has);
        };
        req.onerror = () => ok(false);
      });
    });
  for (let i = 0; !(await ready()); i++) {
    if (i > 80) throw new Error('The progress store never opened');
    await page.waitForTimeout(250);
  }
  await page.evaluate(async (rows) => {
    const v7 = (t: number) => {
      const h = t.toString(16).padStart(12, '0');
      const r = crypto.getRandomValues(new Uint8Array(10));
      const x = [...r].map((n) => n.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8)}-7${x.slice(0, 3)}-${(8 | (r[2] & 3)).toString(16)}${x.slice(5, 8)}-${x.slice(8, 20)}`;
    };
    const db = await new Promise<IDBDatabase>((ok, no) => {
      const req = indexedDB.open('algorender-progress');
      req.onsuccess = () => ok(req.result);
      req.onerror = () => no(req.error);
    });
    const tx = db.transaction('events', 'readwrite');
    for (const r of rows) tx.objectStore('events').put({ id: v7(Date.parse(r.at)), ...r, owner: 'anon', synced: 0 });
    await new Promise((ok) => (tx.oncomplete = ok));
    db.close();
  }, rows);
}
