import type { Checkpoint } from '@/engine/types';

export const YES_NO = ['Yes', 'No'] as const;

const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const sup = (n: number) => [...String(n)].map((d) => SUPERSCRIPT[Number(d)]).join('');

/**
 * Polynomial string hash: the character codes read as digits of a base-`base`
 * number, h = c₀·b^(n−1) + … + c_(n−1). Exact (no overflow) for the short keys
 * the demos allow, so the numbers on screen are the real ones.
 */
export function polyHash(key: string, base = 31): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = h * base + key.charCodeAt(i);
  return h;
}

/** The same sum written out, e.g. "99·31² + 97·31 + 116". */
export function polyTerms(key: string, base = 31): string {
  const n = key.length;
  return Array.from({ length: n }, (_, i) => {
    const p = n - 1 - i;
    const c = key.charCodeAt(i);
    return p === 0 ? `${c}` : p === 1 ? `${c}·${base}` : `${c}·${base}${sup(p)}`;
  }).join(' + ');
}

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

/** Smallest prime greater than n. */
export function nextPrime(n: number): number {
  let p = n + 1;
  while (!isPrime(p)) p++;
  return p;
}

/** "Which bucket?" choices: the right one plus plausible slips (last digit, neighbours), sorted ascending. */
export function bucketChoices(bucket: number, m: number, h: number): Pick<Checkpoint, 'choices' | 'answer'> {
  const candidates = [h % 10, (bucket + 1) % m, (bucket + m - 2) % m, Math.floor(h / m) % m, (bucket + 3) % m];
  const values = [...new Set([bucket, ...candidates])].slice(0, 4).sort((a, b) => a - b);
  return { choices: values.map(String), answer: values.indexOf(bucket) };
}

export const ratio = (a: number, b: number) => (a / b).toFixed(2);

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export function listText(values: readonly (string | number)[]): string {
  if (values.length <= 1) return values.join('');
  return `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`;
}
