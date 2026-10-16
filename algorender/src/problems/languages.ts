// The languages a practice problem can be solved in. Python, JavaScript and
// TypeScript run in the browser (src/workspace/); Java, C++ and Go run on the
// server judge (src/server/judge/), so they need an account.

import { LANGUAGES, type Language } from '@/workspace/protocol';

export type ServerLanguage = 'java' | 'cpp' | 'go';
export type ProblemLanguage = Language | ServerLanguage;

export const SERVER_LANGUAGES: Record<ServerLanguage, { label: string; extension: string }> = {
  java: { label: 'Java', extension: 'java' },
  cpp: { label: 'C++', extension: 'cpp' },
  go: { label: 'Go', extension: 'go' },
};

export const PROBLEM_LANGUAGES: Record<ProblemLanguage, { label: string; extension: string }> = { ...LANGUAGES, ...SERVER_LANGUAGES };

export const PROBLEM_LANGUAGE_IDS = Object.keys(PROBLEM_LANGUAGES) as ProblemLanguage[];

export const isServerLanguage = (language: string): language is ServerLanguage => Object.hasOwn(SERVER_LANGUAGES, language);

export const isProblemLanguage = (language: string): language is ProblemLanguage => Object.hasOwn(PROBLEM_LANGUAGES, language);

/**
 * How much longer than JavaScript a test may take in each language. Python
 * runs in Pyodide; Java's JIT warms up during the first tests. Startup and
 * compiling are never counted: each test is timed around the call itself.
 */
export const TIME_FACTOR: Record<ProblemLanguage, number> = { python: 3, javascript: 1, typescript: 1, java: 2, cpp: 1, go: 1 };
