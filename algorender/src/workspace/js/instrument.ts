// Rewrites a learner's JavaScript or TypeScript so that running it reports
// what it does to the runtime (runtime.ts) through a `__viz` helper object.
//
// TypeScript is stripped first with sucrase, which keeps every line where it
// was, so line numbers in events are the learner's own. The code is parsed with
// acorn, rewritten, and printed back with astring. The rewrites:
// - Before every statement: __viz.line(n, capture). It counts a step (so an
//   endless loop stops with a message) and remembers the line and a lazy reader
//   of the variables in scope, used only when an event happens. Loop bodies
//   always get one, so `while (cond) {}` still counts steps.
// - A comparison `a < b` becomes __viz.cmp('<', a, b, line, capture), and an
//   operand `obj[i]` becomes __viz.cell(obj, i, line), so a comparison knows
//   which cells it read (obj and i are still evaluated once, in order).
// - Function bodies save the caller's line on entry and restore it on return
//   (__viz.enter/leave), so `arr[i] = helper()` is reported on the caller's
//   line, not the helper's last one. A throw skips the restore on purpose: the
//   error belongs to the innermost line.
// - Catch clauses rethrow the run's stop signal first, so the learner's
//   try/catch can't swallow a limit.
// The code runs in strict mode (parsed as such, so strict-only errors are
// syntax errors): sloppy mode would let `i = 0` create a global in the worker
// that outlives the run.

import { parse } from 'acorn';
import { generate } from 'astring';
import type * as ES from 'estree';
import { transform } from 'sucrase';

export type SourceLanguage = 'javascript' | 'typescript';

/** The learner's code doesn't parse; `line` is 1-based. */
export class LearnerSyntaxError extends Error {
  readonly line: number | null;
  constructor(message: string, line: number | null) {
    super(message);
    this.name = 'LearnerSyntaxError';
    this.line = line;
  }
}

/** Names the rewritten code uses; the learner's code may not declare them. */
export const RESERVED_PREFIX = '__viz';
const VIZ = '__viz';
const FRAME = '__vizD';
const CAUGHT = '__vizE';
const VARS = '__vizV';

// Same line as the learner's first line, so line numbers don't move.
const STRICT = '"use strict"; ';

const COMPARISONS = new Set(['<', '<=', '>', '>=', '==', '===', '!=', '!==']);

export function instrument(code: string, language: SourceLanguage): { code: string } {
  const source = language === 'typescript' ? stripTypes(code) : code;
  let program: ES.Program;
  try {
    program = parse(STRICT + source, { ecmaVersion: 'latest', sourceType: 'script', locations: true }) as unknown as ES.Program;
  } catch (e) {
    throw syntaxError(e);
  }
  new Instrumenter().program(program);
  return { code: generate(program) };
}

function stripTypes(code: string): string {
  try {
    return transform(code, { transforms: ['typescript'], disableESTransforms: true }).code;
  } catch (e) {
    throw syntaxError(e);
  }
}

/** acorn and sucrase both throw a SyntaxError with `loc.line` and a "(line:col)" suffix. */
function syntaxError(e: unknown): Error {
  if (!(e instanceof SyntaxError)) return e instanceof Error ? e : new Error(String(e));
  const loc = (e as SyntaxError & { loc?: { line?: number } }).loc;
  const message = e.message.replace(/\s*\(\d+:\d+\)$/, '');
  return new LearnerSyntaxError(`SyntaxError: ${message}`, typeof loc?.line === 'number' ? loc.line : null);
}

// ---------------------------------------------------------------------------
// Building nodes
// ---------------------------------------------------------------------------

const id = (name: string): ES.Identifier => ({ type: 'Identifier', name });
const lit = (value: string | number | null): ES.Literal => ({ type: 'Literal', value });
const exprStmt = (expression: ES.Expression): ES.ExpressionStatement => ({ type: 'ExpressionStatement', expression });
const block = (body: ES.Statement[]): ES.BlockStatement => ({ type: 'BlockStatement', body });
const vizCall = (method: string, args: ES.Expression[]): ES.CallExpression => ({
  type: 'CallExpression',
  callee: { type: 'MemberExpression', object: id(VIZ), property: id(method), computed: false, optional: false },
  arguments: args,
  optional: false,
});
const declare = (kind: 'const' | 'let', target: ES.Pattern, init: ES.Expression): ES.VariableDeclaration => ({
  type: 'VariableDeclaration',
  kind,
  declarations: [{ type: 'VariableDeclarator', id: target, init }],
});

const lineOf = (node: ES.Node): number => node.loc!.start.line;

const isDirective = (s: ES.Node): boolean =>
  s.type === 'ExpressionStatement' && typeof (s as ES.Directive).directive === 'string';

type AnyFunction = ES.FunctionDeclaration | ES.FunctionExpression | ES.ArrowFunctionExpression;

// ---------------------------------------------------------------------------
// Which names are bound where
// ---------------------------------------------------------------------------

function boundNames(p: ES.Pattern | null | undefined, out: string[] = []): string[] {
  if (!p) return out;
  switch (p.type) {
    case 'Identifier':
      out.push(p.name);
      break;
    case 'ObjectPattern':
      for (const prop of p.properties) boundNames(prop.type === 'RestElement' ? prop.argument : prop.value, out);
      break;
    case 'ArrayPattern':
      for (const el of p.elements) boundNames(el, out);
      break;
    case 'RestElement':
      boundNames(p.argument, out);
      break;
    case 'AssignmentPattern':
      boundNames(p.left, out);
      break;
    default: // MemberExpression: an assignment target, binds nothing
      break;
  }
  return out;
}

const declarationNames = (d: ES.VariableDeclaration, out: string[] = []) => {
  for (const decl of d.declarations) boundNames(decl.id, out);
  return out;
};

/** let/const/class/function declared directly in a block (strict mode makes block functions lexical). */
function lexicalNames(body: ES.Node[]): string[] {
  const out: string[] = [];
  for (const s of body) {
    if (s.type === 'VariableDeclaration' && s.kind !== 'var') declarationNames(s, out);
    else if ((s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') && s.id) out.push(s.id.name);
  }
  return out;
}

/** Names a function body (or the program) declares at its own level, plus every `var` hoisted from nested blocks, in source order. */
function functionNames(body: ES.Node[]): string[] {
  const out: string[] = [];
  const visit = (s: ES.Node | null | undefined, top: boolean) => {
    if (!s) return;
    switch (s.type) {
      case 'VariableDeclaration':
        if (top || s.kind === 'var') declarationNames(s, out);
        break;
      case 'FunctionDeclaration':
      case 'ClassDeclaration':
        if (top && s.id) out.push(s.id.name);
        break;
      case 'BlockStatement':
        s.body.forEach((x) => visit(x, false));
        break;
      case 'IfStatement':
        visit(s.consequent, false);
        visit(s.alternate, false);
        break;
      case 'ForStatement':
        visit(s.init?.type === 'VariableDeclaration' ? s.init : null, false);
        visit(s.body, false);
        break;
      case 'ForInStatement':
      case 'ForOfStatement':
        visit(s.left.type === 'VariableDeclaration' ? s.left : null, false);
        visit(s.body, false);
        break;
      case 'WhileStatement':
      case 'DoWhileStatement':
      case 'LabeledStatement':
        visit(s.body, false);
        break;
      case 'TryStatement':
        visit(s.block, false);
        visit(s.handler?.body, false);
        visit(s.finalizer, false);
        break;
      case 'SwitchStatement':
        for (const c of s.cases) c.consequent.forEach((x) => visit(x, false));
        break;
      default:
        break;
    }
  };
  body.forEach((s) => visit(s, true));
  return out;
}

// ---------------------------------------------------------------------------
// The rewrite
// ---------------------------------------------------------------------------

type Scope = { names: string[]; parent: Scope | null; fn: boolean; visible?: string[] };

/** Node keys that never hold child nodes (others are checked with isNode). */
const SKIP_KEYS = new Set(['type', 'loc', 'start', 'end', 'range']);

const isNode = (x: unknown): x is ES.Node =>
  typeof x === 'object' && x !== null && typeof (x as { type?: unknown }).type === 'string';

class Instrumenter {
  private scope: Scope = { names: [], parent: null, fn: true };
  /** Whether `return` in the current function restores the caller's line. */
  private tracked = false;
  private readonly markers = new WeakSet<ES.Node>();
  private readonly captures = new Map<string, ES.Expression>();

  program(p: ES.Program) {
    this.scope = { names: functionNames(p.body), parent: null, fn: true };
    p.body = this.statements(p.body as ES.Statement[]);
  }

  // Scopes ------------------------------------------------------------------

  private within<T>(names: string[] | null, fn: boolean, run: () => T): T {
    if (!names) return run();
    const saved = this.scope;
    this.scope = { names, parent: saved, fn };
    try {
      return run();
    } finally {
      this.scope = saved;
    }
  }

  /** The current function's names in scope here, outermost first; `_names` are never shown. */
  private visible(): string[] {
    const scope = this.scope;
    if (scope.visible) return scope.visible;
    const chain: Scope[] = [];
    for (let s: Scope | null = scope; s; s = s.parent) {
      chain.push(s);
      if (s.fn) break;
    }
    const seen = new Set<string>();
    const out: string[] = [];
    for (let k = chain.length - 1; k >= 0; k--) {
      for (const name of chain[k].names) {
        if (seen.has(name) || name.startsWith('_')) continue;
        seen.add(name);
        out.push(name);
      }
    }
    scope.visible = out;
    return out;
  }

  /**
   * `() => { const __vizV = {}; try { __vizV.x = x } catch {} …; return __vizV }`:
   * reads each visible name, skipping ones still in their temporal dead zone.
   */
  private capture(): ES.Expression {
    const names = this.visible();
    if (names.length === 0) return lit(null);
    const key = names.join(',');
    const cached = this.captures.get(key);
    if (cached) return cached;
    const body: ES.Statement[] = [declare('const', id(VARS), { type: 'ObjectExpression', properties: [] })];
    for (const name of names) {
      const assign: ES.AssignmentExpression = {
        type: 'AssignmentExpression',
        operator: '=',
        left: { type: 'MemberExpression', object: id(VARS), property: id(name), computed: false, optional: false },
        right: id(name),
      };
      body.push({
        type: 'TryStatement',
        block: block([exprStmt(assign)]),
        handler: { type: 'CatchClause', param: null, body: block([]) },
        finalizer: null,
      });
    }
    body.push({ type: 'ReturnStatement', argument: id(VARS) });
    const fn: ES.ArrowFunctionExpression = { type: 'ArrowFunctionExpression', params: [], body: block(body), expression: false, generator: false, async: false };
    this.captures.set(key, fn);
    return fn;
  }

  private marker(line: number): ES.Statement {
    const m = exprStmt(vizCall('line', [lit(line), this.capture()]));
    this.markers.add(m);
    return m;
  }

  // Statements --------------------------------------------------------------

  private statements(list: ES.Statement[]): ES.Statement[] {
    const out: ES.Statement[] = [];
    for (const s of list) {
      if (isDirective(s)) out.push(s);
      else if (s.type === 'EmptyStatement') continue;
      // Hoisted: nothing runs where it is written.
      else if (s.type === 'FunctionDeclaration') out.push(this.statement(s));
      else out.push(this.marker(lineOf(s)), this.statement(s));
    }
    return out;
  }

  private statement(s: ES.Statement): ES.Statement {
    switch (s.type) {
      case 'BlockStatement':
        return this.block(s);
      case 'ExpressionStatement':
        s.expression = this.node(s.expression);
        return s;
      case 'VariableDeclaration':
        this.declaration(s);
        return s;
      case 'FunctionDeclaration':
        this.func(s);
        return s;
      case 'ClassDeclaration':
        this.cls(s);
        return s;
      case 'ReturnStatement': {
        const value = s.argument ? this.node(s.argument) : null;
        s.argument = this.tracked ? vizCall('leave', value ? [id(FRAME), value] : [id(FRAME)]) : value;
        return s;
      }
      case 'IfStatement':
        s.test = this.node(s.test);
        s.consequent = this.branch(s.consequent);
        if (s.alternate) s.alternate = this.branch(s.alternate);
        return s;
      case 'ForStatement': {
        const init = s.init;
        const names = init?.type === 'VariableDeclaration' && init.kind !== 'var' ? declarationNames(init) : null;
        return this.within(names, false, () => {
          if (init) {
            if (init.type === 'VariableDeclaration') this.declaration(init);
            else s.init = this.node(init);
          }
          if (s.test) s.test = this.node(s.test);
          if (s.update) s.update = this.node(s.update);
          s.body = this.loopBody(s.body, lineOf(s));
          return s;
        });
      }
      case 'ForInStatement':
      case 'ForOfStatement': {
        const left = s.left;
        const names = left.type === 'VariableDeclaration' && left.kind !== 'var' ? declarationNames(left) : null;
        return this.within(names, false, () => {
          if (left.type === 'VariableDeclaration') this.declaration(left);
          else s.left = this.node(left);
          s.right = this.node(s.right);
          s.body = this.loopBody(s.body, lineOf(s));
          return s;
        });
      }
      case 'WhileStatement':
        s.test = this.node(s.test);
        s.body = this.loopBody(s.body, lineOf(s));
        return s;
      case 'DoWhileStatement':
        s.body = this.loopBody(s.body, lineOf(s));
        s.test = this.node(s.test);
        return s;
      case 'TryStatement':
        s.block = this.block(s.block);
        if (s.handler) this.catchClause(s.handler);
        if (s.finalizer) s.finalizer = this.block(s.finalizer);
        return s;
      case 'SwitchStatement': {
        s.discriminant = this.node(s.discriminant);
        const names = lexicalNames(s.cases.flatMap((c) => c.consequent));
        return this.within(names, false, () => {
          for (const c of s.cases) {
            if (c.test) c.test = this.node(c.test);
            c.consequent = this.statements(c.consequent);
          }
          return s;
        });
      }
      case 'LabeledStatement':
        // The label must stay on the loop itself for `continue label`.
        s.body = this.statement(s.body);
        return s;
      case 'ThrowStatement':
        s.argument = this.node(s.argument);
        return s;
      case 'WithStatement': // rejected in strict mode; kept for completeness
        s.object = this.node(s.object);
        s.body = this.branch(s.body);
        return s;
      default: // break, continue, debugger, empty
        return s;
    }
  }

  private block(b: ES.BlockStatement): ES.BlockStatement {
    return this.within(lexicalNames(b.body), false, () => {
      b.body = this.statements(b.body);
      return b;
    });
  }

  /** An if/else branch: a lone statement gets a block so it can have its marker. */
  private branch(s: ES.Statement): ES.Statement {
    if (s.type === 'BlockStatement') return this.block(s);
    if (s.type === 'EmptyStatement') return s;
    return block([this.marker(lineOf(s)), this.statement(s)]);
  }

  /** A loop body always holds a marker, so every iteration counts a step. */
  private loopBody(s: ES.Statement, loopLine: number): ES.BlockStatement {
    let body: ES.BlockStatement;
    if (s.type === 'BlockStatement') body = this.block(s);
    else if (s.type === 'EmptyStatement') body = block([]);
    else body = block([this.marker(lineOf(s)), this.statement(s)]);
    if (!body.body.some((x) => this.markers.has(x))) body.body.unshift(this.marker(loopLine));
    return body;
  }

  private declaration(d: ES.VariableDeclaration) {
    for (const decl of d.declarations) {
      decl.id = this.node(decl.id);
      if (decl.init) decl.init = this.node(decl.init);
    }
  }

  /** catch (e) { … } → catch (e) { __viz.rethrow(e); … }, with a name for `catch {}` and destructured params. */
  private catchClause(h: ES.CatchClause) {
    const param = h.param;
    if (!param || param.type === 'Identifier') {
      if (param) this.node(param);
      this.within(param ? [param.name] : [], false, () => {
        h.body = this.block(h.body);
      });
      const name = param ? param.name : CAUGHT;
      h.param = id(name);
      h.body.body.unshift(exprStmt(vizCall('rethrow', [id(name)])));
      return;
    }
    // Destructuring could itself throw on the stop signal, so bind it afterwards.
    let pattern: ES.Pattern = param;
    this.within(boundNames(param), false, () => {
      pattern = this.node(param);
      h.body = this.block(h.body);
    });
    h.param = id(CAUGHT);
    h.body.body.unshift(exprStmt(vizCall('rethrow', [id(CAUGHT)])), declare('let', pattern, id(CAUGHT)));
  }

  // Functions and classes -----------------------------------------------------

  private func(f: AnyFunction) {
    if (f.type !== 'ArrowFunctionExpression' && f.id) this.node(f.id);
    const body = f.body;
    const names = boundNames({ type: 'ArrayPattern', elements: f.params });
    if (body.type === 'BlockStatement') names.push(...functionNames(body.body));
    const savedScope = this.scope;
    const savedTracked = this.tracked;
    this.scope = { names, parent: savedScope, fn: true };
    // A generator or async function suspends mid-body and resumes from
    // elsewhere, so it can't save and restore its caller's line.
    this.tracked = !f.generator && !f.async;
    try {
      f.params = f.params.map((p) => this.node(p));
      if (body.type === 'BlockStatement') {
        const statements = this.statements(body.body);
        body.body = this.tracked ? this.framed(statements) : statements;
      } else {
        // An expression body becomes `{ marker; return expr }`, so its events get its line.
        const line = lineOf(body);
        const value = this.node(body);
        const marker = this.marker(line);
        const ret: ES.ReturnStatement = { type: 'ReturnStatement', argument: this.tracked ? vizCall('leave', [id(FRAME), value]) : value };
        f.body = block(this.tracked ? [this.enterFrame(), marker, ret] : [marker, ret]);
        (f as ES.ArrowFunctionExpression).expression = false;
      }
    } finally {
      this.scope = savedScope;
      this.tracked = savedTracked;
    }
  }

  private enterFrame(): ES.Statement {
    return declare('const', id(FRAME), vizCall('enter', []));
  }

  /** Directives stay first; then save the caller's line, run, and restore it on falling off the end. */
  private framed(statements: ES.Statement[]): ES.Statement[] {
    let k = 0;
    while (k < statements.length && isDirective(statements[k])) k++;
    return [...statements.slice(0, k), this.enterFrame(), ...statements.slice(k), exprStmt(vizCall('leave', [id(FRAME)]))];
  }

  private cls(c: ES.ClassDeclaration | ES.ClassExpression) {
    if (c.id) this.node(c.id);
    if (c.superClass) c.superClass = this.node(c.superClass);
    for (const m of c.body.body) {
      if (m.type === 'MethodDefinition') {
        if (m.computed) m.key = this.node(m.key as ES.Expression);
        this.func(m.value);
      } else if (m.type === 'PropertyDefinition') {
        if (m.computed) m.key = this.node(m.key as ES.Expression);
        const value = m.value;
        if (value) m.value = this.within([], true, () => this.node(value));
      } else if (m.type === 'StaticBlock') {
        const savedTracked = this.tracked;
        this.tracked = false;
        try {
          this.within(functionNames(m.body), true, () => {
            m.body = this.statements(m.body);
          });
        } finally {
          this.tracked = savedTracked;
        }
      }
    }
  }

  // Expressions ---------------------------------------------------------------

  /** Rewrites comparisons and functions inside any expression or pattern; everything else is walked as is. */
  private node<T extends ES.Node>(n: T): T {
    switch (n.type) {
      case 'Identifier':
        if (n.name.startsWith(RESERVED_PREFIX)) {
          throw new LearnerSyntaxError(`SyntaxError: Names starting with ${RESERVED_PREFIX} are reserved for the visualiser.`, lineOf(n));
        }
        return n;
      case 'BinaryExpression':
        if (COMPARISONS.has(n.operator)) return this.compare(n) as unknown as T;
        break;
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        this.func(n);
        return n;
      case 'ClassExpression':
        this.cls(n);
        return n;
      default:
        break;
    }
    const fields = n as unknown as Record<string, unknown>;
    for (const key of Object.keys(fields)) {
      if (SKIP_KEYS.has(key)) continue;
      const v = fields[key];
      if (Array.isArray(v)) fields[key] = v.map((x) => (isNode(x) ? this.node(x) : x));
      else if (isNode(v)) fields[key] = this.node(v);
    }
    return n;
  }

  /** a OP b → __viz.cmp('OP', a', b', line, capture), with obj[i] operands as __viz.cell(obj, i, line). */
  private compare(n: ES.BinaryExpression): ES.CallExpression {
    const line = lineOf(n);
    const operand = (x: ES.Expression | ES.PrivateIdentifier): ES.Expression => {
      if (x.type === 'MemberExpression' && x.computed && x.object.type !== 'Super') {
        return vizCall('cell', [this.node(x.object as ES.Expression), this.node(x.property as ES.Expression), lit(line)]);
      }
      return this.node(x as ES.Expression);
    };
    const left = operand(n.left);
    const right = operand(n.right);
    return vizCall('cmp', [lit(n.operator), left, right, lit(line), this.capture()]);
  }
}
