// The replay console: the transcript it draws, and whole sessions played
// through both runtimes exactly as ReplayConsole.tsx plays them (answer a
// prompt, run again from the start with one more line).

import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { runJs } from './js/runtime';
import { DEFAULT_LIMITS, type Language, type RunRequest, type RunResult } from './protocol';
import { HARNESS } from './python/harness';
import { endInput, replayRequest, replayStatus, startReplay, transcript, typeLine, type ReplayState } from './replay';

type Runner = (request: RunRequest) => RunResult;

let python: Runner;

beforeAll(async () => {
  const pyodide = await loadPyodide();
  pyodide.runPython(HARNESS);
  const runRequest = pyodide.globals.get('run_request') as (json: string) => string;
  python = (request) => JSON.parse(runRequest(JSON.stringify(request)));
}, 120_000);

const runnerFor = (language: Language): Runner => (language === 'python' ? python : runJs);

/**
 * Plays a session: runs, then answers each time the program waits, until it
 * stops waiting or the answers run out; `end` then ends input. Returns every
 * run's result and the console's text at the end, typed lines in [brackets].
 */
function play(language: Language, code: string, answers: string[], { files, end = false, seed = 7 }: { files?: Record<string, string>; end?: boolean; seed?: number } = {}) {
  const runner = runnerFor(language);
  const go = (state: ReplayState) => runner({ language, code, entry: '', args: [], limits: DEFAULT_LIMITS, files, ...replayRequest(state) });
  let state = startReplay(seed);
  let result = go(state);
  const results = [result];
  for (const answer of answers) {
    if (!result.waiting) break;
    state = typeLine(state, answer);
    result = go(state);
    results.push(result);
  }
  if (end && result.waiting) {
    state = endInput(state);
    result = go(state);
    results.push(result);
  }
  const text = transcript(result, state.typed)
    .map((s) => (s.kind === 'in' ? `[${s.text.slice(0, -1)}]\n` : s.text))
    .join('');
  return { result, results, text, state };
}

describe('transcript', () => {
  it('writes each typed line where it was read, and stderr after stdout', () => {
    const segments = transcript({ stdout: 'Name? Hi Ada\nAge? ', stderr: 'warn\n', reads: [6] }, ['Ada']);
    expect(segments).toEqual([
      { kind: 'out', text: 'Name? ' },
      { kind: 'in', text: 'Ada\n' },
      { kind: 'out', text: 'Hi Ada\nAge? ' },
      { kind: 'err', text: 'warn\n' },
    ]);
  });

  it('stacks lines read at one place (all of stdin at once)', () => {
    expect(transcript({ stdout: 'AB\n', reads: [0, 0] }, ['a', 'b'])).toEqual([
      { kind: 'in', text: 'a\n' },
      { kind: 'in', text: 'b\n' },
      { kind: 'out', text: 'AB\n' },
    ]);
  });

  it('keeps a typed line the program never read, at the end', () => {
    expect(transcript({ stdout: 'done\n', reads: [] }, ['x'])).toEqual([
      { kind: 'out', text: 'done\n' },
      { kind: 'in', text: 'x\n' },
    ]);
  });

  it('asks for the typed lines, with input left open until it is ended', () => {
    const state = typeLine(typeLine(startReplay(5, 1000), 'a'), '');
    expect(replayRequest(state)).toEqual({ stdin: 'a\n\n', moreInput: true, seed: 5, clock: 1000 });
    expect(replayRequest(endInput(state))).toEqual({ stdin: 'a\n\n', moreInput: false, seed: 5, clock: 1000 });
  });

  it('words where the run stands', () => {
    expect(replayStatus({ waiting: true, exitCode: null, error: null })).toBe('Waiting for input');
    expect(replayStatus({ waiting: false, exitCode: 0, error: null })).toBe('Finished');
    expect(replayStatus({ waiting: false, exitCode: 2, error: null })).toBe('Finished with exit code 2');
    expect(replayStatus({ waiting: false, exitCode: null, error: { kind: 'limit', message: '', line: 1 } })).toBe('Stopped');
  });
});

// The same guessing game in each language: input in a loop, seeded random,
// and the verdict from a second file.
const GAME: Record<Language, { code: string; files: Record<string, string> }> = {
  python: {
    code: `import random
from referee import verdict

secret = random.randint(1, 20)
print("Pick from 1 to 20.")
while True:
    word = verdict(int(input("Guess: ")), secret)
    print(word)
    if word == "Got it!":
        break
`,
    files: { 'referee.py': 'def verdict(guess, secret):\n    if guess < secret:\n        return "Too low"\n    if guess > secret:\n        return "Too high"\n    return "Got it!"\n' },
  },
  javascript: {
    code: `const { verdict } = require("./referee");

const secret = 1 + Math.floor(Math.random() * 20);
console.log("Pick from 1 to 20.");
while (true) {
  const word = verdict(Number(input("Guess: ")), secret);
  console.log(word);
  if (word === "Got it!") break;
}
`,
    files: { 'referee.js': 'exports.verdict = (guess, secret) => (guess < secret ? "Too low" : guess > secret ? "Too high" : "Got it!");\n' },
  },
  typescript: {
    code: `import { verdict } from "./referee";

const secret: number = 1 + Math.floor(Math.random() * 20);
console.log("Pick from 1 to 20.");
while (true) {
  const word = verdict(Number(input("Guess: ")), secret);
  console.log(word);
  if (word === "Got it!") break;
}
`,
    files: { 'referee.ts': 'export function verdict(guess: number, secret: number): string {\n  return guess < secret ? "Too low" : guess > secret ? "Too high" : "Got it!";\n}\n' },
  },
};

describe.each(['python', 'javascript', 'typescript'] as const)('a session in %s', (language) => {
  it('binary-searches the seeded secret: every replay repeats the last and goes one read further', () => {
    const { code, files } = GAME[language];
    // Answer by bisection, reading each verdict from the previous run.
    const runner = runnerFor(language);
    let state = startReplay(11);
    let lo = 1;
    let hi = 20;
    let guess = 10;
    let result = runner({ language, code, entry: '', args: [], limits: DEFAULT_LIMITS, files, ...replayRequest(state) });
    const outputs = [result.stdout!];
    while (result.waiting) {
      state = typeLine(state, String(guess));
      result = runner({ language, code, entry: '', args: [], limits: DEFAULT_LIMITS, files, ...replayRequest(state) });
      outputs.push(result.stdout!);
      const last = result.stdout!.trimEnd().split('\n').at(-2) ?? '';
      const verdict = result.waiting ? last.replace(/^Guess: /, '') : 'Got it!';
      if (verdict === 'Too low') lo = guess + 1;
      if (verdict === 'Too high') hi = guess - 1;
      guess = Math.floor((lo + hi) / 2);
      expect(state.typed.length).toBeLessThan(6);
    }
    // Each run's output starts with the one before it: the replay is faithful.
    for (let k = 1; k < outputs.length; k++) expect(outputs[k].startsWith(outputs[k - 1])).toBe(true);
    expect(result).toMatchObject({ waiting: false, exitCode: 0, error: null });
    expect(result.stdout).toMatch(/Got it!\n$/);
    expect(result.reads).toHaveLength(state.typed.length);
  });

  it('draws the conversation as a terminal would', () => {
    const { text, result } = play(language, GAME[language].code, ['0', '21'], { files: GAME[language].files });
    expect(result.waiting).toBe(true);
    expect(text).toBe('Pick from 1 to 20.\nGuess: [0]\nToo low\nGuess: [21]\nToo high\nGuess: ');
  });

  it('ending input lets the program reach end of file: an error at the read', () => {
    const { result } = play(language, GAME[language].code, ['0'], { files: GAME[language].files, end: true });
    expect(result).toMatchObject({ waiting: false, exitCode: 1, error: { kind: 'runtime', message: 'EOFError: EOF when reading a line' } });
  });
});

describe('a program that reads until the end of input', () => {
  const code: Record<'python' | 'javascript', string> = {
    python: `import sys
total = 0
for line in sys.stdin:
    total += int(line)
    print("so far", total)
print("total", total)
`,
    javascript: `const rl = require("readline").createInterface({ input: process.stdin });
let total = 0;
rl.on("line", (line) => {
  total += Number(line);
  console.log("so far", total);
});
rl.on("close", () => console.log("total", total));
`,
  };

  it.each(['python', 'javascript'] as const)('%s: waits for each line, and finishes when input is ended', (language) => {
    const { text, result, results } = play(language, code[language], ['2', '3'], { end: true });
    expect(results.slice(0, -1).every((r) => r.waiting)).toBe(true);
    expect(result).toMatchObject({ waiting: false, exitCode: 0 });
    expect(text).toBe('[2]\nso far 2\n[3]\nso far 5\ntotal 5\n');
  });
});
