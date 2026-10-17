import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plain, plotFrame } from '@/viz/plot/frame';
import { round } from '@/viz/plot/geometry';
import type { Handle, PlanePart, PlotPart, PlotState, Shape, Vec } from '@/viz/plot/types';

export type StoryId = 'disease' | 'spam' | 'generic';
/** P(H), P(E | H) and P(E | not H), with the words that make them concrete. */
export type BayesInput = { story: StoryId; prior: number; hit: number; fa: number };

/** `neg` negates `h` ("don’t have the disease"); `eShort` names one more piece of the evidence. */
type Story = { people: string; h: string; neg: string; notH: string; e: string; eShort: string };
const STORIES: Record<StoryId, Story> = {
  disease: { people: 'people', h: 'have the disease', neg: 'don’t have the disease', notH: 'are healthy', e: 'test positive', eShort: 'positive test' },
  spam: { people: 'emails', h: 'are spam', neg: 'aren’t spam', notH: 'are genuine', e: 'contain the word “winner”', eShort: '“winner”' },
  generic: { people: 'cases', h: 'have H', neg: 'don’t have H', notH: 'don’t have H', e: 'show E', eShort: 'sighting of E' },
};
const STORY_IDS = Object.keys(STORIES) as StoryId[];

const POPULATION = 1000;
const STEP = 0.01;

const pseudocode = [
  'P(H): the share with H, before evidence',
  'P(E|H): the share of H that shows E',
  'P(E|¬H): the share of not-H that shows E',
  'P(H|E) = P(H and E) / P(E)',
  '       = P(E|H)·P(H) / P(E)',
  'more evidence: P(H|E) is the new P(H)',
];

export function posterior({ prior, hit, fa }: Pick<BayesInput, 'prior' | 'hit' | 'fa'>): number {
  const e = hit * prior + fa * (1 - prior);
  return e === 0 ? prior : (hit * prior) / e;
}

const pct = (p: number) => {
  const v = p * 100;
  return `${v >= 10 || v === Math.round(v) ? Math.round(v) : round(v, 1)}%`;
};
const people = (p: number) => Math.round(p * POPULATION);

const rect = (x0: number, y0: number, x1: number, y1: number): Vec[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

type Show = { split: boolean; hit: boolean; fa: boolean; zoom: boolean; handles: boolean };

function square(input: BayesInput, prior: number, show: Show): PlanePart {
  const { hit, fa } = input;
  const fade = show.zoom ? 0.05 : 0.14;
  const shapes: Shape[] = [];
  if (!show.split) {
    shapes.push({ kind: 'path', id: 'all', points: rect(0, 0, 1, 1), closed: true, fill: true, fillOpacity: 0.1 });
  } else {
    // ¬E parts sit above, E parts below, so the evidence strip lines up along the bottom.
    shapes.push(
      { kind: 'path', id: 'h-not-e', points: rect(0, show.hit ? hit : 0, prior, 1), closed: true, fill: true, fillOpacity: fade + 0.1, mark: 'key' },
      { kind: 'path', id: 'not-h-not-e', points: rect(prior, show.fa ? fa : 0, 1, 1), closed: true, fill: true, fillOpacity: fade },
    );
    if (show.hit) shapes.push({ kind: 'path', id: 'h-e', points: rect(0, 0, prior, hit), closed: true, fill: true, fillOpacity: 0.7, mark: 'found' });
    if (show.fa) shapes.push({ kind: 'path', id: 'not-h-e', points: rect(prior, 0, 1, fa), closed: true, fill: true, fillOpacity: 0.7, mark: 'reject' });
  }
  const handles: Handle[] = show.handles
    ? [
        { id: 'prior', at: [prior, 1], label: 'P(H), the divider', mark: 'key', step: STEP, min: [STEP, 1], max: [1 - STEP, 1] },
        { id: 'hit', at: [round(prior / 2, 4), hit], label: 'P(E | H)', mark: 'found', step: STEP, min: [0, 0], max: [1, 1] },
        { id: 'fa', at: [round((1 + prior) / 2, 4), fa], label: 'P(E | not H)', mark: 'reject', step: STEP, min: [0, 0], max: [1, 1] },
      ]
    : [];
  return {
    kind: 'plane',
    id: 'plane',
    label: `All ${POPULATION} ${STORIES[input.story].people}, as areas`,
    x: { min: 0, max: 1 },
    y: { min: 0, max: 1 },
    equal: true,
    shapes,
    handles,
  };
}

/** Everyone who shows E, stretched to fill the width: the green share is P(H | E). */
function evidenceBar(post: number, story: Story): PlanePart {
  return {
    kind: 'plane',
    id: 'zoom',
    label: `Only those who ${story.e}`,
    x: { min: 0, max: 1, ticks: [{ at: 0, label: '0' }, { at: 1, label: '100%' }] },
    y: { min: 0, max: 1, ticks: [] },
    equal: false,
    shapes: [
      { kind: 'path', id: 'zoom-h', points: rect(0, 0.25, post, 0.75), closed: true, fill: true, fillOpacity: 0.7, mark: 'found' },
      { kind: 'path', id: 'zoom-not-h', points: rect(post, 0.25, 1, 0.75), closed: true, fill: true, fillOpacity: 0.7, mark: 'reject' },
      { kind: 'label', id: 'zoom-label', at: [0.5, 0.88], text: `P(H | E) = ${pct(post)}` },
    ],
    handles: [],
  };
}

function* run(input: BayesInput): Generator<Frame<PlotState>> {
  const s = STORIES[input.story];
  const { prior, hit, fa } = input;
  const pe = hit * prior + fa * (1 - prior);
  const post = posterior(input);
  const tp = people(hit * prior);
  const fp = people(fa * (1 - prior));
  const nh = people(prior);
  const values = (p: number, more: { id: string; label: string; value: string }[] = []): PlotPart => ({
    kind: 'readouts',
    id: 'readouts',
    label: 'Probabilities',
    items: [
      { id: 'prior', label: 'P(H)', value: pct(p), mark: 'key' },
      { id: 'hit', label: 'P(E | H)', value: pct(hit), mark: 'found' },
      { id: 'fa', label: 'P(E | not H)', value: pct(fa), mark: 'reject' },
      ...more,
    ],
  });
  const vars = { 'P(H)': prior, 'P(E|H)': hit, 'P(E|¬H)': fa };
  const all: Show = { split: true, hit: true, fa: true, zoom: false, handles: true };

  yield plotFrame([square(input, prior, { split: false, hit: false, fa: false, zoom: false, handles: false }), values(prior)], {
    line: null,
    note: `Picture ${POPULATION} ${s.people} as this square. Some ${s.h}; the question is how much seeing that one ${s.e} should change our mind.`,
    vars,
    checkpoint: ask(`How many of the ${POPULATION} ${s.h}?`, String(nh), [String(people(hit)), String(people(1 - prior)), String(people(prior * 10))]),
  });

  yield plotFrame([square(input, prior, { ...all, hit: false, fa: false }), values(prior)], {
    line: 0,
    note: `Split the square by the prior, P(H) = ${pct(prior)}: ${nh} ${s.people} ${s.h} (the left column) and ${POPULATION - nh} ${s.notH}. Drag the divider to change it.`,
    vars,
    checkpoint: ask(`How many of the ${nh} who ${s.h} also ${s.e}?`, String(tp), [String(people(hit)), String(nh), String(fp)]),
  });

  yield plotFrame([square(input, prior, { ...all, fa: false }), values(prior)], {
    line: 1,
    note: `Of the ${nh} who ${s.h}, P(E | H) = ${pct(hit)} ${s.e}: about ${tp} (green, at the bottom of the left column).`,
    vars,
    checkpoint: ask(`And how many of the ${POPULATION - nh} who ${s.notH} ${s.e}?`, String(fp), [String(people(fa)), String(tp), String(people(1 - fa))]),
  });

  yield plotFrame([square(input, prior, all), values(prior, [{ id: 'pe', label: 'P(E)', value: pct(pe) }])], {
    line: 2,
    note: `But P(E | not H) = ${pct(fa)} of the ${POPULATION - nh} who ${s.notH} ${s.e} too: about ${fp} (orange). Everyone who ${s.e} is in the bottom strip.`,
    vars,
    checkpoint: ask(
      `So, picked from everyone who ${s.e}: how likely is it that they ${s.h}?`,
      pct(post),
      [pct(hit), pct(1 - fa), pct(prior)],
    ),
  });

  const verdict =
    post < 0.5 && hit >= 0.8
      ? `Even with a test that catches ${pct(hit)}, most who ${s.e} ${s.neg}: ${fp} false alarms swamp ${tp} true ones because H is rare.`
      : post > prior
        ? `Seeing E raised the chance of H from ${pct(prior)} to ${pct(post)}.`
        : post < prior
          ? `Seeing E lowered the chance of H from ${pct(prior)} to ${pct(post)}.`
          : `E is just as common with H as without it, so seeing it changes nothing.`;
  yield plotFrame([square(input, prior, { ...all, zoom: true }), evidenceBar(post, s), values(prior, [{ id: 'post', label: 'P(H | E)', value: pct(post) }])], {
    line: 3,
    note: `Only the bottom strip matters now: ${
      tp + fp > 0 ? `${tp} green out of ${tp + fp} who ${s.e}, so P(H | E) = ${tp} / ${tp + fp}` : `fewer than one in ${POPULATION} ${s.e}, but the strip’s green share still gives P(H | E)`
    } ≈ ${pct(post)}. ${verdict}`,
    vars: { ...vars, 'P(H|E)': round(post, 4) },
  });

  const post2 = posterior({ prior: post, hit, fa });
  const second = post2 > post + 1e-9 ? 'Go up' : post2 < post - 1e-9 ? 'Go down' : 'Stay the same';
  yield plotFrame([square(input, prior, { ...all, zoom: true, handles: false }), evidenceBar(post, s), values(prior, [{ id: 'post', label: 'P(H | E)', value: pct(post) }])], {
    line: 4,
    note: `That is Bayes’ rule: P(H | E) = P(E | H)·P(H) / P(E) = ${pct(hit)} × ${pct(prior)} / ${pct(pe)} ≈ ${pct(post)}. The numerator is the green area; P(E) is the whole strip.`,
    vars: { ...vars, 'P(E)': round(pe, 4), 'P(H|E)': round(post, 4) },
    checkpoint: askInOrder(`Now a second, independent piece of the same evidence: one more ${s.eShort}. Will the chance of H go up, go down or stay the same?`, ['Go up', 'Go down', 'Stay the same'], second),
  });

  yield plotFrame(
    [
      square(input, post, { ...all, handles: false }),
      evidenceBar(post2, s),
      values(post, [{ id: 'post', label: 'P(H | E, E)', value: pct(post2) }]),
    ],
    {
      line: 5,
      note: `Yesterday’s answer is today’s prior: start the square from P(H) = ${pct(post)}, apply the same evidence again, and P(H) becomes ${pct(post2)}.`,
      vars: { 'P(H)': round(post, 4), 'P(E|H)': hit, 'P(E|¬H)': fa, 'P(H|E)': round(post2, 4) },
    },
  );

  yield plotFrame([square(input, prior, all), evidenceBar(post, s), values(prior, [{ id: 'post', label: 'P(H | E)', value: pct(post) }])], {
    line: 3,
    note: `With P(H) = ${pct(prior)}, P(E | H) = ${pct(hit)} and P(E | not H) = ${pct(fa)}, seeing E makes H ${pct(post)} likely. Drag the divider or the two strip heights to see what moves it most.`,
    vars: { ...vars, 'P(H|E)': round(post, 4) },
  });
}

const example = (id: string, label: string, input: BayesInput) => ({ id, label, make: () => input, sized: false });
const clamp = (v: number) => round(Math.min(1 - STEP, Math.max(STEP, v)), 2);
const clamp01 = (v: number) => round(Math.min(1, Math.max(0, v)), 2);

export const bayes = defineAlgorithm<BayesInput, PlotState>({
  kind: 'algorithm',
  slug: 'bayes',
  view: 'plot',
  input: {
    examples: [
      example('rare-disease', 'Rare disease test', { story: 'disease', prior: 0.01, hit: 0.9, fa: 0.09 }),
      example('common', 'Common condition', { story: 'disease', prior: 0.3, hit: 0.9, fa: 0.09 }),
      example('spam', 'Spam word', { story: 'spam', prior: 0.5, hit: 0.4, fa: 0.02 }),
      example('useless', 'Useless evidence', { story: 'generic', prior: 0.2, hit: 0.5, fa: 0.5 }),
      example('against', 'Evidence against', { story: 'generic', prior: 0.6, hit: 0.2, fa: 0.7 }),
    ],
    custom: {
      label: 'Story (disease, spam, generic), then P(H), P(E | H), P(E | not H)',
      placeholder: 'e.g. disease: 0.01, 0.9, 0.09',
      parse: (text) => {
        const word = (text.toLowerCase().match(/[a-z]+/) ?? [''])[0];
        const story = STORY_IDS.includes(word as StoryId) ? (word as StoryId) : 'generic';
        const xs = numbersIn(text).map((x) => (/%/.test(text) ? x / 100 : x));
        if (xs.length !== 3) return { error: 'Give three probabilities: P(H), P(E | H) and P(E | not H).' };
        const [prior, hit, fa] = xs;
        if (!(prior >= STEP && prior <= 1 - STEP)) return { error: 'P(H) must be between 0.01 and 0.99.' };
        if ([hit, fa].some((p) => !(p >= 0 && p <= 1))) return { error: 'Probabilities must be between 0 and 1.' };
        if (hit === 0 && fa === 0) return { error: 'The evidence must be possible: P(E | H) and P(E | not H) can’t both be 0.' };
        return { value: { story, prior: round(prior, 2), hit: round(hit, 2), fa: round(fa, 2) } };
      },
      format: ({ story, prior, hit, fa }) => `${story}: ${plain(prior)}, ${plain(hit)}, ${plain(fa)}`,
    },
    drag: (input, handle, to) => {
      const next =
        handle === 'prior' ? { ...input, prior: clamp(to[0]) } : handle === 'hit' ? { ...input, hit: clamp01(to[1]) } : { ...input, fa: clamp01(to[1]) };
      // Keep the evidence possible.
      return next.hit === 0 && next.fa === 0 ? input : next;
    },
  },
  pseudocode,
  stats: [],
  legend: [
    { neutral: 'Not H, and no E' },
    { mark: 'key', label: 'H, but no E' },
    { mark: 'found', label: 'H and E' },
    { mark: 'reject', label: 'E without H (false alarms)' },
  ],
  run,
  content: {
    idea: 'Draw everyone as a square, split it by how common H is, then mark who shows the evidence E in each part. Once you know E happened, only the E strip is left, and the chance of H is simply the share of that strip that has H.',
    invariant: 'P(H | E) = P(E | H)·P(H) / P(E), where P(E) = P(E | H)·P(H) + P(E | not H)·P(not H). The posterior is the H share of the evidence strip: it depends on the prior as much as on how good the evidence is.',
    whenToUse: 'Whenever you update a belief with evidence: reading medical tests, spam filters (naive Bayes), A/B tests, diagnosing faults, and every probabilistic model that learns from data. Watch for rare hypotheses, where false alarms can outnumber true hits.',
    traits: [
      { label: 'Posterior = H share of the evidence', good: null },
      { label: 'Rare H: false alarms dominate', good: false },
      { label: 'Updates chain: posterior → prior', good: true },
    ],
    experiments: [
      { example: 'rare-disease', prompt: 'A 90%-accurate test, yet a positive means only about a 9% chance of disease: 89 false alarms against 9 real cases.' },
      { example: 'common', prompt: 'Same test, but the condition affects 30%: now a positive means about 81%. The prior did all the work.' },
      { example: 'useless', prompt: 'When E is just as likely with H as without it, the strip is level and nothing changes.' },
      { example: 'spam', prompt: 'The word appears in 40% of spam but only 2% of genuine mail, so seeing it makes spam 95% likely.' },
    ],
  },
});
