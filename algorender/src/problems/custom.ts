// Your own test on a practice problem: the input a learner types, read the way
// their language writes values (None and True in Python, null and true
// elsewhere, strings in either quotes), checked against the problem's
// signature, and made into a test both judges run like any other (judge.ts
// here, src/server/judge/ for Java, C++ and Go). It has no expected answer:
// the learner checks the answer themselves, so it is run, not judged.

import type { Json } from '@/workspace/protocol';
import { methodIn, nameIn } from './codegen';
import { formatValue, type JudgeCase, type ProblemSpec } from './judge';
import type { ProblemLanguage } from './languages';
import type { DesignSig, Param, ValueType } from './schema';

/** The most characters a custom test's input may take, written as JSON: room for any of the problems' own tests, pasted in. */
export const MAX_CUSTOM = 50_000;
/** The most calls a design problem's custom test may make. */
export const MAX_CALLS = 2_000;

/** The field a design problem's calls are typed in; a function problem has one field per parameter, by name. */
export const CALLS = 'calls';

/** What a learner types: a value per parameter, or a design problem's calls, one per line. */
export type CustomText = Record<string, string>;

/** A custom test's values, as the server judge receives them. */
export type CustomInput = { input?: Record<string, Json>; calls?: [string, ...Json[]][] };

/** Typed text read as a test, or what's wrong with each field ('' for the test as a whole). */
export type CustomRead = { ok: true; test: JudgeCase } | { ok: false; errors: Record<string, string> };

/** The test a custom input makes. */
export const customCase = (custom: CustomInput): JudgeCase => ({ id: 'custom', label: 'Your test', group: 'custom', ...custom, expected: null });

/** A test as the learner would type it in their language: by default the first example, where a custom test starts. */
export function customText(spec: ProblemSpec, language: ProblemLanguage, test = spec.cases.find((c) => c.group === 'example')): CustomText {
  const literal = (v: Json) => formatValue(v, language, Infinity);
  if (spec.design) {
    const lines = (test?.calls ?? [[spec.design.class]]).map(([method, ...args], i) => `${i === 0 ? method : methodIn(method, language)}(${args.map(literal).join(', ')})`);
    return { [CALLS]: lines.join('\n') };
  }
  return Object.fromEntries((spec.signature?.params ?? []).map((p) => [p.name, literal(test?.input?.[p.name] ?? null)]));
}

/** Reads what the learner typed into a test, or says what's wrong with it. */
export function readCustom(spec: ProblemSpec, text: CustomText, language: ProblemLanguage): CustomRead {
  if (spec.design) {
    const read = readCalls(spec.design, text[CALLS] ?? '', language);
    return 'error' in read ? { ok: false, errors: { [CALLS]: read.error } } : sized({ calls: read.calls });
  }
  const errors: Record<string, string> = {};
  const input: Record<string, Json> = {};
  for (const p of spec.signature?.params ?? []) {
    const raw = text[p.name] ?? '';
    if (!raw.trim()) {
      errors[p.name] = `Type a value for ${nameIn(p.name, language)}: ${describe(p.type, language)}.`;
      continue;
    }
    try {
      const value = parseLiteral(raw);
      const problem = valueError(p.type, value, language, '');
      if (problem) errors[p.name] = problem;
      else input[p.name] = value;
    } catch (e) {
      if (!(e instanceof LiteralError)) throw e;
      errors[p.name] = e.message;
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : sized({ input });
}

function sized(custom: CustomInput): CustomRead {
  if (JSON.stringify(custom).length > MAX_CUSTOM) {
    return { ok: false, errors: { '': `Your test is too big to run here: keep its input under ${MAX_CUSTOM.toLocaleString('en')} characters.` } };
  }
  return { ok: true, test: customCase(custom) };
}

/**
 * Checks a custom test the server judge received (already parsed as JSON):
 * the problem's parameters and no others, or calls of its class's methods,
 * each value of its parameter's type. Answers what's wrong, or null.
 */
export function customError(spec: ProblemSpec, custom: { input?: unknown; calls?: unknown }, language: ProblemLanguage): string | null {
  if (JSON.stringify(custom).length > MAX_CUSTOM) return `A custom test's input is limited to ${MAX_CUSTOM.toLocaleString('en')} characters.`;
  if (spec.design) {
    if (custom.input !== undefined || !Array.isArray(custom.calls)) return 'A design problem’s test is a list of calls.';
    return callsError(spec.design, custom.calls as Json[], language);
  }
  const params = spec.signature?.params ?? [];
  const input = custom.input;
  if (custom.calls !== undefined || input === null || typeof input !== 'object' || Array.isArray(input)) return 'A test’s input gives each parameter a value.';
  const record = input as Record<string, Json>;
  const extra = Object.keys(record).find((k) => !params.some((p) => p.name === k));
  if (extra) return `There’s no parameter called ${extra}.`;
  for (const p of params) {
    if (!(p.name in record)) return `${nameIn(p.name, language)} has no value.`;
    const problem = valueError(p.type, record[p.name], language, nameIn(p.name, language));
    if (problem) return problem;
  }
  return null;
}

// ─── Calls (design problems) ─────────────────────────────────────────────

/** `push(3)`, `obj.push(3)`, `obj = MinStack()`, `new MinStack()`: a name and its arguments. */
const CALL = /^\s*(?:[A-Za-z_]\w*\s*=\s*)?(?:new\s+)?(?:[A-Za-z_]\w*\s*\.\s*)?([A-Za-z_]\w*)\s*\((.*)\)\s*;?\s*$/;

/** Names match however they're written: getMin, get_min and GetMin are one method. */
const sameName = (a: string, b: string) => a.replace(/_/g, '').toLowerCase() === b.replace(/_/g, '').toLowerCase();

function readCalls(design: DesignSig, text: string, language: ProblemLanguage): { calls: [string, ...Json[]][] } | { error: string } {
  const make = `${design.class}(${design.init.map((p) => nameIn(p.name, language)).join(', ')})`;
  const lines = text.split('\n').map((line, i) => ({ line, n: i + 1 })).filter(({ line }) => line.trim() !== '');
  if (lines.length === 0) return { error: `Write the calls, one per line, starting with the one that makes the object: ${make}.` };
  if (lines.length > MAX_CALLS) return { error: `A test can make at most ${MAX_CALLS} calls.` };
  const calls: [string, ...Json[]][] = [];
  for (const [k, { line, n }] of lines.entries()) {
    const match = CALL.exec(line);
    if (!match) return { error: `Line ${n}: write a call, like ${k === 0 ? make : `${methodIn(design.methods[0].name, language)}(…)`}.` };
    const [, name, inner] = match;
    let args: Json[];
    try {
      args = parseLiteral(`[${inner}]`) as Json[];
    } catch (e) {
      if (!(e instanceof LiteralError)) throw e;
      return { error: `Line ${n}: ${e.message}` };
    }
    if (k === 0) {
      if (!sameName(name, design.class)) return { error: `Line ${n} should make the object: ${make}.` };
      calls.push([design.class, ...args]);
      continue;
    }
    if (sameName(name, design.class)) return { error: `Line ${n}: only the first line makes a ${design.class}.` };
    const method = design.methods.find((m) => sameName(m.name, name));
    if (!method) return { error: `Line ${n}: a ${design.class} has no method called ${name}. Its methods are ${list(design.methods.map((m) => methodIn(m.name, language)))}.` };
    calls.push([method.name, ...args]);
  }
  const problem = callsError(design, calls, language, 'Line', lines.map((l) => l.n));
  return problem ? { error: problem } : { calls };
}

/** What's wrong with a list of calls (constructor first), or null. */
function callsError(design: DesignSig, calls: Json[], language: ProblemLanguage, word = 'Call', numbers?: number[]): string | null {
  if (calls.length === 0) return 'A test makes at least one call, the constructor.';
  if (calls.length > MAX_CALLS) return `A test can make at most ${MAX_CALLS} calls.`;
  for (const [i, call] of calls.entries()) {
    const at = `${word} ${numbers?.[i] ?? i + 1}`;
    if (!Array.isArray(call) || typeof call[0] !== 'string') return `${at} isn’t a call.`;
    const [name, ...args] = call;
    const params = i === 0 ? (name === design.class ? design.init : null) : (design.methods.find((m) => m.name === name)?.params ?? null);
    if (!params) return i === 0 ? `${at} should make a ${design.class}.` : `${at}: there’s no method called ${name}.`;
    const label = i === 0 ? design.class : methodIn(name, language);
    const problem = argsError(params, args, language, label);
    if (problem) return `${at}: ${problem}`;
  }
  return null;
}

function argsError(params: Param[], args: Json[], language: ProblemLanguage, call: string): string | null {
  if (args.length !== params.length) {
    const takes = params.length === 0 ? 'no arguments' : params.length === 1 ? 'one argument' : `${params.length} arguments`;
    return `${call} takes ${takes}, not ${args.length}.`;
  }
  for (const [k, p] of params.entries()) {
    const problem = valueError(p.type, args[k], language, nameIn(p.name, language));
    if (problem) return problem;
  }
  return null;
}

// ─── Types ───────────────────────────────────────────────────────────────

const INT_MIN = -(2 ** 31);
const INT_MAX = 2 ** 31 - 1;

/** A value type in words: what a field asks for. */
export function describe(type: ValueType, language: ProblemLanguage): string {
  const none = language === 'python' ? 'None' : 'null';
  switch (type) {
    case 'int':
    case 'long':
      return 'a whole number';
    case 'float':
      return 'a number';
    case 'bool':
      return language === 'python' ? 'True or False' : 'true or false';
    case 'string':
      return 'a string in quotes';
    case 'TreeNode':
      return `a tree in level order, like [1, 2, 3, ${none}, 4]`;
    case 'ListNode':
      return 'a linked list, written as a list like [1, 2, 3]';
    default:
      return `a list of ${plural(type.slice(0, -2) as ValueType, language)}`;
  }
}

function plural(type: ValueType, language: ProblemLanguage): string {
  if (type === 'int' || type === 'long') return 'whole numbers';
  if (type === 'float') return 'numbers';
  if (type === 'bool') return language === 'python' ? 'True/False values' : 'true/false values';
  if (type === 'string') return 'strings in quotes';
  return `lists of ${plural(type.slice(0, -2) as ValueType, language)}`;
}

/**
 * What's wrong with a value for a parameter of this type, or null. `where`
 * names the value in the message: '' for a field's own value, a parameter's
 * name, or 'Item 3' and 'Row 2, item 3' inside lists.
 */
export function valueError(type: ValueType, value: Json, language: ProblemLanguage, where: string): string | null {
  const should = `${where ? `${where} should` : 'Should'} be ${describe(type, language)}, not ${shown(value, language)}.`;
  switch (type) {
    case 'int':
    case 'long':
      if (typeof value !== 'number' || !Number.isInteger(value)) return should;
      if (type === 'int' && (value < INT_MIN || value > INT_MAX)) return `${where ? `${where} is ${value}, ` : `${value} is `}too big for an int, which holds ${INT_MIN} to ${INT_MAX}.`;
      if (!Number.isSafeInteger(value)) return `${where ? `${where} is ${value}, ` : `${value} is `}too big: whole numbers here go up to 2^53.`;
      return null;
    case 'float':
      return typeof value === 'number' ? null : should;
    case 'bool':
      return typeof value === 'boolean' ? null : should;
    case 'string':
      return typeof value === 'string' ? null : should;
    case 'TreeNode':
      return treeError(value, language, where, should);
    case 'ListNode':
      return Array.isArray(value) ? itemsError(value, 'int', language, where) : should;
    default: {
      if (!Array.isArray(value)) return should;
      return itemsError(value, type.slice(0, -2) as ValueType, language, where);
    }
  }
}

function itemsError(items: Json[], inner: ValueType, language: ProblemLanguage, where: string): string | null {
  for (const [i, item] of items.entries()) {
    const here = inner.endsWith('[]') ? `Row ${i + 1}` : where ? `${where}, item ${i + 1}` : `Item ${i + 1}`;
    const problem = valueError(inner, item, language, here);
    if (problem) return problem;
  }
  return null;
}

/** A level-order tree: whole numbers or None, a root unless it's empty, and a parent for every value. */
function treeError(value: Json, language: ProblemLanguage, where: string, should: string): string | null {
  if (!Array.isArray(value)) return should;
  const none = language === 'python' ? 'None' : 'null';
  const say = (s: string) => (where ? `${where}: ${s}` : s[0].toUpperCase() + s.slice(1));
  for (const [i, item] of value.entries()) {
    if (item === null) continue;
    const problem = valueError('int', item, language, `item ${i + 1}`);
    if (problem) return say(problem.replace('be a whole number', `be a whole number or ${none}`));
  }
  if (value.length > 0 && value[0] === null) return say(`the first value is the root, so it can’t be ${none}: write [] for an empty tree.`);
  // Each node has two places for children, filled in level order; a value with no place left has no parent.
  let places = value.length > 0 ? 2 : 0;
  for (let i = 1; i < value.length; i++) {
    if (places === 0) return say(`item ${i + 1} has no parent: every node before it already has both children, or is ${none}.`);
    places--;
    if (value[i] !== null) places += 2;
  }
  return null;
}

const shown = (v: Json, language: ProblemLanguage) => {
  const text = formatValue(v, language);
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
};

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

// ─── Literals ────────────────────────────────────────────────────────────

/** Why typed text isn't a value. */
export class LiteralError extends Error {}

const WORDS: Record<string, Json> = { None: null, null: null, nil: null, True: true, true: true, False: false, false: false };

/**
 * A value typed as a literal: JSON, plus what Python and Go write (None,
 * True, False, nil), strings in single or double quotes, and a comma after a
 * list's last item.
 */
export function parseLiteral(text: string): Json {
  const reader = new Reader(text);
  const value = reader.value();
  reader.space();
  if (!reader.done()) throw new LiteralError(`Unexpected ${reader.near()} after the value.`);
  return value;
}

class Reader {
  private i = 0;
  constructor(private readonly s: string) {}

  space() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }

  done() {
    return this.i >= this.s.length;
  }

  /** The text at the current position, for an error message. */
  near(): string {
    if (this.done()) return 'the end';
    const token = /^(\w+|\S)/.exec(this.s.slice(this.i))?.[0] ?? this.s[this.i];
    return `“${token}”`;
  }

  value(): Json {
    this.space();
    if (this.done()) throw new LiteralError('A value is missing.');
    const c = this.s[this.i];
    if (c === '[') return this.list();
    if (c === '"' || c === "'") return this.string(c);
    if (/[-+.\d]/.test(c)) return this.number();
    const word = /^[A-Za-z_]\w*/.exec(this.s.slice(this.i))?.[0];
    if (word !== undefined) {
      if (Object.hasOwn(WORDS, word)) {
        this.i += word.length;
        return WORDS[word];
      }
      throw new LiteralError(`${word} isn’t a value: put a string in quotes, like "${word}".`);
    }
    throw new LiteralError(`Unexpected ${this.near()}${c === '{' || c === '(' ? ': write lists in [ ]' : ''}.`);
  }

  private list(): Json[] {
    this.i++;
    const items: Json[] = [];
    for (;;) {
      this.space();
      if (this.s[this.i] === ']') {
        this.i++;
        return items;
      }
      items.push(this.value());
      this.space();
      const c = this.s[this.i];
      if (c === ',') this.i++;
      else if (c !== ']') throw new LiteralError(this.done() ? 'A list is missing its closing ].' : `Expected a comma or ] but found ${this.near()}.`);
    }
  }

  private string(quote: string): string {
    this.i++;
    let out = '';
    while (this.i < this.s.length) {
      const c = this.s[this.i++];
      if (c === quote) return out;
      if (c === '\n') break;
      if (c !== '\\') {
        out += c;
        continue;
      }
      const e = this.s[this.i++];
      const simple: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '0': '\0', '\\': '\\', "'": "'", '"': '"', '/': '/' };
      if (e !== undefined && Object.hasOwn(simple, e)) out += simple[e];
      else if (e === 'u' || e === 'x') {
        const digits = this.s.slice(this.i, this.i + (e === 'u' ? 4 : 2));
        if (!/^[0-9a-fA-F]+$/.test(digits) || digits.length !== (e === 'u' ? 4 : 2)) throw new LiteralError(`\\${e} needs ${e === 'u' ? 4 : 2} hex digits.`);
        out += String.fromCharCode(parseInt(digits, 16));
        this.i += digits.length;
      } else throw new LiteralError(`Unknown escape \\${e ?? ''} in a string.`);
    }
    throw new LiteralError(`A string is missing its closing ${quote}.`);
  }

  private number(): number {
    const match = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/.exec(this.s.slice(this.i));
    if (!match) throw new LiteralError(`Unexpected ${this.near()}.`);
    const n = Number(match[0]);
    if (!Number.isFinite(n)) throw new LiteralError(`${match[0]} is too big.`);
    this.i += match[0].length;
    return n;
  }
}
