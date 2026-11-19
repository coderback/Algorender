import type { Estimate } from '@/interview/design';
import { formatBytes, formatCount, SECONDS_PER_DAY } from '@/systems/design/estimation';

// Builders for interview variants' estimates. The answer is always computed
// from the facts the brief gives, and the working says how, so no answer is
// ever typed. The peak estimate is the rate the simulator runs (a variant
// sets its workload's rps from it).

/** Requests a second at the peak, from a day's total and how much busier the peak is than the average. */
export function peakFromDay(perDay: number, factor: number, what = 'requests'): Estimate {
  const average = perDay / SECONDS_PER_DAY;
  const answer = average * factor;
  return {
    id: 'peak',
    question: `At the busiest moment, how many ${what} a second does the service get?`,
    unit: 'count',
    unitLabel: `${what} a second`,
    answer,
    rate: true,
    working: [
      `${formatCount(perDay)} a day ÷ 86,400 seconds ≈ ${formatCount(average)} a second on average.`,
      factor === 1 ? 'The traffic is steady, so the peak is the average.' : `The peak is ${factor}× the average: ≈ ${formatCount(answer)} a second.`,
    ],
  };
}

/** Requests a second from a population each sending one every so many seconds. */
export function peakFromPopulation(count: number, everySeconds: number, who: string, what = 'requests'): Estimate {
  const answer = count / everySeconds;
  return {
    id: 'peak',
    question: `At the busiest moment, how many ${what} a second does the service get?`,
    unit: 'count',
    unitLabel: `${what} a second`,
    answer,
    rate: true,
    working: [`${formatCount(count)} ${who}, one request every ${everySeconds} seconds each: ${formatCount(count)} ÷ ${everySeconds} ≈ ${formatCount(answer)} a second.`],
  };
}

/** Bytes a second leaving the service: responses a second times the size of each. */
export function bandwidth(perSecond: number, bytesEach: number, what: string): Estimate {
  const answer = perSecond * bytesEach;
  return {
    id: 'bandwidth',
    question: `At that rate, how much data a second leaves the service in ${what}?`,
    unit: 'bytes/s',
    unitLabel: 'bytes a second',
    answer,
    working: [`${formatCount(perSecond)} a second × ${formatBytes(bytesEach)} each ≈ ${formatBytes(answer, true)}.`],
  };
}

/** Storage: records a day, the bytes in each, kept for so many days. */
export function storage(perDay: number, bytesEach: number, days: number, what: string, period: string): Estimate {
  const answer = perDay * bytesEach * days;
  return {
    id: 'storage',
    question: `How much storage do ${what} take over ${period}?`,
    unit: 'bytes',
    unitLabel: 'bytes',
    answer,
    working: [
      `${formatCount(perDay)} a day × ${formatBytes(bytesEach)} ≈ ${formatBytes(perDay * bytesEach)} a day.`,
      `× ${formatCount(days)} days ≈ ${formatBytes(answer)}.`,
    ],
  };
}

/** Memory or storage for a set of things: how many, times the bytes in each. */
export function totalSize(count: number, bytesEach: number, what: string): Estimate {
  const answer = count * bytesEach;
  return {
    id: 'size',
    question: `How much space do all the ${what} take together?`,
    unit: 'bytes',
    unitLabel: 'bytes',
    answer,
    working: [`${formatCount(count)} × ${formatBytes(bytesEach)} ≈ ${formatBytes(answer)}.`],
  };
}

/** A rate the simulator can run: the estimate rounded to the nearest hundred. */
export const rateOf = (e: Estimate) => Math.round(e.answer / 100) * 100;
