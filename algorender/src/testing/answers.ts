// Does a piece of text a learner can read during Predict mode state the answer
// to one of its questions? Shared by the registry-wide guard and per-module tests.
import type { AnyVisualiser, Args } from '@/engine/module';
import { recordOperation, recordTrace } from '@/engine/trace';
import type { Checkpoint } from '@/engine/types';

/** Lower case, one space, no spaces around × , ( ) = /, and 1,024 written 1024. */
function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .replace(/\s*([×,()=/])\s*/g, '$1')
    .trim();
}

const WORD = /[\p{L}\p{N}]/u;

/** `phrase` occurs in `text` as a whole: not inside a longer word or number. */
export function mentions(text: string, phrase: string): boolean {
  const t = norm(text);
  const p = norm(phrase);
  if (!p) return false;
  for (let i = t.indexOf(p); i >= 0; i = t.indexOf(p, i + 1)) {
    const before = t[i - 1];
    const after = t[i + p.length];
    // A decimal point after the phrase continues the number (0.25 is not 0.2).
    // Only a phrase that starts or ends with a letter or digit can run into a neighbour.
    const joined = before !== undefined && WORD.test(p[0]) && WORD.test(before);
    const continues =
      after !== undefined && WORD.test(p.at(-1)!) && (WORD.test(after) || (after === '.' && /\d/.test(p.at(-1)!) && /\d/.test(t[i + p.length + 1] ?? '')));
    if (!joined && !continues) return true;
  }
  return false;
}

/**
 * The text states this question's answer: it mentions the right choice and
 * none of the wrong ones. Only answers with two or more digits are judged (a
 * value, a shape, a point, a percentage): a single digit turns up in any
 * formula (i − 1, O(1)), and a word answer ("Smaller", "Go left", "the") in
 * plain explanations of the rule the learner is meant to apply, so those need
 * a person's judgement.
 */
export function statesAnswer(text: string, cp: Checkpoint): boolean {
  const right = cp.choices[cp.answer];
  if ((right.match(/\d/g) ?? []).length < 2) return false;
  return mentions(text, right) && cp.choices.every((c, i) => i === cp.answer || !mentions(text, c));
}

/**
 * The Predict questions a module asks, example by example: each algorithm
 * example at its default size and two seeds, and for a structure each
 * operation once on each starting state, with default arguments.
 */
export function questionsByExample(m: AnyVisualiser): { id: string; label: string; checkpoints: Checkpoint[] }[] {
  if (m.kind === 'algorithm') {
    const size = m.input.size?.default ?? 0;
    return m.input.examples.map((example) => ({
      id: example.id,
      label: example.label,
      checkpoints: [1, 2].flatMap((seed) => recordTrace(m.run(example.make({ seed, size }))).frames.flatMap((f) => (f.checkpoint ? [f.checkpoint] : []))),
    }));
  }
  return m.initial.map((start) => {
    const model = start.make(1);
    const checkpoints: Checkpoint[] = [];
    for (const op of m.operations) {
      const args: Args = {};
      for (const a of op.args) {
        if (a.type === 'int') args[a.name] = a.default ?? Math.min(a.max, Math.max(a.min, 5));
        else if (a.type === 'text') args[a.name] = 'cat';
        else args[a.name] = a.options(model)[0] ?? '';
      }
      if (op.args.some((a) => args[a.name] === '') || op.disabledReason?.(model, args)) continue;
      for (const f of recordOperation(op.run(model, args)).frames) if (f.checkpoint) checkpoints.push(f.checkpoint);
    }
    return { id: start.id, label: start.label, checkpoints };
  });
}
