import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { ProblemLanguage } from '@/problems/languages';

/**
 * Light autocomplete: the language's keywords plus the names already in the
 * file, nothing smarter (no types, no imports, no members of a value). It
 * opens once two letters of a word are typed, or on Ctrl+Space, and never
 * inside a string or a comment.
 */

const JS = 'async await break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield';

export const KEYWORDS: Record<ProblemLanguage, readonly string[]> = {
  python: words('False None True and as assert async await break case class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return try while with yield'),
  javascript: words(JS),
  typescript: words(`${JS} abstract any as boolean declare enum implements interface keyof never number private protected public readonly string type unknown`),
  java: words('abstract boolean break byte case catch char class continue default do double else enum extends false final finally float for if implements import instanceof int interface long new null package private protected public return short static super switch this throw throws true try var void while'),
  cpp: words('auto bool break case catch char class const constexpr continue default delete do double else enum false float for if inline int long namespace new nullptr private protected public return short signed sizeof static struct switch template this throw true try typedef typename unsigned using virtual void while'),
  go: words('break case chan const continue default defer else fallthrough false for func go goto if import interface map nil package range return select struct switch true type var'),
};

function words(list: string): readonly string[] {
  return list.split(' ');
}

/** Leaf nodes that are names in the six grammars (VariableName, PropertyDefinition, Identifier, FieldIdentifier, DefName, ...). */
const NAME_NODE = /(Name|Definition|Identifier)$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
/** Strings and comments in the six grammars, where no list opens; code inside a template or f-string's braces still completes. */
const QUIET = /^(String|FormatString|TemplateString|StringLiteral|RawString|TextBlock|CharLiteral|CharacterLiteral|Rune|Comment|LineComment|BlockComment|RegExp)$/;
const CODE_IN_STRING = /^(Interpolation|FormatReplacement)$/;

/** Every distinct name in the tree, sorted, leaving out the node at `skip` (the word being typed). */
export function namesIn(tree: ReturnType<typeof syntaxTree>, doc: string, skip?: { from: number; to: number }): string[] {
  const names = new Set<string>();
  tree.iterate({
    enter(n) {
      if (n.node.firstChild || !NAME_NODE.test(n.name)) return;
      if (skip && n.from === skip.from && n.to === skip.to) return;
      const text = doc.slice(n.from, n.to);
      if (IDENTIFIER.test(text)) names.add(text);
    },
  });
  return [...names].sort();
}

/** Typed letters before this many don't open the list on their own. */
export const MIN_TYPED = 2;

export function completionSource(language: ProblemLanguage): CompletionSource {
  const keywords = new Set(KEYWORDS[language]);
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/[A-Za-z_$][\w$]*/);
    if (!word && !context.explicit) return null;
    const from = word ? word.from : context.pos;
    if (!context.explicit && context.pos - from < MIN_TYPED) return null;
    const tree = syntaxTree(context.state);
    for (let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(context.pos, -1); node; node = node.parent) {
      if (CODE_IN_STRING.test(node.name)) break;
      if (QUIET.test(node.name)) return null;
    }
    const names = namesIn(tree, context.state.doc.toString(), { from, to: context.pos }).filter((n) => !keywords.has(n));
    const options: Completion[] = [
      ...names.map((label) => ({ label, type: 'variable' })),
      ...[...keywords].map((label) => ({ label, type: 'keyword' })),
    ];
    return { from, options, validFor: /^[\w$]*$/ };
  };
}
