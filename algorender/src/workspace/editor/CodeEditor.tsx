'use client';

import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { go } from '@codemirror/lang-go';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, RangeSetBuilder, StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type DecorationSet,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { useEffect, useRef } from 'react';
import type { ProblemLanguage } from '@/problems/languages';

// The editor is the dark code panel in both themes: colours are the code-*
// tokens in globals.css, each clearing 4.5:1 on the panel and its line fills.
const theme = EditorView.theme(
  {
    '&': { color: 'var(--color-code-ink)', backgroundColor: 'var(--color-code)', fontSize: '13.5px' },
    '.cm-content': { fontFamily: 'var(--font-mono)', caretColor: 'var(--color-code-ink)', padding: '10px 0' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
    '.cm-gutters': { backgroundColor: 'var(--color-code)', color: 'var(--color-code-muted)', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '&.cm-focused .cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--color-code-highlight) 60%, transparent)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--color-code-ink)' },
    '&.cm-focused': { outline: '3px solid var(--color-accent)', outlineOffset: '-3px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-code-ink)' },
    '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
      backgroundColor: 'color-mix(in oklab, var(--color-feature-accent) 30%, transparent)',
    },
    '.cm-matchingBracket': { backgroundColor: 'var(--color-code-highlight)', outline: '1px solid var(--color-code-muted)' },
    // The line the trace is on, and the line an error came from.
    '.cm-run-line': { backgroundColor: 'var(--color-code-highlight)', boxShadow: 'inset 3px 0 var(--color-feature-accent)' },
    '.cm-error-line': { backgroundColor: 'color-mix(in oklab, var(--color-code-bad) 16%, var(--color-code))', boxShadow: 'inset 3px 0 var(--color-code-bad)' },
    // The line the tutor points at.
    '.cm-point-line': { backgroundColor: 'color-mix(in oklab, var(--color-code-warn) 14%, var(--color-code))', boxShadow: 'inset 3px 0 var(--color-code-warn)' },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword], color: 'var(--color-code-keyword)', fontWeight: '600' },
  { tag: [t.string, t.special(t.string)], color: 'var(--color-code-string)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--color-code-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--color-code-muted)', fontStyle: 'italic' },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))],
    color: 'var(--color-code-fn)',
  },
  { tag: [t.typeName, t.className], color: 'var(--color-code-type)' },
  { tag: t.invalid, color: 'var(--color-code-bad)' },
]);

/** 1-based lines to highlight: where the trace is, where an error was raised, and where the tutor points. */
type Marks = { run: number | null; error: number | null; point: number | null };
const setMarks = StateEffect.define<Marks>();

const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setMarks)) continue;
      const builder = new RangeSetBuilder<Decoration>();
      const lines = tr.state.doc.lines;
      const add = (line: number | null, cls: string) => {
        if (line != null && line >= 1 && line <= lines) {
          const at = tr.state.doc.line(line).from;
          builder.add(at, at, Decoration.line({ class: cls }));
        }
      };
      const { run, error, point } = effect.value;
      // One mark per line (an error outranks the trace, which outranks the tutor), in document order as RangeSetBuilder needs.
      const byLine = new Map<number, string>();
      for (const [line, cls] of [
        [point, 'cm-point-line'],
        [run, 'cm-run-line'],
        [error, 'cm-error-line'],
      ] as const) {
        if (line != null) byLine.set(line, cls);
      }
      for (const [line, cls] of [...byLine].sort((a, b) => a[0] - b[0])) add(line, cls);
      next = builder.finish();
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function languageExtension(language: ProblemLanguage): Extension {
  switch (language) {
    case 'python':
      return [python(), indentUnit.of('    ')];
    case 'java':
      return [java(), indentUnit.of('    ')];
    case 'cpp':
      return [cpp(), indentUnit.of('    ')];
    case 'go':
      return [go(), indentUnit.of('	')];
    default:
      return [javascript({ typescript: language === 'typescript' }), indentUnit.of('  ')];
  }
}

/**
 * A CodeMirror 6 editor for the learner's code. `value` is the source of truth
 * when it changes from outside (reset, switching language); typing reports
 * through `onChange`. Tab indents; Esc then Tab leaves the editor.
 */
export function CodeEditor({
  value,
  onChange,
  language,
  label,
  runLine = null,
  errorLine = null,
  pointLine = null,
  readOnly = false,
  minLines = 12,
  onRun,
}: {
  value: string;
  onChange?: (value: string) => void;
  language: ProblemLanguage;
  /** Accessible name, e.g. "Your Python code". */
  label: string;
  /** 1-based line the trace is on, highlighted while stepping. */
  runLine?: number | null;
  /** 1-based line an error was raised on. */
  errorLine?: number | null;
  /** 1-based line the tutor points at; scrolled into view when it changes. */
  pointLine?: number | null;
  readOnly?: boolean;
  minLines?: number;
  /** Ctrl/Cmd+Enter. */
  onRun?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  const languageSlot = useRef(new Compartment());
  const editableSlot = useRef(new Compartment());

  useEffect(() => {
    onChangeRef.current = onChange;
    onRunRef.current = onRun;
  }, [onChange, onRun]);

  // Create the editor once; later prop changes are dispatched into it below.
  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          syntaxHighlighting(highlight),
          keymap.of([
            { key: 'Mod-Enter', run: () => (onRunRef.current?.(), true) },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          theme,
          // Long lines wrap rather than scroll sideways (the code panel's rule).
          EditorView.lineWrapping,
          marksField,
          languageSlot.current.of(languageExtension(language)),
          editableSlot.current.of([EditorView.editable.of(!readOnly), EditorState.readOnly.of(readOnly)]),
          EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
          EditorView.theme({ '.cm-content, .cm-gutter': { minHeight: `${minLines * 1.6 + 1}em` } }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // The editor is created once; value, language and flags are synced by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: languageSlot.current.reconfigure(languageExtension(language)) });
  }, [language]);

  useEffect(() => {
    view.current?.dispatch({
      effects: editableSlot.current.reconfigure([EditorView.editable.of(!readOnly), EditorState.readOnly.of(readOnly)]),
    });
  }, [readOnly]);

  useEffect(() => {
    view.current?.dispatch({ effects: setMarks.of({ run: runLine, error: errorLine, point: pointLine }) });
  }, [runLine, errorLine, pointLine]);

  useEffect(() => {
    const v = view.current;
    if (!v || pointLine == null || pointLine < 1 || pointLine > v.state.doc.lines) return;
    v.dispatch({ effects: EditorView.scrollIntoView(v.state.doc.line(pointLine).from, { y: 'center' }) });
  }, [pointLine]);

  return <div ref={host} className="overflow-hidden rounded-well bg-code text-left" />;
}
