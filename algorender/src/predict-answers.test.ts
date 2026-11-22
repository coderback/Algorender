// Predict mode asks what happens next, so nothing on the page may answer it.
//
// The teaching panels written from a module's `content` (what stays true, when
// to use it, properties, the experiments) fold away while the learner predicts
// (`PredictFold`; e2e/explorer.spec.ts checks it), so they may state answers.
// What stays on screen is checked here for every module: the idea under the
// title, the cost tiles beside it, and each example's label (the input chip
// and picker), against the questions that example asks.
import { describe, expect, it } from 'vitest';
import { getVisualiserBySlug } from '@/data/visualisers';
import type { AnyVisualiser } from '@/engine/module';
import type { Checkpoint } from '@/engine/types';
import { mentions, questionsByExample, statesAnswer } from '@/testing/answers';
import { LONG_MS } from '@/testing/timing';
import { modules } from './registry';

/**
 * Answers a label may mention, by module, each with why it gives nothing away.
 * Keep this short: reword the label if you can.
 */
const ALLOWED: Record<string, Record<string, string>> = {
  // "Σ i, i = 1..10": the sum's last index; the running total after i = 4 happens to be 10 as well.
  'sigma-notation': { '10': 'the upper limit, not the total' },
  // "2×2 times 2×2" names the inputs' shapes; the product's shape is the rule being predicted.
  'matrix-multiplication': { '2×2': 'the inputs’ shapes' },
};

const all = Object.values(modules) as AnyVisualiser[];
const allowed = (slug: string, cp: Checkpoint) => cp.choices[cp.answer] in (ALLOWED[slug] ?? {});

describe('statesAnswer', () => {
  const cp = (choices: string[], answer: number): Checkpoint => ({ question: 'Q?', choices, answer });

  it('finds a number, shape or point said outright, and only as a whole', () => {
    expect(statesAnswer('makes a 5×5 map', cp(['5 × 5', '6 × 6'], 0))).toBe(true);
    expect(statesAnswer('at 1,024 darts', cp(['256', '1,024'], 1))).toBe(true);
    expect(statesAnswer('it lands at (−2, 1).', cp(['(−2, 1)', '(1, 2)'], 0))).toBe(true);
    expect(statesAnswer('σ′ ≤ 0.25', cp(['0.25', '0.5'], 0))).toBe(true);
    expect(statesAnswer('it reaches 125', cp(['12', '13'], 0))).toBe(false);
    expect(statesAnswer('it is 0.255', cp(['0.25', '0.5'], 0))).toBe(false);
    expect(mentions('log(10 × 100)', '10×100')).toBe(true);
  });

  it('lets a text name every choice, and leaves single digits and words to people', () => {
    expect(statesAnswer('Is it 25 or 50?', cp(['25', '50'], 0))).toBe(false);
    expect(statesAnswer('K[i−1, c]', cp(['1', '2'], 0))).toBe(false);
    expect(statesAnswer('a smaller error', cp(['Smaller', 'Larger'], 0))).toBe(false);
  });
});

describe.each(all.map((m) => [m.slug, m] as const))('%s', (slug, m) => {
  it('says no Predict answer in the text that stays on screen while predicting', { timeout: LONG_MS }, () => {
    const meta = getVisualiserBySlug(slug) as { timeComplexity?: { average: string }; spaceComplexity?: string } | undefined;
    const header = [m.content.idea, meta?.timeComplexity?.average ?? '', meta?.spaceComplexity ?? ''];
    const examples = questionsByExample(m);
    for (const { label, checkpoints } of examples)
      for (const cp of checkpoints) {
        const answer = `${cp.question} → ${cp.choices[cp.answer]}`;
        for (const text of header) expect(statesAnswer(text, cp), `${answer}, said in "${text}"`).toBe(false);
        if (!allowed(slug, cp)) expect(statesAnswer(label, cp), `${answer}, said in the label "${label}"`).toBe(false);
      }
  });
});

describe('the allow-list', () => {
  it('names only answers a label still mentions', () => {
    for (const [slug, answers] of Object.entries(ALLOWED)) {
      const m = modules[slug as keyof typeof modules] as AnyVisualiser | undefined;
      expect(m, slug).toBeDefined();
      const said = questionsByExample(m!).flatMap(({ label, checkpoints }) =>
        checkpoints.filter((cp) => statesAnswer(label, cp)).map((cp) => cp.choices[cp.answer]),
      );
      for (const answer of Object.keys(answers)) expect(said, `${slug}: ${answer}`).toContain(answer);
    }
  });
});
