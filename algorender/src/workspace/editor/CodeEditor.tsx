'use client';

import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { go } from '@codemirror/lang-go';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { bracketMatching, ensureSyntaxTree, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { forEachDiagnostic, linter, setDiagnosticsEffect } from '@codemirror/lint';
import { search, searchKeymap } from '@codemirror/search';
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
import { useEffect, useRef, useState } from 'react';
import { FiAlertCircle } from 'react-icons/fi';
import { useAutocomplete, useVim } from '@/lib/preferences';
import type { ProblemLanguage } from '@/problems/languages';
import { completionSource } from './complete';
import { isChecked, syntaxProblems, type CheckedLanguage } from './syntax';
import { highlight, phrases, theme } from './theme';

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

/** How long typing pauses before syntax errors are looked for. */
const LINT_DELAY = 800;

/** Syntax errors from the parse tree, in Python, JavaScript and TypeScript only (see syntax.ts). */
function syntaxLinter(language: CheckedLanguage): Extension {
  return linter(
    (view) => {
      const tree = ensureSyntaxTree(view.state, view.state.doc.length, 200);
      if (!tree) return [];
      return syntaxProblems(tree, view.state.doc.toString(), language).map((p) => ({ from: p.from, to: p.to, severity: 'error' as const, message: p.message }));
    },
    { delay: LINT_DELAY },
  );
}

/** Help while writing: syntax errors, and completions unless the learner turned them off. Read-only code gets neither. */
function assists(language: ProblemLanguage, readOnly: boolean, complete: boolean): Extension {
  if (readOnly) return [];
  return [
    isChecked(language) ? syntaxLinter(language) : [],
    complete ? autocompletion({ override: [completionSource(language)], icons: false, optionClass: (c) => (c.type === 'keyword' ? 'cm-completion-keyword' : '') }) : [],
  ];
}

/**
 * Vim takes Esc for leaving insert mode, so CodeMirror never hears it; Esc
 * still has to let the next Tab leave the editor (no keyboard trap).
 */
const escapeLeaves = EditorView.domEventObservers({
  keydown(event, view) {
    if (event.key === 'Escape') view.setTabFocusMode(2000);
  },
});

/** Vim's / and : prompt is an input with no name; give it one when it opens. */
const nameVimPrompt = EditorView.updateListener.of((u) => {
  for (const input of u.view.dom.querySelectorAll('.cm-vim-panel input:not([aria-label])')) {
    const prefix = input.parentElement?.firstChild?.textContent?.trim();
    input.setAttribute('aria-label', prefix === '/' || prefix === '?' ? 'Vim search' : 'Vim command');
  }
});

/** The first syntax error, for the line under the code that screen readers hear. */
type Shown = { line: number; message: string; more: number };

function firstProblem(state: EditorState): (Shown & { from: number }) | null {
  let first: { from: number; message: string } | null = null;
  let count = 0;
  forEachDiagnostic(state, (d, from) => {
    count++;
    if (!first || from < first.from) first = { from, message: d.message };
  });
  if (!first) return null;
  const { from, message } = first;
  return { from, message, line: state.doc.lineAt(from).number, more: count - 1 };
}

/**
 * A CodeMirror 6 editor for the learner's code. `value` is the source of truth
 * when it changes from outside (reset, switching language); typing reports
 * through `onChange`. Tab indents; Esc then Tab leaves the editor.
 *
 * While writing Python, JavaScript or TypeScript, syntax errors are underlined
 * as you type (with the message on hover, and the first one in words under the
 * code); completions offer keywords and names from the file (a setting turns
 * them off); Ctrl/⌘ F searches; and Vim keys are a setting, loaded only when on.
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
  const assistSlot = useRef(new Compartment());
  const vimSlot = useRef(new Compartment());
  const complete = useAutocomplete();
  const vimKeys = useVim();
  const [problem, setProblem] = useState<Shown | null>(null);
  const problemAt = useRef(0);

  useEffect(() => {
    onChangeRef.current = onChange;
    onRunRef.current = onRun;
  }, [onChange, onRun]);

  // Create the editor once; later prop changes are dispatched into it below.
  useEffect(() => {
    let shownKey = '';
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          // First, so Vim's keys win over the others when it is on.
          vimSlot.current.of([]),
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          search({ top: true }),
          syntaxHighlighting(highlight),
          keymap.of([
            { key: 'Mod-Enter', run: () => (onRunRef.current?.(), true) },
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          theme,
          EditorState.phrases.of(phrases),
          // Long lines wrap rather than scroll sideways (the code panel's rule).
          EditorView.lineWrapping,
          marksField,
          languageSlot.current.of(languageExtension(language)),
          editableSlot.current.of([EditorView.editable.of(!readOnly), EditorState.readOnly.of(readOnly)]),
          assistSlot.current.of(assists(language, readOnly, complete)),
          EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
          EditorView.theme({ '.cm-content, .cm-gutter': { minHeight: `${minLines * 1.6 + 1}em` } }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
            if (u.docChanged || u.transactions.some((tr) => tr.reconfigured || tr.effects.some((e) => e.is(setDiagnosticsEffect)))) {
              const first = firstProblem(u.state);
              problemAt.current = first?.from ?? 0;
              const key = first ? `${first.line}\n${first.message}\n${first.more}` : '';
              if (key !== shownKey) {
                shownKey = key;
                setProblem(first && { line: first.line, message: first.message, more: first.more });
              }
            }
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
    view.current?.dispatch({ effects: assistSlot.current.reconfigure(assists(language, readOnly, complete)) });
  }, [language, readOnly, complete]);

  // Vim's code is fetched only once the setting is on.
  useEffect(() => {
    if (!vimKeys) {
      view.current?.dispatch({ effects: vimSlot.current.reconfigure([]) });
      return;
    }
    let cancelled = false;
    void import('@replit/codemirror-vim').then(({ vim }) => {
      if (!cancelled) view.current?.dispatch({ effects: vimSlot.current.reconfigure([vim({ status: true }), escapeLeaves, nameVimPrompt]) });
    });
    return () => {
      cancelled = true;
    };
  }, [vimKeys]);

  useEffect(() => {
    view.current?.dispatch({ effects: setMarks.of({ run: runLine, error: errorLine, point: pointLine }) });
  }, [runLine, errorLine, pointLine]);

  useEffect(() => {
    const v = view.current;
    if (!v || pointLine == null || pointLine < 1 || pointLine > v.state.doc.lines) return;
    v.dispatch({ effects: EditorView.scrollIntoView(v.state.doc.line(pointLine).from, { y: 'center' }) });
  }, [pointLine]);

  const goToProblem = () => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ selection: { anchor: Math.min(problemAt.current, v.state.doc.length) }, scrollIntoView: true });
    v.focus();
  };

  return (
    <div className="overflow-hidden rounded-well bg-code text-left">
      <div ref={host} />
      <div role="status">
        {problem && (
          <p className="flex items-start gap-2 border-t border-code-highlight px-3 py-2 text-[13px] leading-snug text-code-ink" data-syntax-error>
            <FiAlertCircle aria-hidden className="mt-[3px] shrink-0 text-code-bad" />
            <span>
              <span className="sr-only">Syntax error on </span>
              <button type="button" onClick={goToProblem} className="font-semibold underline decoration-code-bad decoration-2 underline-offset-2">
                Line {problem.line}
              </button>
              : {problem.message}
              {problem.more > 0 && <span className="text-code-muted"> ({problem.more === 1 ? '1 more error' : `${problem.more} more errors`})</span>}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
