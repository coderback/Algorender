'use client';

import { cursorCharLeft, cursorCharRight, indentLess, indentMore } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { useEffect, useState, type RefObject } from 'react';
import type { ProblemLanguage } from '@/problems/languages';

// The symbols a phone keyboard hides behind two or three taps, in a bar
// above the keyboard while the editor has focus (CodeEditor's `symbols`).
// On a phone this matters more than any other editor feature: code is
// mostly brackets, colons and quotes. Keys insert at the cursor and keep
// the editor focused (pointerdown is prevented, so the keyboard stays up).

type Key = { label: string; name: string; run: (view: EditorView) => void };

const insert = (text: string, name: string): Key => ({
  label: text,
  name,
  run: (view) => view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true }),
});

const COMMON: Key[] = [
  { label: '⇥', name: 'Indent', run: (view) => void indentMore(view) },
  { label: '⇤', name: 'Dedent', run: (view) => void indentLess(view) },
  insert('(', 'Opening parenthesis'),
  insert(')', 'Closing parenthesis'),
  insert('[', 'Opening square bracket'),
  insert(']', 'Closing square bracket'),
  insert('{', 'Opening brace'),
  insert('}', 'Closing brace'),
  insert(':', 'Colon'),
  insert('=', 'Equals sign'),
  insert('"', 'Double quote'),
  insert("'", 'Single quote'),
];

const ARROWS: Key[] = [
  { label: '←', name: 'Move left', run: (view) => void cursorCharLeft(view) },
  { label: '→', name: 'Move right', run: (view) => void cursorCharRight(view) },
];

/** The keys for a language: Python's comment sign, or C-family semicolons. */
export function symbolKeys(language: ProblemLanguage): Key[] {
  const own = language === 'python' ? [insert('#', 'Hash'), insert('_', 'Underscore')] : [insert(';', 'Semicolon'), insert('<', 'Less than'), insert('>', 'Greater than')];
  return [...COMMON, ...own, ...ARROWS];
}

/** How far the on-screen keyboard has pushed the visible area up, so the bar can sit on top of it. */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

export function SymbolBar({ view, language }: { view: RefObject<EditorView | null>; language: ProblemLanguage }) {
  const inset = useKeyboardInset();
  return (
    <div
      role="toolbar"
      aria-label="Symbols"
      aria-orientation="horizontal"
      data-symbol-bar
      className="fixed inset-x-0 z-40 flex gap-1 overflow-x-auto border-t border-code-highlight bg-code px-2 py-1.5 md:hidden"
      style={{ bottom: inset }}
    >
      {symbolKeys(language).map((key) => (
        <button
          key={key.name}
          type="button"
          aria-label={key.name}
          // Keep the editor focused, so the keyboard stays up.
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            const v = view.current;
            if (!v) return;
            key.run(v);
            v.focus();
          }}
          className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-[10px] bg-code-highlight px-2 font-mono text-base text-code-ink"
        >
          <span aria-hidden>{key.label}</span>
        </button>
      ))}
    </div>
  );
}
