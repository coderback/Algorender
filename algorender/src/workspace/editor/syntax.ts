import type { syntaxTree } from '@codemirror/language';
import type { ProblemLanguage } from '@/problems/languages';

/**
 * Syntax errors as the learner types, found in the Lezer parse tree the editor
 * already builds, and said in plain words. Only Python, JavaScript and
 * TypeScript: their grammars are strict enough that an error node means a real
 * mistake, where Java's, C++'s and Go's are loose and would flag good code.
 *
 * Lezer marks where it got stuck, which is often after the real mistake (an
 * unclosed bracket shows up lines later), so a few mistakes are looked for
 * directly first: brackets that are never closed or close nothing, strings
 * without a closing quote, and in Python an indent that lines up with no block
 * above it (which the grammar accepts). Errors the parser finds after one of
 * the bracket or string mistakes are left out, since they usually follow from it.
 */

type Tree = ReturnType<typeof syntaxTree>;

export type CheckedLanguage = 'python' | 'javascript' | 'typescript';

export function isChecked(language: ProblemLanguage): language is CheckedLanguage {
  return language === 'python' || language === 'javascript' || language === 'typescript';
}

export interface SyntaxProblem {
  from: number;
  to: number;
  /** 1-based line of `from`. */
  line: number;
  message: string;
}

const NAME: Record<CheckedLanguage, string> = { python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript' };

/** At most this many problems, one per line; the first few are what matter. */
export const MAX_PROBLEMS = 10;

const OPENERS: Record<string, string> = { '(': ')', '[': ']', '{': '}', InterpolationStart: 'InterpolationEnd' };
const CLOSERS = new Set(Object.values(OPENERS));
const SHOWN: Record<string, string> = { InterpolationStart: '${', InterpolationEnd: '}' };
const shown = (name: string) => SHOWN[name] ?? name;
const STRINGS = new Set(['String', 'FormatString', 'TemplateString']);

/** Python lines that open a block, and so must end with a colon. */
const BLOCK_START = /^\s*(?:async\s+)?(if|elif|else|for|while|def|class|with|try|except|finally)\b/;

type Span = { from: number; to: number };
type Token = Span & { name: string };

export function syntaxProblems(tree: Tree, doc: string, language: CheckedLanguage): SyntaxProblem[] {
  const brackets: Token[] = [];
  const strings: Token[] = [];
  const comments: Span[] = [];
  const errors: Span[] = [];
  tree.iterate({
    enter(n) {
      if (n.type.isError) {
        if (!destructuring(n.node)) errors.push({ from: n.from, to: n.to });
      }
      else if (n.name in OPENERS || CLOSERS.has(n.name)) brackets.push({ name: n.name, from: n.from, to: n.to });
      else if (STRINGS.has(n.name)) strings.push({ name: n.name, from: n.from, to: n.to });
      else if (n.name === 'Comment' || n.name === 'LineComment' || n.name === 'BlockComment') comments.push({ from: n.from, to: n.to });
    },
  });

  const lines = lineStarts(doc);
  const lineOf = (pos: number) => lineAt(lines, pos);
  const specific: Omit<SyntaxProblem, 'line'>[] = [];

  // Brackets: a closer that matches an opener further down the stack means the
  // openers above it were never closed.
  const stack: Token[] = [];
  const pairs: Span[] = [];
  for (const b of brackets) {
    if (b.name in OPENERS) {
      stack.push(b);
      continue;
    }
    const match = findLastIndex(stack, (o) => OPENERS[o.name] === b.name);
    if (match < 0) {
      const opener = Object.keys(OPENERS).find((o) => OPENERS[o] === b.name)!;
      specific.push({ from: b.from, to: b.to, message: `This ${shown(b.name)} has no ${shown(opener)} before it to close.` });
      continue;
    }
    for (const o of stack.splice(match + 1)) specific.push(unclosed(o));
    const opener = stack.pop()!;
    pairs.push({ from: opener.from, to: b.to });
  }
  for (const o of stack) {
    specific.push(unclosed(o));
    pairs.push({ from: o.from, to: doc.length + 1 });
  }

  for (const s of strings) {
    const quote = missingQuote(doc.slice(s.from, s.to), s.name);
    if (quote) {
      const at = s.from + quote.at;
      specific.push({ from: s.from, to: Math.max(at, s.from + 1), message: `This string is missing its closing quote (${quote.quote}).` });
    }
  }

  const firstSpecific = Math.min(...specific.map((p) => p.from));
  const found: Omit<SyntaxProblem, 'line'>[] = [...specific];

  if (language === 'python') found.push(...pythonIndents(doc, lines, pairs, strings, comments));

  for (const e of errors) {
    if (e.from >= firstSpecific) continue;
    found.push(describe(e, tree, doc, lines, comments, language));
  }

  // One problem per line, in order; a direct finding beats the parser's on its line.
  const byLine = new Map<number, SyntaxProblem>();
  for (const p of found.map((p) => ({ ...p, ...visible(doc, p) })).sort((a, b) => a.from - b.from)) {
    const line = lineOf(p.from);
    if (!byLine.has(line)) byLine.set(line, { ...p, line });
  }
  return [...byLine.values()].slice(0, MAX_PROBLEMS);
}

type Node = ReturnType<Tree['resolveInner']>;

/**
 * Lezer's JavaScript grammar only lets names be destructured, so the swap
 * `[a[i], a[j]] = [a[j], a[i]]` (in every sorting exercise) parses as an
 * array followed by a stray `=`. That one shape is not a mistake.
 */
function destructuring(error: Node): boolean {
  return error.prevSibling?.name === 'ArrayExpression' && error.firstChild?.name === 'Equals' && !error.firstChild.nextSibling;
}

/** A range that underlines at least one character that isn't a space, inside the code. */
function visible(doc: string, span: Span): Span {
  const { from } = span;
  let { to } = span;
  while (to > from + 1 && /\s/.test(doc[to - 1])) to--;
  if (to > from) return { from, to };
  if (from < doc.length && doc[from] !== '\n') return { from, to: from + 1 };
  let at = Math.min(from, doc.length);
  while (at > 0 && /\s/.test(doc[at - 1])) at--;
  return at > 0 ? { from: at - 1, to: at } : { from: 0, to: Math.min(1, doc.length) };
}

function unclosed(o: Token): Omit<SyntaxProblem, 'line'> {
  return { from: o.from, to: o.to, message: `This ${shown(o.name)} is never closed. Add a ${shown(OPENERS[o.name])} to match it.` };
}

/** The quote a string token lacks at its end, if it lacks one, and where its opening quote ends. */
export function missingQuote(text: string, name: string): { quote: string; at: number } | null {
  const m = name === 'TemplateString' ? /^()(`)/.exec(text) : /^([A-Za-z]*)('''|"""|'|")/.exec(text);
  if (!m) return null;
  const [open, , quote] = m;
  const body = text.slice(open.length);
  const closed = body.length >= quote.length && body.endsWith(quote) && !escaped(text, text.length - quote.length);
  return closed ? null : { quote, at: open.length };
}

/** Whether the character at `at` is escaped by an odd run of backslashes before it. */
function escaped(text: string, at: number): boolean {
  let n = 0;
  for (let i = at - 1; i >= 0 && text[i] === '\\'; i--) n++;
  return n % 2 === 1;
}

/** What went wrong at a parse error, in plain words. */
function describe(e: Span, tree: Tree, doc: string, lines: number[], comments: Span[], language: CheckedLanguage): Omit<SyntaxProblem, 'line'> {
  const name = NAME[language];
  const line = lineAt(lines, e.from);
  const start = lines[line - 1];
  const end = lineEnd(doc, start);
  const text = doc.slice(start, end);
  const indent = text.length - text.trimStart().length;
  const code = codeOf(doc, start, end, comments);

  if (language === 'python') {
    const elseIf = /^\s*(else\s+if)\b/.exec(text);
    if (elseIf) return { from: start + indent, to: start + indent + elseIf[1].length, message: 'Python writes “elif”, not “else if”.' };
    // A block-opening line without its colon (the parser stops at the line's end).
    const block = BLOCK_START.exec(text);
    if (block && !code.trimEnd().endsWith(':')) {
      const last = lastWord(doc, start + indent, start + code.trimEnd().length);
      return { ...last, message: `A line that starts with “${block[1]}” must end with a colon (:).` };
    }
    // Errors at the start of a line are about its indent.
    if (e.from <= start + indent && text.trim()) {
      const prev = previousCodeLine(doc, lines, line, comments);
      const first = firstWord(doc, start + indent, end);
      if (prev && prev.code.trimEnd().endsWith(':') && indentOf(text) <= indentOf(prev.text)) {
        return { ...first, message: 'The line after a colon (:) must be indented.' };
      }
      if (prev && indentOf(text) > indentOf(prev.text)) {
        return { ...first, message: 'This line is indented more than the line above it, which doesn’t end with a colon (:) to start a block.' };
      }
    }
  }

  const unexpected = e.to > e.from ? firstWord(doc, e.from + leadingSpace(doc, e.from, e.to), e.to) : null;
  if (unexpected && unexpected.to > unexpected.from) {
    return { ...unexpected, message: `${name} didn’t expect “${clip(doc.slice(unexpected.from, unexpected.to))}” here.` };
  }

  // Nothing there: say what it came after, or what came where something was missing.
  const before = tokenBefore(tree, doc, e.from, start);
  const after = tokenAfter(tree, doc, e.from, end);
  const valueBefore = before && /^(?:[\w$]+|["'`)\]}].*|.*["'`])$/s.test(doc.slice(before.from, before.to)) && !isKeyword(tree, before);
  if (after && (!before || valueBefore)) {
    return { ...after, message: `${name} didn’t expect “${clip(doc.slice(after.from, after.to))}” here.` };
  }
  // Nothing after it on its line (often the end of the code, mid-typing): name the last thing written, past blank lines.
  const last = before ?? tokenBefore(tree, doc, e.from, 0);
  if (last) {
    const text = doc.slice(last.from, last.to);
    const lineStart = lines[lineAt(lines, last.from) - 1];
    if (language === 'python' && text === ':' && codeOf(doc, lineStart, lineEnd(doc, lineStart), comments).trimEnd().endsWith(':')) {
      return { ...last, message: 'Python needs an indented line after this colon (:).' };
    }
    return { ...last, message: `Something is missing after “${clip(text)}”.` };
  }
  return { from: e.from, to: Math.min(e.from + 1, doc.length), message: `${name} can’t read the code here.` };
}

/**
 * Python's own indentation rule the grammar doesn't check: a line that steps
 * back out of a block must line up with one of the blocks it leaves.
 */
function pythonIndents(doc: string, lines: number[], pairs: Span[], strings: Span[], comments: Span[]): Omit<SyntaxProblem, 'line'>[] {
  const found: Omit<SyntaxProblem, 'line'>[] = [];
  const stack = [0];
  let continued = false;
  for (const start of lines) {
    const end = lineEnd(doc, start);
    const text = doc.slice(start, end);
    const code = codeOf(doc, start, end, comments);
    const inside = continued || pairs.some((p) => p.from < start && start < p.to) || strings.some((s) => s.from < start && start < s.to);
    continued = code.trimEnd().endsWith('\\');
    if (inside || !code.trim()) continue;
    const width = indentOf(text);
    if (width > stack[stack.length - 1]) {
      stack.push(width);
      continue;
    }
    while (width < stack[stack.length - 1]) stack.pop();
    if (width !== stack[stack.length - 1]) {
      const indent = text.length - text.trimStart().length;
      found.push({ ...firstWord(doc, start + indent, end), message: 'This line’s indent doesn’t line up with any block above it.' });
      stack.push(width);
    }
  }
  return found;
}

function lineStarts(doc: string): number[] {
  const starts = [0];
  for (let i = 0; i < doc.length; i++) if (doc[i] === '\n') starts.push(i + 1);
  return starts;
}

/** 1-based line holding `pos`. */
function lineAt(starts: number[], pos: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function lineEnd(doc: string, start: number): number {
  const end = doc.indexOf('\n', start);
  return end < 0 ? doc.length : end;
}

/** The line without its comment. */
function codeOf(doc: string, start: number, end: number, comments: Span[]): string {
  const comment = comments.find((c) => c.from >= start && c.from < end);
  return doc.slice(start, comment ? comment.from : end);
}

/** Indent width, with tabs to the next multiple of 8 (as Python counts them). */
function indentOf(text: string): number {
  let width = 0;
  for (const ch of text) {
    if (ch === ' ') width++;
    else if (ch === '\t') width = width + 8 - (width % 8);
    else break;
  }
  return width;
}

function previousCodeLine(doc: string, lines: number[], line: number, comments: Span[]) {
  for (let l = line - 1; l >= 1; l--) {
    const start = lines[l - 1];
    const end = lineEnd(doc, start);
    const code = codeOf(doc, start, end, comments);
    if (code.trim()) return { text: doc.slice(start, end), code };
  }
  return null;
}

const WORD = /[\w$]/;

/** The word or symbol starting at `from` (not past `end`). */
function firstWord(doc: string, from: number, end: number): Span {
  let to = from;
  if (WORD.test(doc[from] ?? '')) while (to < end && WORD.test(doc[to])) to++;
  else to = Math.min(from + 1, end);
  return { from, to: Math.max(to, Math.min(from + 1, doc.length)) };
}

/** The word or symbol ending at `to` (not before `start`). */
function lastWord(doc: string, start: number, to: number): Span {
  let from = to;
  if (WORD.test(doc[to - 1] ?? '')) while (from > start && WORD.test(doc[from - 1])) from--;
  else from = Math.max(to - 1, start);
  return { from, to: Math.max(to, from + 1) };
}

function leadingSpace(doc: string, from: number, to: number): number {
  let n = 0;
  while (from + n < to && /\s/.test(doc[from + n])) n++;
  return n;
}

/** The leaf token that ends at or before `pos`, on the same line. */
function tokenBefore(tree: Tree, doc: string, pos: number, lineStart: number): Span | null {
  let at = pos;
  while (at > lineStart && /\s/.test(doc[at - 1])) at--;
  if (at <= lineStart) return null;
  const node = leafAt(tree, at, -1);
  // Error recovery can stretch a token over the spaces after it.
  return node && node.to <= pos ? { from: node.from, to: Math.min(node.to, at) } : { from: at - 1, to: at };
}

/** The leaf token that starts at or after `pos`, on the same line. */
function tokenAfter(tree: Tree, doc: string, pos: number, lineEnd: number): Span | null {
  let at = pos;
  while (at < lineEnd && /\s/.test(doc[at])) at++;
  if (at >= lineEnd) return null;
  const node = leafAt(tree, at, 1);
  return node && node.from >= pos ? { from: node.from, to: Math.min(node.to, lineEnd) } : firstWord(doc, at, lineEnd);
}

function leafAt(tree: Tree, pos: number, side: -1 | 1): (Span & { name: string }) | null {
  let node = tree.resolveInner(pos, side);
  while (node.firstChild) {
    const child = side < 0 ? node.childBefore(pos) : node.childAfter(pos);
    if (!child) break;
    node = child;
  }
  if (node.type.isError || node.to === node.from) return null;
  return { from: node.from, to: node.to, name: node.name };
}

/** Keyword tokens are named after themselves (if, return, else). */
function isKeyword(tree: Tree, span: Span): boolean {
  const node = leafAt(tree, span.to, -1);
  return !!node && /^[a-z]+$/.test(node.name) && node.name.length > 1;
}

function clip(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > 16 ? `${one.slice(0, 15)}…` : one;
}

function findLastIndex<T>(items: T[], test: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) if (test(items[i])) return i;
  return -1;
}
