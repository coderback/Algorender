# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Algorender is a Next.js 16 app for learning algorithms and data structures visually, and is being rebuilt into a broader platform (DS&A → math → ML → systems). `REVAMP_PLAN.md` at the repo root is the plan: read its roadmap and decisions before proposing architecture. Visualisers are mid-migration: the 8 sorting algorithms run on the new trace engine; the other 44 are legacy pages still to be ported.

## Development Commands

Run everything from `algorender/`:

```bash
npm run dev          # dev server on localhost:3000
npm run build        # production build (also type-checks)
npm run lint         # ESLint (flat config, eslint.config.mjs)
npm run typecheck    # tsc --noEmit
npm test             # Vitest unit + property tests (src/**/*.test.ts)
npm run e2e          # Playwright (e2e/); reuses a dev server on E2E_PORT (default 3100)
```

The user's global `~/.npmrc` sets `os=linux`, which makes npm skip Windows native binaries (Tailwind's oxide, lightningcss, Next's SWC). Run installs with `npm_config_os=win32` set in the environment; don't add that to a project `.npmrc` (Vercel builds on Linux).

## Architecture

### Trace engine (record → replay): how all new visualisers work

1. An algorithm is a **pure generator** in `src/algorithms/<group>/<slug>.ts` that yields one `Frame` per meaningful step (`src/engine/types.ts`): a state snapshot, the pseudo-code `line`, a one-sentence `note` (narration), `vars` and running `stats`.
2. Array algorithms author frames through `ArrayTracer` (`src/viz/array/tracer.ts`): `swap`, `move` (between lanes, e.g. a merge buffer), `markSorted`, counters, then `t.frame({...})`. Snapshots are copy-on-write, so frames share unchanged lanes.
3. `recordTrace()` runs the generator to completion (`src/engine/trace.ts`, capped at 20k frames).
4. `useTracePlayer()` (`src/engine/useTracePlayer.ts`) holds only an index on a requestAnimationFrame clock, so stepping back, scrubbing and `?step=` deep links are array lookups. Tween length is derived from playback speed.
5. `ArrayView` (`src/viz/array/ArrayView.tsx`) keys every element by **stable id** with a Motion `layoutId`, so swaps and lane moves animate as real movement. `MotionConfig reducedMotion="user"` respects reduced-motion settings.
6. `app/visualisers/[slug]/page.tsx` serves every ported algorithm (static params from `src/algorithms/index.ts`); `src/components/explorer/` holds the controls, synced pseudo-code, variables, stats, legend, input panel and "Try this" experiments.

**Porting a visualiser:** write the generator plus `ArrayAlgorithm` metadata (input spec, pseudo-code, stats, legend, content), register it in `src/algorithms/index.ts`, and delete the legacy `app/visualisers/<slug>/` folder (static folders take precedence over `[slug]`). New view types (graph, tree, grid…) get their own tracer + view under `src/viz/`. Property tests in `src/algorithms/**.test.ts` must keep passing: sorted output, no element lost or duplicated in any frame, valid pseudo-code lines, monotonic stats, stability where claimed.

**Never** animate by mutating React state inside async loops with sleeps, and never key moving elements by array index: that is what made the legacy pages choppy.

### Registry

`src/data/visualisers.js` is the single registry (name, slug, category, complexities, `hidden`) for the home page, search, and the new page headers. Complexities live only there; algorithm modules hold the teaching content.

### Legacy pages (until ported)

`app/visualisers/<slug>/page.jsx` pages use the old pattern: async loops waiting via `wait(ms)` from `useCancellableWait()` (never a raw `setTimeout` promise), with `sortingRef`-style cancellation, and shared controls in `components/VisualizerControls.jsx`. ESLint reports React Compiler hook rules as warnings for legacy `.js/.jsx` and as errors for TypeScript.

### Design system

State colours are theme tokens in `app/globals.css` (Okabe–Ito, colour-blind-safe): `bar`, `mark-compare`, `mark-swap`, `mark-write`, `mark-focus`, `mark-sorted`. Each mark also has a glyph (`src/viz/array/marks.ts`), so colour is never the only cue. The UI is light-only until the legacy pages are ported.

## Naming Conventions

- Routes: `/visualisers/<kebab-case-slug>` (kept stable for SEO; ported ones are served by `[slug]`)
- New code is TypeScript; components are PascalCase `.tsx`
- Tailwind v4 (CSS-first `@theme` config, no `tailwind.config.js`)

## Dependencies

- Next.js 16.4, React 19.3, Tailwind CSS 4.3, TypeScript 6.0 (pinned below 6.1: typescript-eslint doesn't support 7 yet, and TS 7 drops the JS compiler API Next uses)
- Motion 14 (`motion/react`) for layout animation
- Vitest 5 + fast-check (property tests), Playwright 1.64 (e2e)
- react-icons, Radix UI (tabs), Vercel Analytics
