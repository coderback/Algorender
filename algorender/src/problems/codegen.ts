// Each language's names and starter code, generated from a problem's
// signature, so a problem is written once and offered in every language.
// Signatures use camelCase; Python gets snake_case, as Python code would.

import type { Language } from '@/workspace/protocol';
import type { DesignSig, FunctionSig, Param, ReturnType, ValueType } from './schema';

/** twoSum → two_sum; a run of capitals is one word: isValidBST → is_valid_bst, parseHTMLTag → parse_html_tag. */
export const snake = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

/** A function, parameter or method name as the learner writes it in this language. */
export const nameIn = (name: string, language: Language) => (language === 'python' ? snake(name) : name);

/** What the learner's code defines: the function, or the class of a design problem. */
export function entryName(shape: { signature?: FunctionSig; design?: DesignSig }, language: Language): string {
  if (shape.design) return shape.design.class;
  return nameIn(shape.signature!.function, language);
}

const PYTHON: Record<ValueType, string> = {
  int: 'int',
  float: 'float',
  bool: 'bool',
  string: 'str',
  'int[]': 'list[int]',
  'float[]': 'list[float]',
  'bool[]': 'list[bool]',
  'string[]': 'list[str]',
  'int[][]': 'list[list[int]]',
  'float[][]': 'list[list[float]]',
  'string[][]': 'list[list[str]]',
  TreeNode: 'TreeNode | None',
  ListNode: 'ListNode | None',
};

const TYPESCRIPT: Record<ValueType, string> = {
  int: 'number',
  float: 'number',
  bool: 'boolean',
  string: 'string',
  'int[]': 'number[]',
  'float[]': 'number[]',
  'bool[]': 'boolean[]',
  'string[]': 'string[]',
  'int[][]': 'number[][]',
  'float[][]': 'number[][]',
  'string[][]': 'string[][]',
  TreeNode: 'TreeNode | null',
  ListNode: 'ListNode | null',
};

const pyType = (t: ReturnType) => (t === 'void' ? 'None' : PYTHON[t]);
const tsType = (t: ReturnType) => (t === 'void' ? 'void' : TYPESCRIPT[t]);

/** The node classes a signature uses, so the stub can say they are defined already. */
function nodeTypes(types: ReturnType[]): ('TreeNode' | 'ListNode')[] {
  return (['TreeNode', 'ListNode'] as const).filter((t) => types.includes(t));
}

const NODE_NOTE: Record<'TreeNode' | 'ListNode', Record<'python' | 'js', string>> = {
  TreeNode: {
    python: '# TreeNode(val, left=None, right=None) is defined for you.',
    js: '// TreeNode is defined for you: new TreeNode(val, left, right).',
  },
  ListNode: {
    python: '# ListNode(val, next=None) is defined for you.',
    js: '// ListNode is defined for you: new ListNode(val, next).',
  },
};

function typesOf(shape: { signature?: FunctionSig; design?: DesignSig }): ReturnType[] {
  if (shape.signature) return [...shape.signature.params.map((p) => p.type), shape.signature.returns];
  const d = shape.design!;
  return [...d.init.map((p) => p.type), ...d.methods.flatMap((m) => [...m.params.map((p) => p.type), m.returns])];
}

/** The starter code for a problem in one language: the signature with an empty body. */
export function stub(shape: { signature?: FunctionSig; design?: DesignSig }, language: Language): string {
  const notes = nodeTypes(typesOf(shape)).map((t) => NODE_NOTE[t][language === 'python' ? 'python' : 'js']);
  const head = notes.length > 0 ? `${notes.join('\n')}\n\n` : '';
  const body = shape.signature ? functionStub(shape.signature, language) : designStub(shape.design!, language);
  return head + body;
}

function functionStub(sig: FunctionSig, language: Language): string {
  const name = nameIn(sig.function, language);
  const inPlace = sig.inPlace && nameIn(sig.inPlace, language);
  if (language === 'python') {
    const params = sig.params.map((p) => `${snake(p.name)}: ${PYTHON[p.type]}`).join(', ');
    const note = inPlace ? `    # Change ${inPlace} in place; nothing to return.\n` : '';
    return `def ${name}(${params}) -> ${pyType(sig.returns)}:\n${note}    pass\n`;
  }
  const note = inPlace ? `  // Change ${inPlace} in place; nothing to return.\n` : '\n';
  if (language === 'typescript') {
    const params = sig.params.map((p) => `${p.name}: ${TYPESCRIPT[p.type]}`).join(', ');
    return `function ${name}(${params}): ${tsType(sig.returns)} {\n${note}}\n`;
  }
  return `${jsDoc(sig.params, sig.returns, '')}function ${name}(${sig.params.map((p) => p.name).join(', ')}) {\n${note}}\n`;
}

function designStub(d: DesignSig, language: Language): string {
  if (language === 'python') {
    const params = (ps: Param[]) => ['self', ...ps.map((p) => `${snake(p.name)}: ${PYTHON[p.type]}`)].join(', ');
    const methods = d.methods.map((m) => `    def ${snake(m.name)}(${params(m.params)}) -> ${pyType(m.returns)}:\n        pass\n`);
    return [`class ${d.class}:\n    def __init__(${params(d.init)}):\n        pass\n`, ...methods].join('\n');
  }
  const ts = language === 'typescript';
  const params = (ps: Param[]) => ps.map((p) => (ts ? `${p.name}: ${TYPESCRIPT[p.type]}` : p.name)).join(', ');
  const ctorDoc = ts ? '' : jsDoc(d.init, null, '  ');
  const methods = d.methods.map((m) => {
    const doc = ts ? '' : jsDoc(m.params, m.returns, '  ');
    return `${doc}  ${m.name}(${params(m.params)})${ts ? `: ${tsType(m.returns)}` : ''} {\n\n  }\n`;
  });
  return [`class ${d.class} {\n${ctorDoc}  constructor(${params(d.init)}) {\n\n  }\n`, ...methods].join('\n') + '}\n';
}

/** JSDoc for a JavaScript function or method: parameter and return types, as LeetCode's stubs give them. */
function jsDoc(params: Param[], returns: ReturnType | null, indent: string): string {
  // A method that takes nothing and returns nothing needs no comment.
  const lines = [...params.map((p) => `@param {${TYPESCRIPT[p.type]}} ${p.name}`), ...(returns && returns !== 'void' ? [`@return {${tsType(returns)}}`] : [])];
  if (lines.length === 0) return '';
  return `${indent}/**\n${lines.map((l) => `${indent} * ${l}\n`).join('')}${indent} */\n`;
}
