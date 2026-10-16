import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { describeFrames, describeMemory, describeObjects, objectNames } from './describe';
import { fixture, MEMORY_FIXTURES } from './fixtures';
import { arrowPath, clampInto, framePath, lanePath, targetPoint, targetPointRight } from './geometry';
import { MemoryView } from './MemoryView';
import { extendOrder, NO_ORDER, orderHeap } from './order';
import type { MemoryState } from './types';

const render = (state: MemoryState) => renderToStaticMarkup(createElement(MemoryView, { state }));

/** Markup back to text, for comparing with the descriptions. */
const text = (html: string) =>
  html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const count = (html: string, s: string) => html.split(s).length - 1;

describe('describeMemory', () => {
  it('reads a straight-line program: names, then objects with their contents', () => {
    expect(describeMemory(fixture('straight-line').state)).toBe(
      'Global frame, the current frame: nums refers to list 1. List 1 (changed) holds 3, 1, 2, 4.',
    );
  });

  it('numbers the calls of a recursive function and says which one is returning what', () => {
    expect(describeFrames(fixture('recursion').state)).toBe(
      'Global frame: fact refers to function fact. fact (call 1): n is 3. fact (call 2): n is 2. ' +
        'fact (call 3), the current frame, returning 1: n is 1.',
    );
    expect(describeObjects(fixture('recursion').state)).toBe('Function fact.');
  });

  it('gives two names for one list the same object name', () => {
    expect(describeMemory(fixture('aliasing').state)).toBe(
      'Global frame, the current frame: a refers to list 1, b refers to list 1. List 1 holds 1, 2, 3, 4.',
    );
  });

  it('reads dicts, instances and nested lists, numbering objects but not functions', () => {
    const state = fixture('objects').state;
    expect(describeFrames(state)).toBe(
      'Global frame, the current frame: Point refers to class Point, p refers to Point 1, ages refers to dict 3, grid refers to list 4 (changed).',
    );
    expect(describeObjects(state)).toBe(
      'Class Point. Point 1: x is 1, y is 2, tags refers to list 2. List 2 holds \'start\', \'corner\'. ' +
        "Dict 3 maps 'ann' to 31, 'bob' to 27. List 4 (new) holds list 5, list 6. List 5 (new) holds 1, 2. List 6 (new) holds 3, 4.",
    );
  });

  it('counts the items left out of a long list', () => {
    const said = describeMemory(fixture('long-list').state);
    expect(said).toContain('squares refers to Array 1, label is "squares", done is false (changed).');
    expect(said).toContain('Array 1 holds 0, 1, 4, 9, 16,');
    expect(said).toMatch(/576, and 75 more\.$/);
  });

  it('marks changed names and new objects', () => {
    expect(describeMemory(fixture('fresh-and-changed').state)).toBe(
      'Global frame: split_first refers to function split_first, nums refers to list 1. ' +
        'split_first, the current frame: nums refers to list 1, head is 4 (changed), rest refers to list 2 (changed). ' +
        'Function split_first. List 1 holds 4, 8, 15, 16. List 2 (new) holds 8, 15, 16.',
    );
  });

  it('reads tuples, sets, empty lists and None', () => {
    expect(describeObjects(fixture('tuple-and-set').state)).toBe("Tuple 1 holds 3, 4. Set 2 holds 'a', 'b'. List 3 is empty.");
    expect(describeFrames(fixture('tuple-and-set').state)).toContain('found is None, ok is True (changed).');
  });

  it('says so when a reference points at an object the step left out, or a frame has no names', () => {
    const state: MemoryState = {
      frames: [{ id: 'f0', fn: 'Global frame', locals: [], active: false }, { id: 'f1', fn: 'go', locals: [{ name: 'x', value: { ref: 'gone' }, changed: false }], active: true }],
      heap: [],
      output: [],
    };
    expect(describeMemory(state)).toBe('Global frame: no names yet. go, the current frame: x refers to an object not shown. No objects.');
  });

  it('describes every fixture without leaking ids or undefined', () => {
    for (const { state } of MEMORY_FIXTURES) {
      const said = describeMemory(state);
      expect(said).not.toMatch(/\bo\d\b|undefined|NaN/);
    }
  });
});

describe('object names and order', () => {
  const list = (id: string) => ({ object: { id, kind: 'list' as const, type: 'list', items: [], more: 0 }, changed: false, fresh: false });
  const fn = (id: string, name: string) => ({ object: { id, kind: 'function' as const, type: 'function', name }, changed: false, fresh: false });

  it('extends the order with objects not yet seen, and returns the same order when there are none', () => {
    const first = extendOrder(NO_ORDER, [fn('f', 'go'), list('a'), list('b')]);
    expect(first).toEqual({ all: ['f', 'a', 'b'], numbered: ['a', 'b'] });
    expect(extendOrder(first, [list('b'), list('a')])).toBe(first);
    expect(extendOrder(first, [list('c'), list('a')]).all).toEqual(['f', 'a', 'b', 'c']);
  });

  it('keeps places and names when the heap order changes or an earlier object is freed', () => {
    const seen = extendOrder(NO_ORDER, [list('a'), list('b'), list('c')]);
    const later = [list('c'), list('b')];
    expect(orderHeap(later, seen).map((h) => h.object.id)).toEqual(['b', 'c']);
    expect(objectNames(later, seen)).toEqual(new Map([['b', 'list 2'], ['c', 'list 3']]));
    // Without a remembered order, objects are numbered as the heap lists them.
    expect(objectNames(later).get('c')).toBe('list 1');
  });

  it('tells apart two functions with one name', () => {
    expect([...objectNames([fn('x', '<lambda>'), fn('y', '<lambda>'), fn('z', 'go')]).values()]).toEqual([
      'function <lambda> 1',
      'function <lambda> 2',
      'function go',
    ]);
  });
});

describe('arrow geometry', () => {
  const parse = (d: string) => {
    const m = d.match(/^M(\S+) (\S+) C(\S+) (\S+) (\S+) (\S+) (\S+) (\S+)$/);
    expect(m).not.toBeNull();
    const [x0, y0, x1, y1, x2, y2, x3, y3] = m!.slice(1).map(Number);
    return { start: { x: x0, y: y0 }, c1: { x: x1, y: y1 }, c2: { x: x2, y: y2 }, end: { x: x3, y: y3 } };
  };

  it('curves from a dot to a box on the right, arriving horizontally from the left', () => {
    const p = parse(arrowPath({ x: 100, y: 40 }, { x: 300, y: 120 }));
    expect(p.start).toEqual({ x: 100, y: 40 });
    expect(p.end).toEqual({ x: 300, y: 120 });
    expect(p.c1.y).toBe(40);
    expect(p.c1.x).toBeGreaterThan(100);
    expect(p.c2.y).toBe(120);
    expect(p.c2.x).toBeLessThan(300);
  });

  it('reaches a box below and to the left by leaving vertically and swinging in from the left', () => {
    // Stacked layout: a frame's dot above, an object's left edge further left and below.
    const p = parse(arrowPath({ x: 140, y: 40 }, { x: 36, y: 400 }));
    expect(p.c1.x).toBe(140);
    expect(p.c1.y).toBeGreaterThan(40);
    expect(p.c2.y).toBe(400);
    expect(p.c2.x).toBeLessThan(36);
    expect(p.c2.x).toBeGreaterThanOrEqual(0);
    // An object pointing at one above it leaves upwards.
    expect(parse(arrowPath({ x: 400, y: 300 }, { x: 320, y: 100 })).c1.y).toBeLessThan(300);
    // A target at the very edge still gets a control point to its left, so the arrowhead points in.
    expect(parse(arrowPath({ x: 50, y: 10 }, { x: 2, y: 90 })).c2.x).toBeLessThan(2);
  });

  it('lands level with the first row of a tall box, or the middle of a short one', () => {
    expect(targetPoint({ left: 10, top: 100, right: 90, bottom: 300 })).toEqual({ x: 10, y: 122 });
    expect(targetPoint({ left: 10, top: 100, right: 90, bottom: 130 })).toEqual({ x: 10, y: 115 });
  });

  it('side by side, runs a frame’s arrow level to the frame’s edge before it curves', () => {
    expect(framePath({ x: 88, y: 180 }, 316, { x: 362, y: 127 })).toBe(`M88 180 H316 ${arrowPath({ x: 316, y: 180 }, { x: 362, y: 127 }).slice('M316 180 '.length)}`);
    // A dot already past the edge just curves.
    expect(framePath({ x: 320, y: 180 }, 316, { x: 362, y: 127 })).toBe(arrowPath({ x: 320, y: 180 }, { x: 362, y: 127 }));
  });

  it('stacked, runs a frame’s arrow down a lane on the right and into its target’s right edge', () => {
    const d = lanePath({ x: 120, y: 40 }, targetPointRight({ left: 36, top: 400, right: 200, bottom: 430 }), 330);
    expect(d).toBe('M120 40 H322 Q330 40 330 48 V407 Q330 415 322 415 H200');
    // Corners shrink when the drop is short, so the path never doubles back.
    expect(lanePath({ x: 120, y: 40 }, { x: 200, y: 46 }, 330)).toBe('M120 40 H327 Q330 40 330 43 V43 Q330 46 327 46 H200');
  });

  it('starts an arrow from a dot scrolled out of sight at its box edge', () => {
    expect(clampInto({ x: 500, y: 20 }, { left: 0, top: 0, right: 200, bottom: 40 })).toEqual({ x: 200, y: 20 });
    expect(clampInto({ x: 50, y: 20 }, { left: 0, top: 0, right: 200, bottom: 40 })).toEqual({ x: 50, y: 20 });
  });
});

describe('MemoryView', () => {
  it.each(MEMORY_FIXTURES.map((f) => [f.slug, f.state] as const))('renders %s with labelled groups, descriptions and one arrow per reference', (_, state) => {
    const html = render(state);
    expect(html).toContain('role="group" aria-label="Memory"');
    expect(html).toContain('role="group" aria-label="Frames"');
    expect(html).toContain('role="group" aria-label="Objects"');
    expect(html).toContain('aria-hidden="true"');
    const plain = text(html);
    expect(plain).toContain(describeFrames(state));
    expect(plain).toContain(describeObjects(state));
    // Exactly one frame is current, and says so in words.
    expect(count(html, '>current<')).toBe(1);
    // Every reference dot has its arrow.
    const refs = count(html, 'data-src=');
    expect(refs).toBeGreaterThan(0);
    expect(count(html, 'data-arrow=')).toBe(refs);
    for (const { object } of state.heap) expect(html).toContain(`data-obj="${object.id}"`);
    if (state.output.length > 0) {
      expect(html).toContain('aria-label="Printed"');
      for (const line of state.output) expect(plain).toContain(line);
    } else {
      expect(html).not.toContain('aria-label="Printed"');
    }
    expect(html).not.toMatch(/NaN|undefined/);
  });

  it('shows type labels, indices, "more" counts, functions and change cues', () => {
    expect(render(fixture('long-list').state)).toContain('+75 more');
    const objects = text(render(fixture('objects').state));
    for (const label of ['>Point<', '>dict<', '>list<', '>class<', '>new<', 'ann']) expect(objects).toContain(label);
    const fresh = render(fixture('fresh-and-changed').state);
    expect(count(fresh, '>new<')).toBe(1);
    // The write glyph badges both changed names.
    expect(count(fresh, '>↓<')).toBe(2);
    expect(render(fixture('straight-line').state)).toContain('↓ changed');
    expect(render(fixture('recursion').state)).toContain('Return value');
  });

  it('indexes list and tuple cells but not set cells', () => {
    const html = render(fixture('tuple-and-set').state);
    // Tuple (3, 4) has indices 0 and 1; the set {'a', 'b'} has none; the empty list says so.
    expect(count(html, 'text-[10px] leading-3 text-ink-soft">0<')).toBe(1);
    expect(html).toContain('>empty<');
  });

  it('draws a hollow dot and no arrow for a reference to an object the step left out', () => {
    const html = render({
      frames: [{ id: 'f0', fn: 'Global frame', locals: [{ name: 'x', value: { ref: 'gone' }, changed: false }], active: true }],
      heap: [],
      output: [],
    });
    expect(html).not.toContain('data-src=');
    expect(html).not.toContain('data-arrow=');
    expect(html).toContain('None yet');
  });
});
