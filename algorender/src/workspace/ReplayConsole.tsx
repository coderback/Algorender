'use client';

import { useEffect, useRef, useState } from 'react';
import { FiCornerDownLeft, FiPlay, FiSquare } from 'react-icons/fi';
import { Button } from '@/components/ui/Button';
import { DEFAULT_LIMITS, type Language, type RunResult } from './protocol';
import { endInput, replayRequest, replayStatus, startReplay, transcript, typeLine, type ReplayState } from './replay';
import { useRuntime } from './useRuntime';

/**
 * A console for a program that reads input: run it, answer its prompts, end
 * input. Each answer runs the program again from the start (replay.ts says
 * why), which the learner never sees: the transcript just grows.
 */
export function ReplayConsole({
  language,
  code,
  files,
  mode = 'visual',
}: {
  language: Language;
  /** The main file. */
  code: string;
  /** The program's other files. */
  files?: Record<string, string>;
  mode?: 'visual' | 'judge';
}) {
  const { runtime, runtimeState, runtimeDetail } = useRuntime(language);
  const [session, setSession] = useState<{ state: ReplayState; result: RunResult } | null>(null);
  const [running, setRunning] = useState(false);
  const [line, setLine] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const runs = useRef(0);

  async function replay(state: ReplayState) {
    const id = ++runs.current;
    setRunning(true);
    const result = await runtime.run({
      language,
      code,
      entry: '',
      args: [],
      limits: DEFAULT_LIMITS,
      mode,
      files,
      ...replayRequest(state),
    });
    if (id !== runs.current) return; // a newer run replaced this one
    setSession({ state, result });
    setRunning(false);
  }

  const waiting = session?.result.waiting === true && !running;
  useEffect(() => {
    if (waiting) input.current?.focus();
  }, [waiting]);

  const send = () => {
    if (!session) return;
    const next = typeLine(session.state, line);
    setLine('');
    void replay(next);
  };

  const error = session?.result.error;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button kind="accent" icon={<FiPlay aria-hidden />} onClick={() => void replay(startReplay())} disabled={running}>
          {session ? 'Run again' : 'Run'}
        </Button>
        {waiting && (
          <Button kind="secondary" icon={<FiSquare aria-hidden />} onClick={() => void replay(endInput(session.state))}>
            End input
          </Button>
        )}
        <p className="text-sm text-ink-muted" aria-live="polite">
          {runtimeState === 'loading' ? (runtimeDetail ?? 'Loading…') : running ? 'Running…' : session ? replayStatus(session.result) : 'Not run yet'}
        </p>
      </div>
      <div className="rounded-well bg-code p-4 font-mono text-sm text-code-ink" data-testid="console">
        <pre role="log" aria-label="Console" className="whitespace-pre-wrap break-words">
          {session
            ? transcript(session.result, session.state.typed).map((s, k) => (
                <span key={k} className={s.kind === 'in' ? 'text-code-string' : s.kind === 'err' ? 'text-code-bad' : undefined} data-kind={s.kind}>
                  {s.text}
                </span>
              ))
            : null}
        </pre>
        {waiting && (
          <form
            className="mt-1 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            onKeyDown={(e) => {
              // Ctrl+D ends input, as in a terminal.
              if (e.ctrlKey && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                void replay(endInput(session.state));
              }
            }}
          >
            <span aria-hidden className="text-code-muted">›</span>
            <label className="sr-only" htmlFor="console-input">
              Input for the program
            </label>
            <input
              ref={input}
              id="console-input"
              data-bare
              autoComplete="off"
              spellCheck={false}
              value={line}
              onChange={(e) => setLine(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-code-string outline-none"
            />
            <button type="submit" className="flex items-center gap-1 text-code-muted" aria-label="Send the line">
              <FiCornerDownLeft aria-hidden />
            </button>
          </form>
        )}
        {error && (
          <p className="mt-2 text-code-bad" role="alert">
            {error.message}
            {error.line != null && ` (${error.file ?? 'main'}, line ${error.line})`}
          </p>
        )}
      </div>
    </div>
  );
}
