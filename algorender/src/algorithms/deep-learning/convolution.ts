import { defineAlgorithm } from '@/engine/module';
import type { Frame } from '@/engine/types';
import { ask, askInOrder, numbersIn, plotFrame } from '@/viz/plot/frame';
import { fmt } from '@/viz/plot/geometry';
import type { ImageBox, ImagePart, PlotPart, PlotState } from '@/viz/plot/types';

// A 3×3 kernel slides over a small grayscale picture: at every position the
// nine pixels under it are multiplied by the nine weights and added up, and
// the sum becomes one pixel of the feature map. Then ReLU drops the negative
// responses and 2×2 max-pooling keeps the strongest response in each block.

export const K = 3;

/** Pictures drawn as text: # is white (1), + is gray (0.5), . is black (0). */
const ART = {
  square: [
    '............',
    '............',
    '............',
    '...######...',
    '...######...',
    '...######...',
    '...######...',
    '...######...',
    '...######...',
    '............',
    '............',
    '............',
  ],
  seven: [
    '............',
    '............',
    '..########..',
    '..########..',
    '.......##...',
    '......##....',
    '.....##.....',
    '.....##.....',
    '....##......',
    '....##......',
    '............',
    '............',
  ],
  stripe: [
    '#+..........',
    '+#+.........',
    '.+#+........',
    '..+#+.......',
    '...+#+......',
    '....+#+.....',
    '.....+#+....',
    '......+#+...',
    '.......+#+..',
    '........+#+.',
    '.........+#+',
    '..........+#',
  ],
} as const;

export type PictureId = keyof typeof ART;
export const PICTURE_IDS = Object.keys(ART) as PictureId[];
const PICTURE_NAMES: Record<PictureId, string> = { square: 'a white square', seven: 'a handwritten-style 7', stripe: 'a diagonal stripe' };

export type Picture = { n: number; pixels: number[] };

export function picture(id: PictureId): Picture {
  const rows = ART[id];
  return { n: rows.length, pixels: rows.flatMap((row) => [...row].map((ch) => (ch === '#' ? 1 : ch === '+' ? 0.5 : 0))) };
}

export const KERNELS = {
  vertical: [-1, 0, 1, -2, 0, 2, -1, 0, 1],
  horizontal: [-1, -2, -1, 0, 0, 0, 1, 2, 1],
  blur: [1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9],
  sharpen: [0, -1, 0, -1, 5, -1, 0, -1, 0],
} as const satisfies Record<string, readonly number[]>;

export type KernelId = keyof typeof KERNELS;
export const KERNEL_IDS = Object.keys(KERNELS) as KernelId[];
const KERNEL_NAMES: Record<KernelId, string> = {
  vertical: 'the vertical-edge (Sobel) kernel',
  horizontal: 'the horizontal-edge (Sobel) kernel',
  blur: 'the box-blur kernel',
  sharpen: 'the sharpen kernel',
};

export type ConvInput = { picture: PictureId; kernel: readonly number[]; stride: 1 | 2 };

/** The preset a kernel matches, if any. */
export const kernelId = (kernel: readonly number[]): KernelId | undefined =>
  KERNEL_IDS.find((id) => KERNELS[id].every((w, i) => w === kernel[i]));

/** Output side length of a valid (unpadded) convolution: ⌊(n − k)/s⌋ + 1. */
export const outputSize = (n: number, k: number, s: number) => Math.floor((n - k) / s) + 1;

/** The k×k patch of an n-wide image whose top-left corner is (r, c). */
export function patchAt(image: readonly number[], n: number, r: number, c: number, k = K): number[] {
  const out: number[] = [];
  for (let dr = 0; dr < k; dr++) for (let dc = 0; dc < k; dc++) out.push(image[(r + dr) * n + c + dc]);
  return out;
}

const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, i) => s + v * b[i], 0);

/** Valid cross-correlation (what deep learning calls convolution), row by row from the top. */
export function convolve(image: readonly number[], n: number, kernel: readonly number[], stride: number, k = K): { m: number; out: number[] } {
  const m = outputSize(n, k, stride);
  const out: number[] = [];
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) out.push(dot(patchAt(image, n, i * stride, j * stride, k), kernel));
  return { m, out };
}

export const relu = (map: readonly number[]) => map.map((v) => Math.max(0, v));

/** 2×2 max-pooling with stride 2; a leftover last row or column (odd size) is dropped. */
export function maxPool(map: readonly number[], m: number): { p: number; out: number[] } {
  const p = Math.floor(m / 2);
  const out: number[] = [];
  for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) out.push(Math.max(...blockAt(map, m, i, j)));
  return { p, out };
}

const blockAt = (map: readonly number[], m: number, i: number, j: number) => [map[2 * i * m + 2 * j], map[2 * i * m + 2 * j + 1], map[(2 * i + 1) * m + 2 * j], map[(2 * i + 1) * m + 2 * j + 1]];

// ───────────────────────────── trace ─────────────────────────────

const pseudocode = [
  'm ← ⌊(n − k)/s⌋ + 1        output size',
  'for each output cell (i, j):',
  '  patch ← k×k pixels at (s·i, s·j)',
  '  out[i][j] ← Σ patch ⊙ kernel',
  'relu ← max(out, 0)',
  'pool ← max of each 2×2 block',
];

/** Below this a response counts as "about zero". */
const ZERO = 0.05;
const sign = (v: number) => (Math.abs(v) < ZERO ? 'About zero' : v > 0 ? 'Positive' : 'Negative');
const num = (v: number) => fmt(v, 2);
const cellText = (v: number) => fmt(v, 1);

function* run(input: ConvInput): Generator<Frame<PlotState>> {
  const { n, pixels } = picture(input.picture);
  const kernel = input.kernel;
  const s = input.stride;
  const { m, out } = convolve(pixels, n, kernel, s);
  const maxAbs = Math.max(1e-9, ...out.map(Math.abs));
  const kMax = Math.max(1e-9, ...kernel.map(Math.abs));
  const name = kernelId(kernel);
  const kernelName = name ? KERNEL_NAMES[name] : 'your kernel';
  // With no negative weights every sum is at least 0, so ask for the value instead of its sign.
  const allPositive = kernel.every((w) => w >= 0);

  let positions = 0;
  const stats = () => ({ positions, multiplies: positions * K * K });
  const done = new Set<number>();

  const inputImage = (box?: ImageBox): ImagePart => ({
    kind: 'image',
    id: 'input',
    label: `Input, ${n} × ${n}`,
    width: n,
    height: n,
    pixels,
    scale: 'gray',
    size: 216,
    ...(box && { boxes: [box] }),
  });
  const kernelImage: ImagePart = {
    kind: 'image',
    id: 'kernel',
    label: 'Kernel (9 weights)',
    width: K,
    height: K,
    pixels: kernel.map((w) => w / kMax),
    values: kernel.map((w) => fmt(w, 2)),
    scale: 'signed',
    size: 108,
  };
  const smallImage = (id: string, label: string, values: readonly number[] | null, scale: 'gray' | 'signed', norm = 1): ImagePart => ({
    kind: 'image',
    id,
    label,
    width: K,
    height: K,
    pixels: values ? values.map((v) => v / norm) : Array(K * K).fill(0),
    values: values ? values.map((v) => fmt(v, 2)) : Array(K * K).fill(''),
    scale,
    size: 108,
  });
  const featureImage = (o: { cell?: number; id?: string; label?: string; map?: readonly number[]; filled?: (k: number) => boolean; box?: ImageBox } = {}): ImagePart => {
    const map = o.map ?? out;
    const filled = o.filled ?? ((k: number) => done.has(k));
    return {
      kind: 'image',
      id: o.id ?? 'feature',
      label: o.label ?? `Feature map, ${m} × ${m}`,
      width: m,
      height: m,
      pixels: map.map((v, k) => (filled(k) ? v / maxAbs : 0)),
      values: map.map((v, k) => (filled(k) ? cellText(v) : '')),
      scale: 'signed',
      size: m <= 5 ? 160 : 240,
      boxes: o.box ? [o.box] : o.cell !== undefined ? [{ id: 'cell', x: o.cell % m, y: Math.floor(o.cell / m), w: 1, h: 1, mark: 'key' }] : undefined,
    };
  };
  const windowBox = (i: number, j: number): ImageBox => ({ id: 'window', x: j * s, y: i * s, w: K, h: K, mark: 'key' });
  const readouts = (extra: { id: string; label: string; value: string }[] = []): PlotPart => ({
    kind: 'readouts',
    id: 'readouts',
    label: 'Convolution',
    items: [
      { id: 'kernel', label: 'kernel', value: name ?? 'custom' },
      { id: 'stride', label: 'stride', value: String(s) },
      { id: 'size', label: 'output', value: `${m} × ${m}` },
      ...extra,
    ],
  });
  const sliding = (i: number, j: number, o: { products: boolean }) => {
    const patch = patchAt(pixels, n, i * s, j * s);
    const prod = patch.map((v, k) => v * kernel[k]);
    return [
      inputImage(windowBox(i, j)),
      kernelImage,
      smallImage('patch', 'Pixels under the window', patch, 'gray'),
      smallImage('products', 'Pixel × weight', o.products ? prod : null, 'signed', Math.max(1e-9, ...prod.map(Math.abs))),
      featureImage({ cell: i * m + j }),
      readouts([{ id: 'sum', label: 'sum', value: o.products ? num(out[i * m + j]) : '?' }]),
    ];
  };

  // 1. The setup, and the output size.
  const wrongSizes = [n, n - 1, m + 1, m - 1, outputSize(n, K, s === 1 ? 2 : 1)].filter((v) => v > 0 && v !== m).map((v) => `${v} × ${v}`);
  yield plotFrame([inputImage(), kernelImage, readouts()], {
    line: null,
    note: `The input is ${PICTURE_NAMES[input.picture]}, ${n} × ${n} pixels (0 is black, 1 white). We will slide ${kernelName}, a 3 × 3 grid of weights, over it ${s === 1 ? 'one pixel at a time' : 'two pixels at a time (stride 2)'}, and never past the edge.`,
    vars: { n, k: K, s },
    stats: stats(),
    checkpoint: ask('How big will the feature map be?', `${m} × ${m}`, wrongSizes),
  });
  yield plotFrame([inputImage(windowBox(0, 0)), kernelImage, featureImage(), readouts()], {
    line: 0,
    note: `The window fits in ${m} positions across: ${s === 1 ? `it starts at column 0 and stops at column ${n - K}, the last place all 3 columns fit, so ${n} − 3 + 1 = ${m}` : `starting at column 0 and jumping by 2 while all 3 columns fit gives ⌊(${n} − 3)/2⌋ + 1 = ${m}`}. Same down, so the feature map is ${m} × ${m}.`,
    vars: { n, k: K, s, m },
    stats: stats(),
  });

  // 2. Pick the positions to show one by one: the first, and in two rows with real responses, the strongest each way and the quietest.
  const strong = (i: number) => out.slice(i * m, i * m + m).some((v) => Math.abs(v) >= 0.25 * maxAbs);
  const rowsWith = Array.from({ length: m }, (_, i) => i).filter(strong);
  // The second row shown in detail: preferably one with the strongest opposite (negative) response, else the strongest one.
  const rowOf = (k: number) => (k >= 0 ? Math.floor(k / m) : undefined);
  const lowest = Math.min(...out);
  const second = [lowest < -ZERO ? rowOf(out.indexOf(lowest)) : undefined, rowOf(out.findIndex((v) => Math.abs(v) === maxAbs)), rowsWith[1]].find(
    (r) => r !== undefined && r !== rowsWith[0],
  );
  const detailRows = [rowsWith[0], second].filter((r): r is number => r !== undefined);
  const detail = new Map<number, number[]>([[0, [0]]]);
  for (const r of detailRows) {
    const row = out.slice(r * m, r * m + m);
    // A quiet spot is only worth a stop when there is something bright under the window that the weights cancel.
    const cancels = row.findIndex((v, c) => Math.abs(v) < ZERO && patchAt(pixels, n, r * s, c * s).some((px) => px > 0));
    const picks = [row.indexOf(Math.max(...row)), row.indexOf(Math.min(...row)), cancels].filter((c) => c >= 0);
    detail.set(r, [...new Set([...(detail.get(r) ?? []), ...picks])].sort((a, b) => a - b));
  }

  const fill = (i: number, j: number) => {
    done.add(i * m + j);
    positions++;
  };

  for (let i = 0; i < m; i++) {
    const cols = detail.get(i);
    if (!cols) {
      for (let j = 0; j < m; j++) fill(i, j);
      const row = out.slice(i * m, i * m + m);
      const hi = Math.max(...row);
      const lo = Math.min(...row);
      yield plotFrame(sliding(i, m - 1, { products: true }), {
        line: 3,
        note:
          Math.abs(hi) < ZERO && Math.abs(lo) < ZERO
            ? `Row ${i}: the window slides across flat patches, where the weights cancel or there is nothing bright, so the whole row is about 0.`
            : `Row ${i}: the same 9 weights again at all ${m} positions, giving responses from ${num(lo)} to ${num(hi)}.`,
        vars: { i, 'max in row': hi, 'min in row': lo },
        stats: stats(),
      });
      continue;
    }
    let j = 0;
    for (const c of cols) {
      const skipped: number[] = [];
      for (; j < c; j++) {
        fill(i, j);
        skipped.push(out[i * m + j]);
      }
      const patch = patchAt(pixels, n, i * s, c * s);
      const v = out[i * m + c];
      const first = positions === 0;
      const jumped = skipped.length
        ? `On the way, ${skipped.length === 1 ? `column ${c - 1} gave ${num(skipped[0])}` : `columns ${c - skipped.length} to ${c - 1} gave ${skipped.map(num).join(', ')}`}. `
        : '';
      const bright = patch.filter((p) => p > 0).length;
      yield plotFrame(sliding(i, c, { products: false }), {
        line: 2,
        note: first
          ? `Put the window on the top-left corner. Each of the 9 pixels under it gets multiplied by the weight on top of it, and the 9 products are added up.`
          : `${jumped}Now the window covers rows ${i * s}–${i * s + 2} and columns ${c * s}–${c * s + 2}, with ${bright === 0 ? 'no bright pixels' : `${bright} bright ${bright === 1 ? 'pixel' : 'pixels'}`} under it. Match each pixel with the weight above it.`,
        vars: { i, j: c, row: i * s, col: c * s },
        stats: stats(),
        checkpoint: allPositive
          ? ask('What will the window write here?', num(v), [num(patch.reduce((a, b) => a + b, 0)), num(Math.max(...patch)), num(v + kMax), num(Math.max(0, v - kMax))])
          : askInOrder('Will the sum here come out positive, negative or about zero?', ['Positive', 'About zero', 'Negative'], sign(v)),
      });
      fill(i, c);
      j = c + 1;
      const why =
        Math.abs(v) < ZERO
          ? bright === 0
            ? 'Nothing bright under the window, so nothing to respond to.'
            : patch.every((px, k) => px === 0 || kernel[k] === 0)
              ? 'The bright pixels under the window all sit on weights of 0, so they don’t count.'
              : 'The positive and negative weights cover equal brightness and cancel: the patch doesn’t look like the kernel’s pattern at all.'
          : name === 'vertical'
            ? v > 0
              ? 'Brighter on the right than the left: a dark-to-light vertical edge.'
              : 'Brighter on the left than the right: a light-to-dark vertical edge, so a negative response.'
            : name === 'horizontal'
              ? v > 0
                ? 'Brighter below than above: a horizontal edge going dark to light downwards.'
                : 'Brighter above than below: the bottom edge of something bright.'
              : name === 'blur'
                ? 'The blur kernel just averages the 9 pixels.'
                : name === 'sharpen'
                  ? 'Sharpen boosts the centre pixel and subtracts its four neighbours, exaggerating differences.'
                  : 'That is how strongly this patch matches the kernel’s pattern.';
      yield plotFrame(sliding(i, c, { products: true }), {
        line: 3,
        note: `${first ? `9 multiplications and 8 additions give ${num(v)}. The same 9 weights will be used at every position: that is weight sharing, why a convolution layer needs so few parameters. ` : `The products add up to ${num(v)}. `}${first ? '' : why}`,
        vars: { i, j: c, sum: Number(v.toFixed(4)) },
        stats: stats(),
      });
    }
    if (j < m) {
      const rest = out.slice(i * m + j, i * m + m);
      for (; j < m; j++) fill(i, j);
      yield plotFrame(sliding(i, m - 1, { products: true }), {
        line: 3,
        note: `The rest of row ${i}: ${rest.map(num).join(', ')}.`,
        vars: { i },
        stats: stats(),
      });
    }
  }

  // 3. The finished map, then ReLU.
  const negatives = out.filter((v) => v < -1e-12).length;
  const positivesCount = out.filter((v) => v > 1e-12).length;
  yield plotFrame([inputImage(), kernelImage, featureImage(), readouts()], {
    line: 1,
    note: `All ${m * m} positions done with the same 9 weights. The feature map is blue where the picture looks like the kernel’s pattern and would be orange where it looks like the opposite. Next comes ReLU, the activation function.`,
    vars: { m, positive: positivesCount, negative: negatives },
    stats: stats(),
    checkpoint: askInOrder('ReLU keeps max(value, 0). Will it change any value in this feature map?', ['Yes', 'No'], negatives > 0 ? 'Yes' : 'No'),
  });
  const r = relu(out);
  const reluImage = (box?: ImageBox) => featureImage({ id: 'relu', label: `After ReLU, ${m} × ${m}`, map: r, filled: () => true, box });
  yield plotFrame([inputImage(), featureImage(), reluImage(), readouts()], {
    line: 4,
    note:
      negatives > 0
        ? `ReLU replaced the ${negatives} negative values with 0 and kept the rest. A network keeps only "the pattern is here"; the opposite pattern needs its own kernel${name === 'vertical' || name === 'horizontal' ? ' (here, the same kernel with its signs flipped)' : ''}.`
        : `There was nothing negative, so ReLU changed nothing. With edge kernels it usually removes half the responses.`,
    vars: { removed: negatives },
    stats: stats(),
  });

  // 4. Max-pooling.
  const { p, out: pooled } = maxPool(r, m);
  const poolImage = (filled: (k: number) => boolean, cell?: number): ImagePart => ({
    kind: 'image',
    id: 'pooled',
    label: `Max-pooled, ${p} × ${p}`,
    width: p,
    height: p,
    pixels: pooled.map((v, k) => (filled(k) ? v / maxAbs : 0)),
    values: pooled.map((v, k) => (filled(k) ? cellText(v) : '')),
    scale: 'signed',
    size: Math.min(160, 32 * p),
    boxes: cell !== undefined ? [{ id: 'cell', x: cell % p, y: Math.floor(cell / p), w: 1, h: 1, mark: 'key' }] : undefined,
  });
  const blockBox = (k: number): ImageBox => ({ id: 'block', x: 2 * (k % p), y: 2 * Math.floor(k / p), w: 2, h: 2, mark: 'key' });
  if (p === 0) return;
  const blocks = Array.from({ length: p * p }, (_, k) => blockAt(r, m, Math.floor(k / p), k % p));
  const quiz = blocks.findIndex((b) => new Set(b.map(cellText)).size >= 2);
  const leftover = m % 2 === 1 ? ` ${m} is odd, so the last row and column don’t fill a block and are dropped.` : '';
  let pooledDone = 0;
  if (quiz >= 0) {
    const b = blocks[quiz];
    yield plotFrame([featureImage(), reluImage(blockBox(quiz)), poolImage(() => false), readouts()], {
      line: 5,
      note: `Max-pooling cuts the map into 2 × 2 blocks and keeps one number from each, so ${m} × ${m} becomes ${p} × ${p}.${leftover} The highlighted block holds ${b.map(cellText).join(', ')}.`,
      vars: { p },
      stats: stats(),
      checkpoint: ask('Which value of this block does max-pooling keep?', cellText(Math.max(...b)), b.map(cellText)),
    });
    pooledDone = quiz + 1;
    yield plotFrame([featureImage(), reluImage(blockBox(quiz)), poolImage((k) => k < pooledDone, quiz), readouts()], {
      line: 5,
      note: `It keeps the largest, ${cellText(Math.max(...b))}: "the pattern is somewhere in this block, this strongly". Where exactly inside the block no longer matters, which makes the network tolerant to small shifts.${quiz > 0 ? ' The blocks before it each held one repeated value, so that is what they keep.' : ''}`,
      vars: { p, kept: Number(Math.max(...b).toFixed(4)) },
      stats: stats(),
    });
  }
  for (let row = Math.floor(pooledDone / p); row < p; row++) {
    const end = (row + 1) * p;
    if (pooledDone >= end) continue;
    pooledDone = end;
    yield plotFrame([featureImage(), reluImage(blockBox(end - 1)), poolImage((k) => k < pooledDone, end - 1), readouts()], {
      line: 5,
      note: `Pooled row ${row}: ${pooled.slice(row * p, end).map(cellText).join(', ')}.${quiz < 0 && row === 0 ? ` Each 2 × 2 block keeps its largest value, so ${m} × ${m} becomes ${p} × ${p}.${leftover}` : ''}`,
      vars: { row },
      stats: stats(),
    });
  }
  yield plotFrame([inputImage(), kernelImage, reluImage(), poolImage(() => true), readouts()], {
    line: null,
    note: `From ${n * n} pixels to ${p * p} numbers that say where ${name === 'blur' ? 'the picture is bright' : name === 'sharpen' ? 'the picture has detail' : 'this kind of edge is'}, roughly. A real convolution layer runs dozens of kernels side by side, learns their 9 weights by backpropagation instead of being given them, and stacks layers so later kernels detect patterns of patterns: edges, then corners, then shapes.`,
    vars: { pixels: n * n, kept: p * p },
    stats: stats(),
  });
}

// ───────────────────────────── module ─────────────────────────────

const example = (id: string, label: string, pic: PictureId, k: KernelId, stride: 1 | 2) => ({
  id,
  label,
  sized: false,
  make: (): ConvInput => ({ picture: pic, kernel: [...KERNELS[k]], stride }),
});

const plainNum = (v: number) => String(v);

export const convolution = defineAlgorithm<ConvInput, PlotState>({
  kind: 'algorithm',
  slug: 'convolution',
  view: 'plot',
  input: {
    examples: [
      example('vertical-edges', 'Vertical edges of a square', 'square', 'vertical', 1),
      example('horizontal-edges', 'Horizontal edges of a 7', 'seven', 'horizontal', 1),
      example('blur', 'Blur a 7', 'seven', 'blur', 1),
      example('sharpen', 'Sharpen a stripe', 'stripe', 'sharpen', 1),
      example('stride-2', 'Stride 2', 'square', 'vertical', 2),
    ],
    custom: {
      label: `Picture (${PICTURE_IDS.join(', ')}), kernel (${KERNEL_IDS.join(', ')}, or 9 weights in brackets) and stride (1 or 2)`,
      placeholder: 'e.g. picture = seven, kernel = [0 1 0; 1 -4 1; 0 1 0], stride = 1',
      parse: (text) => {
        const t = text.toLowerCase();
        const pic = t.match(/picture\s*=\s*([a-z]+)/)?.[1] as PictureId | undefined;
        if (!pic || !PICTURE_IDS.includes(pic)) return { error: `Name the picture: picture = ${PICTURE_IDS.join(', ')}.` };
        let kernel: number[];
        const listed = t.match(/kernel\s*=\s*\[([^\]]*)\]/)?.[1];
        const named = t.match(/kernel\s*=\s*([a-z]+)/)?.[1] as KernelId | undefined;
        if (listed !== undefined) {
          kernel = numbersIn(listed);
          if (kernel.length !== K * K) return { error: `A kernel needs exactly 9 weights, e.g. [1 0 -1; 2 0 -2; 1 0 -1]; that has ${kernel.length}.` };
          if (kernel.some((w) => !Number.isFinite(w) || Math.abs(w) > 10)) return { error: 'Keep each weight between −10 and 10.' };
        } else if (named && KERNEL_IDS.includes(named)) kernel = [...KERNELS[named]];
        else return { error: `Give the kernel: kernel = ${KERNEL_IDS.join(', ')}, or 9 weights in brackets.` };
        const stride = Number(t.match(/stride\s*=\s*(\d+)/)?.[1] ?? 1);
        if (stride !== 1 && stride !== 2) return { error: 'The stride must be 1 or 2.' };
        return { value: { picture: pic, kernel: kernel.map((w) => w + 0), stride } };
      },
      format: ({ picture: pic, kernel, stride }) => {
        const id = kernelId(kernel);
        const k = id ?? `[${[0, 1, 2].map((r) => kernel.slice(3 * r, 3 * r + 3).map(plainNum).join(' ')).join('; ')}]`;
        return `picture = ${pic}, kernel = ${k}, stride = ${stride}`;
      },
    },
  },
  pseudocode,
  stats: [
    { key: 'positions', label: 'Window positions' },
    { key: 'multiplies', label: 'Multiplications' },
  ],
  legend: [
    { neutral: 'Pale cells: no response yet, or exactly 0' },
    { mark: 'compare', label: 'Blue: a positive response (the pattern is here)' },
    { mark: 'swap', label: 'Orange: a negative response (the opposite pattern)' },
    { mark: 'key', label: 'The window and the cell it writes' },
  ],
  run,
  content: {
    idea: 'A convolution slides a small grid of weights (a kernel) over an image. At each position it multiplies the pixels under the window by the weights and adds them up, giving one number of the output, the feature map. The map is large where the image looks like the kernel’s pattern, such as an edge. ReLU then keeps only the positive responses, and max-pooling shrinks the map by keeping the strongest response in each 2×2 block.',
    invariant: 'Every output cell uses the same 9 weights (weight sharing), so a pattern is detected the same way wherever it appears. An n×n image with a k×k kernel and stride s gives a ⌊(n − k)/s⌋ + 1 square map; each cell depends only on the k×k patch under it (its receptive field).',
    whenToUse: 'Convolutional layers are the workhorse of image models (and of audio and other grid-like data): they need far fewer parameters than a fully connected layer and are translation-equivariant. Hand-made kernels like Sobel and blur come from classic image processing; a CNN learns its kernels by backpropagation.',
    traits: [
      { label: 'Same 9 weights everywhere', good: true },
      { label: 'Finds a pattern wherever it is', good: true },
      { label: 'Shrinks the image without padding', good: null },
      { label: 'Pooling throws away exact position', good: null },
    ],
    experiments: [
      { example: 'vertical-edges', prompt: 'Which side of the square responds positively and which negatively? Why are the top and bottom edges nearly silent?' },
      { example: 'horizontal-edges', prompt: 'The same idea turned 90°: now the top of the 7 lights up and the vertical stroke barely does.' },
      { example: 'blur', prompt: 'All 9 weights are 1/9, so every output is an average. Nothing goes negative, so ReLU has nothing to do.' },
      { example: 'sharpen', prompt: 'A big centre weight minus the neighbours: the stripe’s ridge gets stronger and its sides go negative.' },
      { example: 'stride-2', prompt: 'Jumping two pixels at a time makes a 5×5 map instead of 10×10, and pooling then drops a leftover row.' },
    ],
  },
});
