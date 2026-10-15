# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Algorender is a Next.js 16 app for learning algorithms and data structures visually, and is being rebuilt into a broader platform (DS&A → math → ML → systems). `REVAMP_PLAN.md` at the repo root is the plan: read its roadmap and decisions before proposing architecture. Every visualiser now runs on the trace engine (one dynamic route, `app/visualisers/[slug]`); there are no legacy per-page visualisers left. Other routes: `/compare` (sorting race + growth chart), `/embed/[slug]` (chrome-less iframe embeds), `sitemap.xml`, `robots.txt`.

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

1. Each step is a `Frame` (`src/engine/types.ts`): a state snapshot, the pseudo-code `line`, a one-sentence `note` (narration that says *why*), `vars`, running `stats`, and optionally a `checkpoint` (a Predict-mode question about the *next* frame; the frame's own note must not reveal the answer).
2. Two module kinds (`src/engine/module.ts`):
   - **`AlgorithmModule<I, S>`** (`defineAlgorithm`): a pure generator `run(input)` over an `InputSpec<I>` (named examples taking `{seed, size}`, an optional size slider, optional custom text with `parse`/`format`). Lives in `src/algorithms/<family>/<slug>.ts`.
   - **`StructureModule<M, S>`** (`defineStructure`): an immutable model `M` changed by operations (`run(model, args)` is a generator that yields frames and **returns the new model**; it must never mutate `model`). Lives in `src/structures/<family>/<slug>.ts`. The explorer keeps history/undo and encodes operations in the URL (`?start=&seed=&ops=push:5;pop`).
3. Each module names a `view` kind; `src/viz/views.tsx` maps kinds to renderers (`array`, `grid`, `graph`, `tree`, `linear`, `hash`, `text`). A view gets `{ state }` and owns its tracer/types under `src/viz/<kind>/`. `ArrayTracer` (`src/viz/array/tracer.ts`) is the reference pattern: mutate through methods, `t.frame({...})` returns a copy-on-write snapshot.
4. `recordTrace()` / `recordOperation()` (`src/engine/trace.ts`) record a run; `useTracePlayer()` holds only an index on a requestAnimationFrame clock (step back, scrub, `?step=` deep links), and gates forward motion on unanswered Predict questions.
5. Views key every element by **stable id** and animate with Motion (`layout`/`layoutId` for HTML, `motion.*` SVG elements animating attributes). Motion components inherit the stage's `MotionConfig` (tween length from playback speed; `reducedMotion="user"`).
6. `src/registry.ts` merges the per-family registries (`src/algorithms/<family>/index.ts`, `src/structures/<family>/index.ts`); `app/visualisers/[slug]/page.tsx` serves every registered module. `src/components/explorer/` holds the shared UI: `TraceStage` (view, narration, predict card, controls, pseudo-code, stats, variables, legend), `AlgorithmExplorer`, `StructureExplorer`, `InputPanel`.

**Porting a visualiser:** write the module (generator, pseudo-code, stats, legend with a `{ neutral: … }` row, `content` with idea/invariant/whenToUse/traits/experiments, checkpoints at real decisions), add it to its family's `index.ts`, delete the legacy `app/visualisers/<slug>/` folder (static folders take precedence over `[slug]`), and add property tests next to it (correct result vs a reference implementation on random inputs, every frame narrated, valid pseudo-code lines, well-formed checkpoints, monotonic stats, and for structures: operations never mutate their input model).

**Never** animate by mutating React state inside async loops with sleeps, and never key moving elements by array index: that is what made the legacy pages choppy.

### Registry

`src/data/visualisers.js` is the single registry (name, slug, category, complexities, `hidden`) for the home page, search, and the new page headers. Complexities live only there; algorithm modules hold the teaching content.

### Remaining JavaScript

The home page (`app/page.jsx`), root layout, `Header.jsx`, `SearchBar.jsx`, `ui/tabs.jsx` and `src/data/visualisers.js` are still JavaScript. ESLint reports React Compiler hook rules as warnings for `.js/.jsx` and as errors for TypeScript; new code is TypeScript. `VISUALIZER_GUIDE.md` describes the removed async-loop pattern and is kept only for history.

### Tests that guard every module

- `src/registry.test.ts`: every module is listed in `src/data/visualisers.js`, no legacy folder shadows its route, pseudo-code lines are ≤ 42 characters (the code panel width), and teaching content is complete.
- Per-family property tests next to the modules (results vs reference implementations, frames, checkpoints, immutability).
- `e2e/all-visualisers.spec.ts` opens and runs every visualiser listed in the registry with no console errors.

### Design system

State colours are theme tokens in `app/globals.css` (Okabe–Ito, colour-blind-safe): `bar`, `mark-compare`, `mark-swap`, `mark-write`, `mark-focus`, `mark-frontier`, `mark-done`. `src/viz/marks.ts` is the one shared vocabulary (`compare`, `swap`, `write`, `pivot`, `min`, `key`, `frontier`, `sorted`, `visited`, `found`, `path`, `reject`), each with a glyph and `bg`/`fill`/`stroke`/`text` classes, so colour is never the only cue and a colour means the same thing in every view. Modules relabel marks in their legend rather than inventing colours. The UI is light-only until the legacy pages are ported.

## Naming Conventions

- Routes: `/visualisers/<kebab-case-slug>` (kept stable for SEO; ported ones are served by `[slug]`)
- New code is TypeScript; components are PascalCase `.tsx`
- Tailwind v4 (CSS-first `@theme` config, no `tailwind.config.js`)

## Dependencies

- Next.js 16.4, React 19.3, Tailwind CSS 4.3, TypeScript 6.0 (pinned below 6.1: typescript-eslint doesn't support 7 yet, and TS 7 drops the JS compiler API Next uses)
- Motion 14 (`motion/react`) for layout animation
- Vitest 5 + fast-check (property tests), Playwright 1.64 (e2e)
- react-icons, Radix UI (tabs), Vercel Analytics
