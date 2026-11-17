'use client';

import { useEffect, useRef, useState } from 'react';
import { FiArrowRight, FiEye, FiHelpCircle, FiLoader, FiSend } from 'react-icons/fi';
import { Reply } from '@/components/tutor/TutorPanel';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { APPROACH_MIN_WORDS, COMPLEXITIES, complexityLabel, edgeCaseList, hintCap, MAX_HINT, nextPhase, PHASE_INFO, wordCount, type WorkPhase } from '@/interview/rules';
import { LEVEL_NAMES, type Level } from '@/lib/tutor-ladder';
import type { RoundView } from './api';

// The interviewer beside the editor in a mock interview: the conversation so
// far, the phase's own inputs (the approach with its complexity, the cases
// to test), a box to say something, and "I'm stuck" for a hint. A sibling of
// TutorPanel, sharing its rendering of model replies (no links or HTML).

export type PanelActions = {
  say: (text: string) => Promise<boolean>;
  approach: (text: string, time: string, space: string) => Promise<boolean>;
  hint: (account: string) => Promise<boolean>;
  next: () => void;
  end: () => void;
};

export function InterviewerPanel({
  round,
  busy,
  error,
  cases,
  onCases,
  onPoint,
  actions,
}: {
  round: RoundView;
  busy: boolean;
  error: string | null;
  cases: string;
  onCases: (text: string) => void;
  onPoint: (line: number | null) => void;
  actions: PanelActions;
}) {
  const phase = round.phase as WorkPhase;
  const [message, setMessage] = useState('');
  const [approach, setApproach] = useState(round.approach?.text ?? '');
  const [time, setTime] = useState(round.approach?.time ?? '');
  const [space, setSpace] = useState(round.approach?.space ?? '');
  const [stuck, setStuck] = useState(false);
  const [account, setAccount] = useState('');
  const words = wordCount(approach);
  const stated = !!round.approach?.text;
  const following = nextPhase(phase);
  // New lines scroll into view.
  const log = useRef<HTMLDivElement>(null);
  const lines = round.transcript.length;
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <section aria-labelledby="interviewer-title" className="flex flex-col gap-3 rounded-[28px] bg-track-lilac p-5 text-track-lilac-ink">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="interviewer-title" className="font-display text-[22px] font-bold text-track-lilac-title">
          Interviewer
        </h2>
        <Chip tone="onTrack">
          {round.hints === 0 ? 'No hints used' : `Hints: ${round.hints} of ${MAX_HINT}`}
        </Chip>
      </div>

      {/* A log: new lines are read out politely. It scrolls, so it can take focus. */}
      <div ref={log} role="log" aria-label="The interview so far" tabIndex={0} className="max-h-[420px] overflow-y-auto rounded-[18px]">
        <ol className="flex flex-col gap-2">
        {round.transcript.map((t, i) =>
          t.role === 'interviewer' ? (
            <li key={i} className="rounded-[18px] bg-surface px-4 py-3 text-sm text-ink">
              {t.level && (
                <div className="mb-1 text-xs font-bold tracking-[0.04em] text-accent-ink uppercase">
                  Hint {t.level} · {LEVEL_NAMES[t.level as Level]}
                </div>
              )}
              <Reply text={t.text} />
              {t.line != null && (
                <button type="button" onClick={() => onPoint(t.line!)} className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-ink hover:bg-sunken">
                  <FiEye aria-hidden /> Show line {t.line}
                </button>
              )}
            </li>
          ) : (
            <li key={i} className="ml-8 rounded-[18px] bg-primary px-4 py-3 text-sm whitespace-pre-wrap text-on-primary">
              <span className="sr-only">You: </span>
              {t.text}
            </li>
          ),
        )}
        </ol>
      </div>

      {phase === 'approach' && (
        <form
          className="flex flex-col gap-3 rounded-[20px] bg-surface p-4 text-ink"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && words >= APPROACH_MIN_WORDS && time && space) void actions.approach(approach.trim(), time, space);
          }}
        >
          <TextAreaField
            label="Your approach"
            hint={`How it works and why, in at least ${APPROACH_MIN_WORDS} words (${words} so far).`}
            value={approach}
            onChange={(e) => setApproach(e.target.value)}
            rows={4}
            maxLength={2400}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SelectField label="Time complexity" value={time} onChange={(e) => setTime(e.target.value)}>
              <option value="">Choose…</option>
              {COMPLEXITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {complexityLabel(c.id)}
                </option>
              ))}
            </SelectField>
            <SelectField label="Space complexity" value={space} onChange={(e) => setSpace(e.target.value)}>
              <option value="">Choose…</option>
              {COMPLEXITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {complexityLabel(c.id)}
                </option>
              ))}
            </SelectField>
          </div>
          <Button type="submit" kind="accent" disabled={busy || words < APPROACH_MIN_WORDS || !time || !space} className="self-start">
            {stated ? 'Update my approach' : 'Tell the interviewer'}
          </Button>
        </form>
      )}

      {phase === 'test' && (
        <div className="rounded-[20px] bg-surface p-4 text-ink">
          <TextAreaField
            label="Cases you’d test, one per line"
            hint={edgeCaseList(cases).length ? `${edgeCaseList(cases).length} listed. Submit all tests when you’re ready.` : 'Listing them comes before Submit all tests.'}
            value={cases}
            onChange={(e) => onCases(e.target.value)}
            rows={4}
            maxLength={2400}
            placeholder={'e.g. the smallest input\nall values equal'}
          />
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || !message.trim()) return;
          if (await actions.say(message.trim())) setMessage('');
        }}
      >
        <label htmlFor="interview-say" className="sr-only">
          Say something to the interviewer
        </label>
        <input
          id="interview-say"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1200}
          placeholder={phase === 'clarify' ? 'Ask about anything the problem leaves open' : 'Think aloud, or ask a question'}
          className="h-11 min-w-0 grow rounded-[18px] bg-surface px-4 text-sm text-ink placeholder:text-ink-muted"
        />
        <Button type="submit" kind="onTrack" disabled={busy || !message.trim()} icon={busy ? <FiLoader aria-hidden className="animate-spin" /> : <FiSend aria-hidden />}>
          Say
        </Button>
      </form>

      {error && (
        <p role="alert" className="rounded-[18px] bg-warn-soft px-4 py-3 text-sm text-warn-title">
          {error}
        </p>
      )}

      {stuck && round.hints < MAX_HINT && (
        <form
          className="flex flex-col gap-2 rounded-[20px] bg-surface p-4 text-ink"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || (round.hints === 0 && account.trim().length < 5)) return;
            if (await actions.hint(account.trim())) {
              setAccount('');
              setStuck(false);
            }
          }}
        >
          <TextAreaField
            label={round.hints === 0 ? 'First, in a sentence: where are you, and what are you stuck on?' : 'Where are you now? (optional)'}
            hint={`A hint lowers the most your approach can score, to ${hintCap(round.hints + 1)} of 4.`}
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            rows={2}
            maxLength={1200}
          />
          <span className="flex flex-wrap gap-2">
            <Button type="submit" kind="accent" size="s" disabled={busy || (round.hints === 0 && account.trim().length < 5)}>
              Get hint {round.hints + 1}: {LEVEL_NAMES[(round.hints + 1) as Level]}
            </Button>
            <Button kind="ghost" size="s" onClick={() => setStuck(false)}>
              Never mind
            </Button>
          </span>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {following && following !== 'debrief' ? (
          <Button
            kind="primary"
            onClick={actions.next}
            disabled={busy || (phase === 'approach' && !stated)}
            title={phase === 'approach' && !stated ? 'Tell the interviewer your approach first' : undefined}
            trailing={<FiArrowRight aria-hidden />}
          >
            {following === 'code' ? 'Start coding' : `Move on: ${PHASE_INFO[following].label}`}
          </Button>
        ) : (
          <Button kind="primary" onClick={actions.end} disabled={busy}>
            Finish and get my debrief
          </Button>
        )}
        {!stuck && round.hints < MAX_HINT && (
          <Button kind="onTrack" onClick={() => setStuck(true)} disabled={busy} icon={<FiHelpCircle aria-hidden />}>
            I’m stuck
          </Button>
        )}
      </div>
      <p className="text-xs">
        {round.repliesLeft > 0
          ? 'The interviewer is an AI and can be wrong. It asks rather than teaches, as a real one would.'
          : 'The interviewer has answered all it can this round, so it keeps to set questions now.'}{' '}
        {PHASE_INFO[phase].doing}
      </p>
    </section>
  );
}
