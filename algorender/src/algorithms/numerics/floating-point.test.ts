import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { expectGoodPlotTrace, readout, traceOf } from '@/viz/plot/testing';
import type { BitsPart, PlotState } from '@/viz/plot/types';
import { bitsOf, decode, exactDecimal, floatingPoint, fromBits, ulp } from './floating-point';

const bitsPart = (state: PlotState) => state.parts.find((p): p is BitsPart => p.kind === 'bits')!;
const patternOf = (state: PlotState) => bitsPart(state).bits.map((b) => b.value).join('');
/** The text a float32 value would be typed as. */
const typed = (x: number) => (Object.is(x, -0) ? '-0' : String(x));

describe('floating-point', () => {
  it('plays every example as a good trace', () => {
    for (const ex of floatingPoint.input.examples) expectGoodPlotTrace(floatingPoint, traceOf(floatingPoint, ex.make({ seed: 1, size: 0 })).frames);
  });

  it('reads the same bits as a Float32Array, and decodes them back to the value', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (pattern) => {
        const x = fromBits(pattern);
        const array = new Uint32Array(new Float32Array([x]).buffer);
        if (Number.isNaN(x)) {
          expect(decode(pattern).kind).toBe('nan');
          return;
        }
        expect(bitsOf(x)).toBe(array[0]);
        expect(bitsOf(x)).toBe(pattern);
        const { sign, e, f, kind } = decode(pattern);
        if (kind === 'infinity') {
          expect(x).toBe(sign ? -Infinity : Infinity);
          return;
        }
        const significand = kind === 'normal' ? 1 + f / 2 ** 23 : f / 2 ** 23;
        expect((sign ? -1 : 1) * significand * 2 ** (Math.max(e, 1) - 127)).toBe(x);
        // The exact decimal parses back to the same double, which is the float32 itself.
        expect(Number(exactDecimal(pattern)!.replace('−', '-'))).toBe(x);
      }),
      { numRuns: 500 },
    );
  });

  it('shows the bit pattern of the rounded value in the trace', () => {
    fc.assert(
      fc.property(fc.float({ noNaN: true }), (x) => {
        const frames = traceOf(floatingPoint, { text: typed(x) }).frames;
        expect(patternOf(frames.at(-1)!.state)).toBe(bitsOf(x).toString(2).padStart(32, '0'));
      }),
      { numRuns: 120 },
    );
  });

  it('writes stored values out exactly', () => {
    expect(exactDecimal(bitsOf(0.1))).toBe('0.100000001490116119384765625');
    expect(exactDecimal(bitsOf(-2.5))).toBe('−2.5');
    expect(exactDecimal(bitsOf(16777217))).toBe('16777216');
    expect(exactDecimal(bitsOf(Infinity))).toBeNull();
    expect(decode(bitsOf(1e-40)).kind).toBe('subnormal');
    expect(decode(bitsOf(-0))).toEqual({ sign: 1, e: 0, f: 0, kind: 'zero' });
  });

  it('measures the gap to the next float', () => {
    expect(ulp(bitsOf(1))).toBe(2 ** -23);
    expect(ulp(bitsOf(16777216))).toBe(2);
    expect(ulp(bitsOf(0))).toBe(2 ** -149);
    expect(ulp(bitsOf(1e-40))).toBe(2 ** -149);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0x7f7ffffe }), (b) => {
        expect(fromBits(b + 1) - fromBits(b)).toBe(ulp(b));
      }),
    );
  });

  it('says whether the number asked for is stored exactly', () => {
    const stored = (text: string) => {
      const frames = traceOf(floatingPoint, { text }).frames;
      const q = frames.find((f) => f.line === 3)!.checkpoint;
      return q ? q.choices[q.answer] : undefined;
    };
    expect(stored('0.1')).toBe('No');
    expect(stored('-2.5')).toBe('Yes');
    expect(stored('16777217')).toBe('No');
    expect(stored('16777216')).toBe('Yes');
    expect(stored('0.1 + 0.2')).toBe('No');
    expect(stored('0.5 + 0.25')).toBe('Yes');
    expect(stored('1e39')).toBe('No');
    expect(stored('-0')).toBe('Yes');
    expect(stored('Infinity')).toBeUndefined();
  });

  it('shows the stored value and the gap in its readouts', () => {
    const end = (text: string) => traceOf(floatingPoint, { text }).frames;
    const tenth = end('0.1');
    expect(readout(tenth.at(-1)!.state, 'stored')).toBe('0.100000001490116119384765625');
    const gapOf = (text: string) => readout(end(text).find((f) => f.line === 5)!.state, 'gap');
    expect(gapOf('1')).toBe('1.192e−7');
    expect(gapOf('16777217')).toBe('2');
    expect(gapOf('0')).toBe('1.401e−45');
    expect(readout(end('-0').at(-1)!.state, 'stored')).toBe('−0');
    expect(readout(end('NaN').at(-1)!.state, 'stored')).toBe('NaN');
    expect(end('Infinity').some((f) => f.line === 5)).toBe(false);
  });

  it('round-trips custom input and rejects nonsense', () => {
    const { custom } = floatingPoint.input;
    const texts = ['0.1', '-2.5', '1e-40', '1e+21', '-0', 'Infinity', '-inf', '−∞', 'nan', '0.1 + 0.2', '0.3 + -0.1', '+3', '.5'];
    for (const text of texts) {
      const parsed = custom!.parse(text);
      if (!('value' in parsed)) throw new Error(`${text}: ${parsed.error}`);
      expect(custom!.parse(custom!.format(parsed.value))).toEqual(parsed);
    }
    expect(custom!.parse('-inf')).toEqual({ value: { text: '-Infinity' } });
    expect(custom!.parse('0.10')).toEqual({ value: { text: '0.1' } });
    fc.assert(
      fc.property(fc.float({ noNaN: true }), (x) => {
        const parsed = custom!.parse(typed(x));
        expect(parsed).toEqual({ value: { text: typed(x) } });
      }),
    );
    for (const text of ['', 'abc', '1.2.3', '1 + 2 + 3', 'Infinity + 1', '0x10', '1,5', '+']) expect(custom!.parse(text), text).toHaveProperty('error');
  });
});
