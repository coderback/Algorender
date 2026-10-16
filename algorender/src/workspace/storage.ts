// The learner's code and language choice, kept in this browser: drafts, not
// progress (passed stages are events in src/progress/). Storage can be
// unavailable (private mode, blocked site data), so every access falls back
// quietly.

import type { Language } from './protocol';

const codeKey = (slug: string, language: Language) => `algorender:code:${slug}:${language}`;
const LANGUAGE_KEY = 'algorender:language';

export function loadCode(slug: string, language: Language): string | null {
  try {
    return localStorage.getItem(codeKey(slug, language));
  } catch {
    return null;
  }
}

export function saveCode(slug: string, language: Language, code: string | null) {
  try {
    if (code == null) localStorage.removeItem(codeKey(slug, language));
    else localStorage.setItem(codeKey(slug, language), code);
  } catch {
    // Not saved; the code still runs.
  }
}

export function loadLanguage(): Language | null {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY);
    return value === 'python' || value === 'javascript' || value === 'typescript' ? value : null;
  } catch {
    return null;
  }
}

export function saveLanguage(language: Language) {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Not saved.
  }
}
