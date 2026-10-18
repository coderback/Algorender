import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expectGoodPlotTrace, traceOf } from '@/viz/plot/testing';
import { applyMerge, bpe, encode, initialTokens, MAX_MERGES, MIN_MERGES, train, wordsOf, type BpeInput, type Tok } from './bpe';
import { MODEL } from './corpus';
import { argmax, generate, MAX_LENGTH, MIN_LENGTH, pick, ranked, renormalise, sampling, softmax, topK, topP, type SamplingInput } from './sampling';

const word = fc.array(fc.constantFrom('a', 'b', 'c', 'n'), { minLength: 1, maxLength: 6 }).map((cs) => cs.join(''));
const corpus = fc.array(word, { minLength: 1, maxLength: 8 }).map((ws) => ws.join(' '));
const joined = (toks: readonly Tok[]) => toks.map((t) => t.text).join('');

/** A straightforward BPE trainer on words as symbol lists, to check the module against. */
function referenceTrain(text: string, merges: number): { merges: [string, string][]; words: string[][] } {
  const words = wordsOf(text).map((w) => Array.from(w));
  const learned: [string, string][] = [];
  for (let m = 0; m < merges; m++) {
    const counts = new Map<string, { a: string; b: string; n: number }>(); // insertion order = first appearance
    for (const w of words)
      for (let i = 0; i + 1 < w.length; i++) {
        const k = JSON.stringify([w[i], w[i + 1]]);
        const c = counts.get(k) ?? { a: w[i], b: w[i + 1], n: 0 };
        c.n++;
        counts.set(k, c);
      }
    let best: { a: string; b: string; n: number } | null = null;
    for (const c of counts.values()) if (!best || c.n > best.n) best = c;
    if (!best) break;
    learned.push([best.a, best.b]);
    for (const w of words) {
      let i = 0;
      while (i + 1 < w.length) {
        if (w[i] === best.a && w[i + 1] === best.b) w.splice(i, 2, best.a + best.b);
        i++;
      }
    }
  }
  return { merges: learned, words };
}

describe('bpe', () => {
  it('plays every example as a good trace', () => {
    for (const ex of bpe.input.examples) {
      for (const size of [MIN_MERGES, 8, MAX_MERGES]) {
        const frames = traceOf(bpe, ex.make({ seed: 1, size })).frames;
        expectGoodPlotTrace(bpe, frames);
        expect(frames.length).toBeLessThan(150);
        expect(frames.some((f) => f.checkpoint)).toBe(true);
      }
    }
  });

  it('matches a reference trainer, and joining the tokens always gives back the text', () => {
    fc.assert(
      fc.property(corpus, fc.integer({ min: 1, max: 12 }), (text, merges) => {
        const { steps, final } = train(text, merges);
        const ref = referenceTrain(text, merges);
        expect(steps.map((s) => [s.pair.a, s.pair.b])).toEqual(ref.merges);
        expect(final.map((t) => t.text)).toEqual(ref.words.flat());
        expect(joined(final)).toBe(wordsOf(text).join(''));
        for (const s of steps) expect(joined(s.after)).toBe(joined(s.before));
      }),
      { numRuns: 300 },
    );
  });

  it('replaces exactly the non-overlapping occurrences of the pair, and the count drops by that many', () => {
    fc.assert(
      fc.property(corpus, fc.integer({ min: 1, max: 12 }), (text, merges) => {
        for (const s of train(text, merges).steps) {
          // Non-overlapping occurrences, scanning left to right within words.
          let expected = 0;
          for (let i = 0; i + 1 < s.before.length; i++) {
            const [x, y] = [s.before[i], s.before[i + 1]];
            if (x.word === y.word && x.text === s.pair.a && y.text === s.pair.b) {
              expected++;
              i++;
            }
          }
          expect(s.replaced).toBe(expected);
          expect(s.after.length).toBe(s.before.length - s.replaced);
          expect(s.replaced).toBeGreaterThan(0);
          expect(s.replaced).toBeLessThanOrEqual(s.pair.count);
          // Merged tokens keep the left token's id, so they glide.
          const ids = new Set(s.before.map((t) => t.id));
          expect(s.after.every((t) => ids.has(t.id))).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('encodes a new word by applying the merges in the order they were learned', () => {
    fc.assert(
      fc.property(corpus, word, fc.integer({ min: 1, max: 12 }), (text, w, merges) => {
        const learned = train(text, merges).steps.map((s) => [s.pair.a, s.pair.b] as const);
        const { pieces } = encode(` ${w}`, learned);
        let toks: Tok[] = Array.from(` ${w}`).map((ch, i) => ({ id: `x${i}`, text: ch, word: 0 }));
        for (const [a, b] of learned) toks = applyMerge(toks, a, b).tokens;
        expect(pieces.map((t) => t.text)).toEqual(toks.map((t) => t.text));
        expect(joined(pieces)).toBe(` ${w}`);
      }),
      { numRuns: 200 },
    );
  });

  it('starts from characters, a word owning its leading space', () => {
    expect(initialTokens('ab  c').map((t) => t.text)).toEqual(['a', 'b', ' ', 'c']);
    expect(initialTokens('ab  c').map((t) => t.word)).toEqual([0, 0, 1, 1]);
  });

  it('round-trips custom text', () => {
    const input: fc.Arbitrary<BpeInput> = fc.record({ text: corpus.filter((t) => t.length >= 3), merges: fc.integer({ min: MIN_MERGES, max: MAX_MERGES }), unseen: word });
    fc.assert(
      fc.property(input, (i) => {
        const custom = bpe.input.custom!;
        expect(custom.parse(custom.format(i))).toEqual({ value: i });
      }),
    );
    expect('error' in bpe.input.custom!.parse('ab | merges = 99')).toBe(true);
  });

  it('keeps pseudo-code lines within the code panel', () => {
    for (const line of [...bpe.pseudocode, ...sampling.pseudocode]) expect(line.length).toBeLessThanOrEqual(42);
  });
});

const logits = fc.array(fc.double({ min: -6, max: 6, noNaN: true }), { minLength: 2, maxLength: 12 });
const probs = logits.map((l) => softmax(l, 1));

describe('sampling', () => {
  it('plays every example as a good trace', () => {
    for (const ex of sampling.input.examples) {
      for (const size of [MIN_LENGTH, 6, MAX_LENGTH]) {
        for (const seed of [1, 42, 999]) {
          const frames = traceOf(sampling, ex.make({ seed, size })).frames;
          expectGoodPlotTrace(sampling, frames);
          expect(frames.length).toBeLessThan(150);
          expect(frames.some((f) => f.checkpoint)).toBe(true);
        }
      }
    }
  });

  it('softmax with a temperature sums to 1 and keeps the order of the logits', () => {
    fc.assert(
      fc.property(logits, fc.double({ min: 0.05, max: 3, noNaN: true }), (l, T) => {
        const p = softmax(l, T);
        expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
        for (let i = 0; i < l.length; i++)
          for (let j = 0; j < l.length; j++) if (l[i] > l[j]) expect(p[i]).toBeGreaterThanOrEqual(p[j]);
      }),
    );
  });

  it('T = 0 is the argmax, and a tiny T approaches it', () => {
    fc.assert(
      fc.property(logits, (l) => {
        const best = argmax(l);
        expect(softmax(l, 0)[best]).toBe(1);
        const top = Math.max(...l);
        const winners = l.filter((v) => v === top).length;
        if (l.every((v) => v === top || top - v > 0.01)) expect(softmax(l, 0.0005)[best]).toBeCloseTo(1 / winners, 6);
      }),
    );
  });

  it('top-k keeps k words, top-p the shortest prefix reaching p', () => {
    fc.assert(
      fc.property(probs, fc.integer({ min: 0, max: 14 }), fc.double({ min: 0.05, max: 1, noNaN: true }), (p, k, top) => {
        const order = ranked(p);
        const afterK = topK(order, k);
        expect(afterK).toEqual(k === 0 ? order : order.slice(0, k));
        const kept = topP(afterK, p, top);
        expect(kept).toEqual(afterK.slice(0, kept.length));
        const q = renormalise(afterK, p);
        const mass = (n: number) => q.slice(0, n).reduce((a, b) => a + b, 0);
        expect(mass(kept.length)).toBeGreaterThanOrEqual(Math.min(top, 1) - 1e-9);
        if (kept.length > 1) expect(mass(kept.length - 1)).toBeLessThan(top - 1e-12);
      }),
    );
  });

  it('draws the word whose cumulative interval holds u', () => {
    fc.assert(
      fc.property(probs, fc.double({ min: 0, max: 0.999999, noNaN: true }), (p, u) => {
        const j = pick(p, u);
        const before = p.slice(0, j).reduce((a, b) => a + b, 0);
        expect(before).toBeLessThanOrEqual(u + 1e-12);
        if (j < p.length - 1) expect(u).toBeLessThan(before + p[j]);
      }),
    );
  });

  it('generates from the kept words, reproducibly from the seed', () => {
    const input: SamplingInput = { temperature: 1, topK: 0, topP: 0.9, seed: 5, prompt: 'the', length: 8 };
    const a = generate(input);
    expect(generate(input)).toEqual(a);
    for (const s of a) {
      expect(s.kept).toContain(s.word);
      expect(s.q.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 9);
    }
    // Greedy always answers a context with its most likely word.
    for (const s of generate({ ...input, temperature: 0 })) expect(s.word).toBe(argmax(s.logits));
  });

  it('round-trips custom text', () => {
    const input: fc.Arbitrary<SamplingInput> = fc.record({
      temperature: fc.integer({ min: 0, max: 300 }).map((v) => v / 100),
      topK: fc.integer({ min: 0, max: 10 }),
      topP: fc.integer({ min: 1, max: 100 }).map((v) => v / 100),
      seed: fc.integer({ min: 0, max: 100_000 }),
      prompt: fc.array(fc.constantFrom(...MODEL.vocab.filter((w) => w !== '.')), { minLength: 1, maxLength: 4 }).map((ws) => ws.join(' ')),
      length: fc.integer({ min: MIN_LENGTH, max: MAX_LENGTH }),
    });
    fc.assert(
      fc.property(input, (i) => {
        const custom = sampling.input.custom!;
        expect(custom.parse(custom.format(i))).toEqual({ value: i });
      }),
    );
    expect('error' in sampling.input.custom!.parse('temperature = 1, prompt = spaceship')).toBe(true);
  });
});
