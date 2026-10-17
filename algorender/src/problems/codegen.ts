// Each language's names and starter code, generated from a problem's
// signature, so a problem is written once and offered in every language.
// Signatures use camelCase; Python gets snake_case, as Python code would, and
// Go's methods are exported (Push, GetMin), as LeetCode writes them. The
// stubs follow LeetCode's conventions in each language (class Solution in
// Java and C++, Constructor() in Go), so they look the way learners expect.

import type { Language } from '@/workspace/protocol';
import type { ProblemLanguage } from './languages';
import type { DesignSig, FunctionSig, Param, ReturnType, ValueType } from './schema';

/** twoSum → two_sum; a run of capitals is one word: isValidBST → is_valid_bst, parseHTMLTag → parse_html_tag. */
export const snake = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();

/** A function, parameter or method name as the learner writes it in this language. */
export const nameIn = (name: string, language: ProblemLanguage) => (language === 'python' ? snake(name) : name);

/** A design problem's method name in this language: Go exports them (GetMin). */
export const methodIn = (name: string, language: ProblemLanguage) => (language === 'go' ? name[0].toUpperCase() + name.slice(1) : nameIn(name, language));

/** What the learner's code defines: the function, or the class of a design problem. */
export function entryName(shape: { signature?: FunctionSig; design?: DesignSig }, language: ProblemLanguage): string {
  if (shape.design) return shape.design.class;
  return nameIn(shape.signature!.function, language);
}

const PYTHON: Record<ValueType, string> = {
  int: 'int',
  long: 'int',
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
  long: 'number',
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

/** Java's types for arguments. Lists that come back are List<…>, as LeetCode returns them (JAVA_RETURN). */
export const JAVA: Record<ValueType, string> = {
  int: 'int',
  long: 'long',
  float: 'double',
  bool: 'boolean',
  string: 'String',
  'int[]': 'int[]',
  'float[]': 'double[]',
  'bool[]': 'boolean[]',
  'string[]': 'String[]',
  'int[][]': 'int[][]',
  'float[][]': 'double[][]',
  'string[][]': 'String[][]',
  TreeNode: 'TreeNode',
  ListNode: 'ListNode',
};

const JAVA_RETURN: Partial<Record<ReturnType, string>> = {
  'string[]': 'List<String>',
  'int[][]': 'List<List<Integer>>',
  'float[][]': 'List<List<Double>>',
  'string[][]': 'List<List<String>>',
};

export const CPP: Record<ValueType, string> = {
  int: 'int',
  long: 'long long',
  float: 'double',
  bool: 'bool',
  string: 'string',
  'int[]': 'vector<int>',
  'float[]': 'vector<double>',
  'bool[]': 'vector<bool>',
  'string[]': 'vector<string>',
  'int[][]': 'vector<vector<int>>',
  'float[][]': 'vector<vector<double>>',
  'string[][]': 'vector<vector<string>>',
  TreeNode: 'TreeNode*',
  ListNode: 'ListNode*',
};

export const GO: Record<ValueType, string> = {
  int: 'int',
  long: 'int',
  float: 'float64',
  bool: 'bool',
  string: 'string',
  'int[]': '[]int',
  'float[]': '[]float64',
  'bool[]': '[]bool',
  'string[]': '[]string',
  'int[][]': '[][]int',
  'float[][]': '[][]float64',
  'string[][]': '[][]string',
  TreeNode: '*TreeNode',
  ListNode: '*ListNode',
};

const pyType = (t: ReturnType) => (t === 'void' ? 'None' : PYTHON[t]);
const tsType = (t: ReturnType) => (t === 'void' ? 'void' : TYPESCRIPT[t]);
const javaReturn = (t: ReturnType) => (t === 'void' ? 'void' : (JAVA_RETURN[t] ?? JAVA[t]));
const cppType = (t: ReturnType) => (t === 'void' ? 'void' : CPP[t]);
/** C++ takes vectors and strings by reference, as LeetCode's stubs do. */
const cppParam = (p: Param) => `${CPP[p.type]}${p.type.endsWith(']') || p.type === 'string' ? '&' : ''} ${p.name}`;
const goReturn = (t: ReturnType) => (t === 'void' ? '' : ` ${GO[t]}`);

/** The node classes a signature uses, so the stub can say they are defined already. */
function nodeTypes(types: ReturnType[]): ('TreeNode' | 'ListNode')[] {
  return (['TreeNode', 'ListNode'] as const).filter((t) => types.includes(t));
}

type NoteStyle = 'python' | 'js' | 'java' | 'cpp' | 'go';

const NODE_NOTE: Record<'TreeNode' | 'ListNode', Record<NoteStyle, string>> = {
  TreeNode: {
    python: '# TreeNode(val, left=None, right=None) is defined for you.',
    js: '// TreeNode is defined for you: new TreeNode(val, left, right).',
    java: '// TreeNode is defined for you: new TreeNode(val, left, right), with fields val, left and right.',
    cpp: '// TreeNode is defined for you: new TreeNode(val, left, right), with fields val, left and right.',
    go: '// TreeNode is defined for you: &TreeNode{Val: 1, Left: nil, Right: nil}.',
  },
  ListNode: {
    python: '# ListNode(val, next=None) is defined for you.',
    js: '// ListNode is defined for you: new ListNode(val, next).',
    java: '// ListNode is defined for you: new ListNode(val, next), with fields val and next.',
    cpp: '// ListNode is defined for you: new ListNode(val, next), with fields val and next.',
    go: '// ListNode is defined for you: &ListNode{Val: 1, Next: nil}.',
  },
};

const noteStyle = (language: ProblemLanguage): NoteStyle => (language === 'javascript' || language === 'typescript' ? 'js' : language);

function typesOf(shape: { signature?: FunctionSig; design?: DesignSig }): ReturnType[] {
  if (shape.signature) return [...shape.signature.params.map((p) => p.type), shape.signature.returns];
  const d = shape.design!;
  return [...d.init.map((p) => p.type), ...d.methods.flatMap((m) => [...m.params.map((p) => p.type), m.returns])];
}

/** The starter code for a problem in one language: the signature with an empty body. */
export function stub(shape: { signature?: FunctionSig; design?: DesignSig }, language: ProblemLanguage): string {
  const notes = nodeTypes(typesOf(shape)).map((t) => NODE_NOTE[t][noteStyle(language)]);
  const head = notes.length > 0 ? `${notes.join('\n')}\n\n` : '';
  if (language === 'java' || language === 'cpp' || language === 'go') {
    return head + (shape.signature ? COMPILED_FUNCTION[language](shape.signature) : COMPILED_DESIGN[language](shape.design!));
  }
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
  const note = inPlaceNote(sig, '  ');
  if (language === 'typescript') {
    const params = sig.params.map((p) => `${p.name}: ${TYPESCRIPT[p.type]}`).join(', ');
    return `function ${name}(${params}): ${tsType(sig.returns)} {\n${note}}\n`;
  }
  return `${jsDoc(sig.params, sig.returns, '')}function ${name}(${sig.params.map((p) => p.name).join(', ')}) {\n${note}}\n`;
}

/** The body of an empty function: a blank line, or a note that it answers in place. */
const inPlaceNote = (sig: FunctionSig, indent: string) => (sig.inPlace ? `${indent}// Change ${sig.inPlace} in place; nothing to return.\n` : '\n');

const COMPILED_FUNCTION: Record<'java' | 'cpp' | 'go', (s: FunctionSig) => string> = {
  java: (s) => {
    const params = s.params.map((p) => `${JAVA[p.type]} ${p.name}`).join(', ');
    return `class Solution {\n    public ${javaReturn(s.returns)} ${s.function}(${params}) {\n${inPlaceNote(s, '        ')}    }\n}\n`;
  },
  cpp: (s) => `class Solution {\npublic:\n    ${cppType(s.returns)} ${s.function}(${s.params.map(cppParam).join(', ')}) {\n${inPlaceNote(s, '        ')}    }\n};\n`,
  go: (s) => `func ${s.function}(${s.params.map((p) => `${p.name} ${GO[p.type]}`).join(', ')})${goReturn(s.returns)} {\n${inPlaceNote(s, '\t')}}\n`,
};

const COMPILED_DESIGN: Record<'java' | 'cpp' | 'go', (d: DesignSig) => string> = {
  java: (d) => {
    const params = (ps: Param[]) => ps.map((p) => `${JAVA[p.type]} ${p.name}`).join(', ');
    const methods = d.methods.map((m) => `    public ${javaReturn(m.returns)} ${m.name}(${params(m.params)}) {\n\n    }\n`);
    return [`class ${d.class} {\n    public ${d.class}(${params(d.init)}) {\n\n    }\n`, ...methods].join('\n') + '}\n';
  },
  cpp: (d) => {
    const params = (ps: Param[]) => ps.map(cppParam).join(', ');
    const methods = d.methods.map((m) => `    ${cppType(m.returns)} ${m.name}(${params(m.params)}) {\n\n    }\n`);
    return [`class ${d.class} {\npublic:\n    ${d.class}(${params(d.init)}) {\n\n    }\n`, ...methods].join('\n') + '};\n';
  },
  go: (d) => {
    const params = (ps: Param[]) => ps.map((p) => `${p.name} ${GO[p.type]}`).join(', ');
    const methods = d.methods.map((m) => `func (this *${d.class}) ${methodIn(m.name, 'go')}(${params(m.params)})${goReturn(m.returns)} {\n\n}\n`);
    return [`type ${d.class} struct {\n\n}\n`, `func Constructor(${params(d.init)}) ${d.class} {\n\n}\n`, ...methods].join('\n');
  },
};

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
