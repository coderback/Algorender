// Programs in the JavaScript/TypeScript runtime (see the top of protocol.ts):
// standard input and a raw stdout, exit codes, and the learner's other files.
//
// Browsers have no stdin, so a program gets the idioms learners meet in Node:
//   input(prompt)                    a line, or EOFError at the end, as Python's
//   fs.readFileSync(0, 'utf8')       all of stdin (also '/dev/stdin')
//   readline.createInterface(…)      'line' and 'close' events, question()
//   process.stdout.write, process.exit(code), process.exitCode, process.argv
// The runtime is synchronous, so readline's events fire once the top level
// has finished, as Node's would, and `for await` over an interface is refused
// with a message (an async run can't be followed).
//
// Other files are CommonJS modules: require('./helpers') finds helpers.js or
// helpers.ts beside the file asking (one folder deep), runs it once with its
// own module and exports, and caches it for the run; a .json file is parsed,
// and fs.readFileSync reads any file. Modules run as written (TypeScript
// stripped, imports turned into requires): only the main file is
// instrumented. Each carries a sourceURL, so an error's stack names its file.

import { EOF_MESSAGE, FILE_PATH, MAX_FILE_CHARS, MAX_FILES, MAX_OUTPUT, OUTPUT_CUT, type RunError, type RunRequest } from '../protocol';
import { LearnerSyntaxError, prepare, type SourceLanguage } from './instrument';
import { ProgramSignal } from './signals';

/** One output stream, kept to MAX_OUTPUT characters. */
class Out {
  text = '';
  private cut = false;
  write(s: string) {
    if (this.cut) return;
    if (this.text.length + s.length > MAX_OUTPUT) {
      this.text += s.slice(0, MAX_OUTPUT - this.text.length) + OUTPUT_CUT;
      this.cut = true;
    } else {
      this.text += s;
    }
  }
}

type Listener = (...args: unknown[]) => void;

/** A readline Interface: the part of Node's that a learner's program uses. */
class Interface {
  readonly listeners = new Map<string, Listener[]>();
  readonly questions: Listener[] = [];
  closed = false;
  private promptText = '> ';
  constructor(private readonly program: Program) {}

  on(event: string, listener: Listener) {
    if (typeof listener !== 'function') throw new TypeError('The "listener" argument must be a function');
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }
  once(event: string, listener: Listener) {
    const once: Listener = (...args) => {
      this.listeners.set(event, (this.listeners.get(event) ?? []).filter((l) => l !== once));
      listener(...args);
    };
    return this.on(event, once);
  }
  question(query: unknown, callback: Listener) {
    this.program.write('stdout', String(query));
    this.questions.push(callback);
  }
  setPrompt(text: unknown) {
    this.promptText = String(text);
  }
  prompt() {
    this.program.write('stdout', this.promptText);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }
  emit(event: string, ...args: unknown[]) {
    for (const l of this.listeners.get(event) ?? []) l(...args);
  }
  /** Whether it still takes lines: someone listens, or a question waits. */
  get listening() {
    return !this.closed && (this.questions.length > 0 || (this.listeners.get('line')?.length ?? 0) > 0);
  }
  [Symbol.asyncIterator](): never {
    throw new Error("`for await` over readline isn't supported here: use rl.on('line', …) instead.");
  }
}

export class Program {
  readonly stdout = new Out();
  readonly stderr = new Out();
  private readonly lines: string[];
  private next = 0;
  private readonly more: boolean;
  readonly reads: number[] = [];
  /** How much stdout to keep once the program waits for input. */
  waitingAt: number | null = null;
  exitCode: number | null = null;
  exited = false;
  private readonly interfaces: Interface[] = [];

  constructor(request: Pick<RunRequest, 'stdin' | 'moreInput'>) {
    const parts = (request.stdin ?? '').replace(/\r\n/g, '\n').split('\n');
    const last = parts.pop()!;
    this.lines = [...parts.map((p) => `${p}\n`), ...(last ? [last] : [])];
    this.more = request.moreInput === true;
  }

  write(stream: 'stdout' | 'stderr', text: string) {
    if (!this.exited) this[stream].write(text);
  }

  /** The next line, newline and all, or null at the end of input; with moreInput the end stops the run. */
  line(): string | null {
    if (this.next < this.lines.length) {
      this.reads.push(this.stdout.text.length);
      return this.lines[this.next++];
    }
    if (this.more) {
      this.waitingAt ??= this.stdout.text.length;
      throw new ProgramSignal('wait');
    }
    return null;
  }

  readonly input = (prompt?: unknown): string => {
    if (prompt !== undefined) this.write('stdout', String(prompt));
    const line = this.line();
    if (line === null) {
      const error = new Error(EOF_MESSAGE.replace(/^EOFError: /, ''));
      error.name = 'EOFError';
      throw error;
    }
    return line.endsWith('\n') ? line.slice(0, -1) : line;
  };

  /** All of stdin from here on. */
  readAll(): string {
    let text = '';
    for (let line = this.line(); line !== null; line = this.line()) text += line;
    return text;
  }

  exit(code: unknown): never {
    this.exitCode = code === undefined ? (this.process.exitCode ?? 0) : Number(code) || 0;
    this.exited = true;
    throw new ProgramSignal('exit');
  }

  readonly process = {
    argv: ['node', 'main.js'],
    env: {} as Record<string, string>,
    platform: 'browser',
    exitCode: undefined as number | undefined,
    stdin: { fd: 0 },
    stdout: { write: (s: unknown) => (this.write('stdout', String(s)), true) },
    stderr: { write: (s: unknown) => (this.write('stderr', String(s)), true) },
    exit: (code?: unknown) => this.exit(code),
  };

  readonly readline = {
    createInterface: () => {
      const rl = new Interface(this);
      this.interfaces.push(rl);
      return rl;
    },
  };

  /**
   * After the top level: hands the remaining lines to readline interfaces,
   * as Node's event loop would, then closes them at the end of input.
   */
  drain() {
    for (;;) {
      const rl = this.interfaces.find((i) => i.listening);
      if (!rl) break;
      const line = this.line();
      if (line === null) break;
      const text = line.endsWith('\n') ? line.slice(0, -1) : line;
      const question = rl.questions.shift();
      if (question) question(text);
      else rl.emit('line', text);
    }
    for (const rl of this.interfaces) rl.close();
  }

  /** The result's program fields once the run has ended with `error`. */
  fields(error: RunError | null) {
    const waiting = this.waitingAt !== null;
    const exitCode = waiting ? null : error ? (error.kind === 'limit' || error.kind === 'timeout' ? null : 1) : (this.exitCode ?? this.process.exitCode ?? 0);
    return {
      stdout: waiting ? this.stdout.text.slice(0, this.waitingAt!) : this.stdout.text,
      stderr: this.stderr.text,
      exitCode,
      reads: this.reads,
      waiting,
    };
  }
}

/** Why a request's other files can't be used, or null. */
export function filesProblem(files: Record<string, string> | undefined): RunError | null {
  if (!files) return null;
  const paths = Object.keys(files);
  if (paths.length > MAX_FILES) return { kind: 'limit', message: `A run takes at most ${MAX_FILES} other files.`, line: null };
  if (Object.values(files).reduce((n, text) => n + text.length, 0) > MAX_FILE_CHARS) {
    return { kind: 'limit', message: `The other files hold more than ${MAX_FILE_CHARS.toLocaleString('en')} characters in all.`, line: null };
  }
  const bad = paths.find((p) => !FILE_PATH.test(p));
  return bad === undefined ? null : { kind: 'runtime', message: `“${bad}” isn’t a file name the runner takes: a name with an extension, in at most one folder.`, line: null };
}

/** A syntax error in one of the other files. */
export class FileSyntaxError extends Error {
  constructor(
    message: string,
    readonly file: string,
    readonly line: number | null,
  ) {
    super(message);
  }
}

/** What every module gets besides require, module and exports. */
export type ModuleGlobals = Record<string, unknown>;

const MODULE_PARAMS = ['exports', 'require', 'module', '__filename', '__dirname'];

/** Joins a relative path onto a folder ('' is the top), or null when it climbs out. */
function join(folder: string, spec: string): string | null {
  const parts = folder ? folder.split('/') : [];
  for (const part of spec.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

const folderOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/**
 * require() for a run: Node's built-ins the runtime provides, and the
 * learner's files, each run once. `from` is the requiring file ('' for main).
 */
export class Modules {
  private readonly cache = new Map<string, { exports: unknown }>();
  /** Files written while the program ran, over the request's own. */
  private readonly written = new Map<string, string>();

  constructor(
    private readonly files: Record<string, string>,
    private readonly globals: ModuleGlobals,
    private readonly builtins: Record<string, unknown>,
  ) {}

  /** The global names a module's code sees, in order. */
  private get names() {
    return Object.keys(this.globals);
  }

  read(path: string): string | undefined {
    return this.written.get(path) ?? (Object.hasOwn(this.files, path) ? this.files[path] : undefined);
  }

  write(path: string, text: string) {
    this.written.set(path, text);
  }

  requireFrom = (from: string) => (spec: unknown): unknown => {
    if (typeof spec !== 'string') throw new TypeError('The "id" argument must be of type string');
    const name = spec.replace(/^node:/, '');
    if (Object.hasOwn(this.builtins, name)) return this.builtins[name];
    const path = spec.startsWith('./') || spec.startsWith('../') ? this.resolve(join(folderOf(from), spec)) : null;
    if (path === null) {
      const error = new Error(`Cannot find module '${spec}'`);
      (error as Error & { code: string }).code = 'MODULE_NOT_FOUND';
      throw error;
    }
    const cached = this.cache.get(path);
    if (cached) return cached.exports;
    const text = this.read(path)!;
    if (path.endsWith('.json')) {
      const json = { exports: JSON.parse(text) as unknown };
      this.cache.set(path, json);
      return json.exports;
    }
    const loaded = { exports: {} as unknown };
    this.cache.set(path, loaded); // before running, so a cycle gets the exports so far, as in Node
    this.load(path, text, loaded);
    return loaded.exports;
  };

  private resolve(path: string | null): string | null {
    if (path === null) return null;
    for (const candidate of [path, `${path}.js`, `${path}.ts`, `${path}.json`, `${path}/index.js`, `${path}/index.ts`]) {
      if (this.read(candidate) !== undefined && /\.(js|ts|json)$/.test(candidate)) return candidate;
    }
    return null;
  }

  private load(path: string, text: string, module: { exports: unknown }) {
    const language: SourceLanguage = path.endsWith('.ts') ? 'typescript' : 'javascript';
    let code: string;
    try {
      code = prepare(text, language, { modules: true });
    } catch (e) {
      if (e instanceof LearnerSyntaxError) throw new FileSyntaxError(e.message, path, e.line);
      throw e;
    }
    const fn = new Function(...MODULE_PARAMS, ...this.names, `${code}\n//# sourceURL=${path}`) as (...args: unknown[]) => void;
    fn(module.exports, this.requireFrom(path), module, `/${path}`, `/${folderOf(path)}`, ...Object.values(this.globals));
  }
}

/** fs, as far as a program needs it: stdin, the learner's files, and writes kept for the run. */
export function fsFor(program: Program | null, modules: Modules) {
  const missing = (path: unknown) => {
    const error = new Error(`ENOENT: no such file or directory, open '${String(path)}'`);
    (error as Error & { code: string }).code = 'ENOENT';
    return error;
  };
  const named = (path: unknown) => String(path).replace(/^\.\//, '').replace(/^\//, '');
  return {
    readFileSync(path: unknown) {
      if (path === 0 || path === '/dev/stdin') {
        if (!program) throw new Error('There is no standard input in this run: your function gets its values as arguments.');
        return program.readAll();
      }
      const text = modules.read(named(path));
      if (text === undefined) throw missing(path);
      return text;
    },
    existsSync: (path: unknown) => modules.read(named(path)) !== undefined,
    writeFileSync(path: unknown, data: unknown) {
      modules.write(named(path), String(data));
    },
    appendFileSync(path: unknown, data: unknown) {
      modules.write(named(path), (modules.read(named(path)) ?? '') + String(data));
    },
  };
}

/**
 * Where an error in one of the other files happened, from its stack: the
 * innermost frame, if it is in a module (each module names itself with a
 * sourceURL), or null when the main file comes first.
 */
export function moduleFrame(e: unknown, files: Record<string, string>): { file: string; line: number } | null {
  const offset = (lineOffset ??= probeOffset());
  for (const frame of stackOf(e).split('\n')) {
    if (/<anonymous>|> Function/.test(frame)) return null; // the main file
    const match = FRAME.exec(frame);
    if (match && Object.hasOwn(files, match[1])) return { file: match[1], line: Math.max(1, Number(match[2]) - offset) };
  }
  return null;
}

/** A stack frame's file and line: "at f (helpers.js:4:9)" (V8) or "f@helpers.js:4:9" (Firefox). */
const FRAME = /([\w./-]+\.(?:js|ts)):(\d+):\d+\)?\s*$/;

const stackOf = (e: unknown) => (typeof e === 'object' && e !== null && 'stack' in e ? String(e.stack) : '');

/** How many lines a module's Function adds before its code (V8 adds two), found once by throwing from one. */
let lineOffset: number | undefined;

function probeOffset(): number {
  try {
    (new Function(...MODULE_PARAMS, 'throw new Error("probe");\n//# sourceURL=probe.js') as () => void)();
  } catch (e) {
    for (const frame of stackOf(e).split('\n')) {
      const match = FRAME.exec(frame);
      if (match?.[1] === 'probe.js') return Number(match[2]) - 1;
    }
  }
  return 0;
}

/** Mulberry32: Math.random for a seeded run, so a replay makes the same choices. */
export function seededMath(seed: number): Math {
  let a = seed >>> 0;
  const math = Object.create(Math) as Math;
  Object.defineProperty(math, 'random', {
    value: () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  });
  return math;
}
