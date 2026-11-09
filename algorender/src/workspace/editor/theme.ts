import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

// The editor is the dark code panel in both themes: colours are the code-*
// tokens in globals.css, each clearing 4.5:1 on the panel and its line fills.
// Rules that replace a CodeMirror package's dark-mode defaults start with
// `&.cm-editor`, one class more specific than those.
export const theme = EditorView.theme(
  {
    // A dark colour scheme for the panel's own checkboxes and scrollbars.
    '&': { color: 'var(--color-code-ink)', backgroundColor: 'var(--color-code)', fontSize: '13.5px', colorScheme: 'dark' },
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

    // Syntax errors: a wavy underline, and the message in a tooltip on hover.
    '.cm-lintRange-error': {
      backgroundImage: 'none',
      textDecoration: 'underline wavy var(--color-code-bad)',
      textDecorationSkipInk: 'none',
      textUnderlineOffset: '3px',
    },
    '&.cm-editor .cm-tooltip': {
      backgroundColor: 'var(--color-code)',
      color: 'var(--color-code-ink)',
      border: '1px solid var(--color-code-muted)',
      borderRadius: '12px',
      overflow: 'hidden',
      fontSize: '13px',
    },
    '.cm-tooltip-lint': { padding: 0 },
    '.cm-diagnostic': { padding: '6px 12px', maxWidth: 'min(28rem, 85vw)', whiteSpace: 'normal' },
    '.cm-diagnostic-error': { borderLeft: '4px solid var(--color-code-bad)' },

    // Autocomplete: names and keywords, keywords in their syntax colour.
    '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-mono)', minWidth: '10rem', maxHeight: '11.5em' },
    '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '3px 12px', lineHeight: '1.5' },
    '&.cm-editor .cm-tooltip-autocomplete ul li[aria-selected]': { background: 'var(--color-code-highlight)', color: 'var(--color-code-ink)' },
    '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '700' },
    '.cm-completion-keyword': { color: 'var(--color-code-keyword)' },

    // Search (Ctrl/⌘ F): a panel above the code.
    '.cm-panels': { backgroundColor: 'var(--color-code)', color: 'var(--color-code-ink)' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--color-code-highlight)' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--color-code-highlight)' },
    '&.cm-editor .cm-panel.cm-search': { padding: '6px 48px 6px 10px', fontFamily: 'var(--font-sans)', fontSize: '13px' },
    '&.cm-editor .cm-panel.cm-search input, &.cm-editor .cm-panel.cm-search button, &.cm-editor .cm-panel.cm-search label': {
      margin: '3px 6px 3px 0',
      verticalAlign: 'middle',
    },
    '.cm-textfield': {
      backgroundColor: 'var(--color-code)',
      color: 'var(--color-code-ink)',
      border: '1px solid var(--color-code-muted)',
      borderRadius: '9999px',
      padding: '0 12px',
      height: '32px',
      width: '13rem',
      maxWidth: '100%',
      fontSize: '13px',
    },
    '.cm-textfield::placeholder': { color: 'var(--color-code-muted)' },
    '.cm-button': {
      backgroundImage: 'none',
      backgroundColor: 'var(--color-code-highlight)',
      color: 'var(--color-code-ink)',
      border: 'none',
      borderRadius: '9999px',
      padding: '0 12px',
      height: '32px',
      fontSize: '13px',
      fontWeight: '600',
      cursor: 'pointer',
    },
    '.cm-button:active': { backgroundImage: 'none' },
    '&.cm-editor .cm-panel.cm-search label': { display: 'inline-flex', alignItems: 'center', gap: '6px', height: '32px', fontSize: '13px' },
    '&.cm-editor .cm-panel.cm-search input[type=checkbox]': { width: '16px', height: '16px', margin: '0', accentColor: 'var(--color-feature-accent)' },
    '&.cm-editor .cm-panel.cm-search [name=close]': {
      top: '6px',
      right: '8px',
      margin: '0',
      width: '32px',
      height: '32px',
      borderRadius: '9999px',
      fontSize: '20px',
      lineHeight: '1',
      color: 'var(--color-code-ink)',
      cursor: 'pointer',
    },
    '&.cm-editor .cm-searchMatch': {
      backgroundColor: 'color-mix(in oklab, var(--color-feature-accent) 12%, transparent)',
      outline: '1px solid color-mix(in oklab, var(--color-feature-accent) 60%, transparent)',
    },
    '&.cm-editor .cm-searchMatch-selected': {
      backgroundColor: 'color-mix(in oklab, var(--color-feature-accent) 22%, transparent)',
      outline: '2px solid var(--color-feature-accent)',
    },

    // Vim keys (opt-in): the block cursor, and the mode line under the code.
    '&.cm-editor .cm-fat-cursor': { background: 'var(--color-feature-accent)', color: 'var(--color-code) !important' },
    '&.cm-editor:not(.cm-focused) .cm-fat-cursor': { background: 'none', outline: '1px solid var(--color-feature-accent)' },
    '.cm-vim-panel': { padding: '4px 12px', minHeight: '1.6em', fontFamily: 'var(--font-mono)', fontSize: '12.5px', color: 'var(--color-code-ink)' },
    '.cm-vim-panel input': { color: 'var(--color-code-ink)', fontFamily: 'var(--font-mono)' },
  },
  { dark: true },
);

export const highlight = HighlightStyle.define([
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

/** The search panel's words, in sentence case. */
export const phrases = {
  Find: 'Find',
  Replace: 'Replace with',
  next: 'Next',
  previous: 'Previous',
  all: 'All',
  'match case': 'Match case',
  regexp: 'Regex',
  'by word': 'Whole word',
  replace: 'Replace',
  'replace all': 'Replace all',
  close: 'Close search',
};
