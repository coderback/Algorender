// Decision D1: / shows Today to anyone who has started (progress on this
// device, a goal, or a signed-in session) and the landing page to everyone
// else. Progress lives in IndexedDB, which takes a moment to read, so the
// last answer is kept in localStorage as a hint that HOME_SCRIPT applies
// before first paint; the store's answer then confirms or corrects it.

/** The hint: 'today' once the device has been seen to have started. */
export const HOME_KEY = 'algorender:home';
/** Set when the learner skips the onboarding: they have started, with nothing recorded yet. */
export const STARTED_KEY = 'algorender:started';

/** Set for the rest of the visit once the learner taps Today in the app's own navigation (see askForToday). */
const ASKED_KEY = 'algorender:today-asked';

/** Runs before first paint on /: stamps data-home="today" on <html> so the landing never flashes for a returning learner. */
export const HOME_SCRIPT = `(function(){try{if(localStorage.getItem('${HOME_KEY}')==='today'||sessionStorage.getItem('${ASKED_KEY}')==='1')document.documentElement.setAttribute('data-home','today')}catch(e){}})()`;

export function readHint(): 'today' | 'landing' | null {
  if (askedForToday()) return 'today';
  try {
    const v = localStorage.getItem(HOME_KEY);
    return v === 'today' || v === 'landing' ? v : null;
  } catch {
    return null;
  }
}

export function writeHint(view: 'today' | 'landing') {
  try {
    localStorage.setItem(HOME_KEY, view);
  } catch {
    // Without storage the store decides every time.
  }
  if (view === 'today') document.documentElement.setAttribute('data-home', 'today');
  else document.documentElement.removeAttribute('data-home');
}

export function hasStarted(): boolean {
  try {
    return localStorage.getItem(STARTED_KEY) === '1';
  } catch {
    return false;
  }
}

/** The learner skipped the onboarding: / is Today from now on. */
export function markStarted() {
  try {
    localStorage.setItem(STARTED_KEY, '1');
  } catch {
    // Not kept: the landing page comes back next visit.
  }
  writeHint('today');
}

/**
 * The learner chose Today from inside the app (the rail or the tab bar). On a
 * fresh device / would be the landing page, which has no app navigation, so a
 * phone would be stranded there: show Today, empty or not, for this visit.
 */
export function askForToday() {
  try {
    sessionStorage.setItem(ASKED_KEY, '1');
  } catch {
    // Without storage the landing page shows, as before.
  }
  document.documentElement.setAttribute('data-home', 'today');
}

export function askedForToday(): boolean {
  try {
    return sessionStorage.getItem(ASKED_KEY) === '1';
  } catch {
    return false;
  }
}

/** The whole rule, given what the store knows. */
export const isReturning = (s: { owner: string | null; events: readonly unknown[] }, started: boolean) => s.owner !== null || s.events.length > 0 || started;
