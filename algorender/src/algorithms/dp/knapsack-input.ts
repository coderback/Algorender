import type { InputSpec } from '@/engine/module';
import { createRng } from '@/engine/random';

export type Item = { w: number; v: number };
export type KnapsackInput = { items: Item[]; capacity: number };

/** Items are named A, B, C… in input order. */
export const itemName = (i: number) => String.fromCharCode(65 + i);

export type KnapsackLimits = { maxItems: number; maxWeight: number; maxValue: number; maxCapacity: number };

/** Custom input "w:v, w:v | capacity", shared by the 0/1 and fractional knapsacks. */
export function knapsackCustom(limits: KnapsackLimits): NonNullable<InputSpec<KnapsackInput>['custom']> {
  const { maxItems, maxWeight, maxValue, maxCapacity } = limits;
  return {
    label: `Items as weight:value, then | capacity (up to ${maxItems} items, capacity ≤ ${maxCapacity})`,
    placeholder: 'e.g. 6:10, 5:7, 5:7 | 10',
    parse: (text) => {
      const halves = text.split('|');
      if (halves.length !== 2) return { error: 'Write the items, then a "|", then the capacity, e.g. 6:10, 5:7 | 10.' };
      const capacity = Number(halves[1].trim());
      if (!Number.isInteger(capacity) || capacity < 1 || capacity > maxCapacity) {
        return { error: `The capacity must be a whole number from 1 to ${maxCapacity}.` };
      }
      const parts = halves[0].split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) return { error: 'Enter at least one item as weight:value.' };
      if (parts.length > maxItems) return { error: `Use at most ${maxItems} items.` };
      const items: Item[] = [];
      for (const part of parts) {
        const m = /^(\d+)\s*:\s*(\d+)$/.exec(part);
        if (!m) return { error: `"${part}" is not weight:value, e.g. 5:7.` };
        const w = Number(m[1]);
        const v = Number(m[2]);
        if (w < 1 || w > maxWeight) return { error: `Weights must be from 1 to ${maxWeight}.` };
        if (v > maxValue) return { error: `Values must be from 0 to ${maxValue}.` };
        items.push({ w, v });
      }
      return { value: { items, capacity } };
    },
    format: ({ items, capacity }) => `${items.map((it) => `${it.w}:${it.v}`).join(', ')} | ${capacity}`,
  };
}

/** Reproducible random items: `count` items with weights 1..maxWeight and values 1..maxValue. */
export function randomItems(seed: number, count: number, maxWeight: number, maxValue: number): Item[] {
  const rng = createRng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  return Array.from({ length: count }, () => ({ w: int(1, maxWeight), v: int(1, maxValue) }));
}
