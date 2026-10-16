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

The full e2e suite (~250 tests, including axe scans of every page in both themes) is heavy next to `next dev`. On a low-memory machine, run it against a production build instead: `npm run build`, `npx next start -p 3100`, then `npm run e2e -- --workers=2`. Playwright reuses whatever already listens on the port, so stop any stale server first.

## Architecture

### Trace engine (record → replay): how all new visualisers work

1. Each step is a `Frame` (`src/engine/types.ts`): a state snapshot, the pseudo-code `line`, a one-sentence `note` (narration that says *why*), `vars`, running `stats`, and optionally a `checkpoint` (a Predict-mode question about the *next* frame; the frame's own note must not reveal the answer).
2. Two module kinds (`src/engine/module.ts`):
   - **`AlgorithmModule<I, S>`** (`defineAlgorithm`): a pure generator `run(input)` over an `InputSpec<I>` (named examples taking `{seed, size}`, an optional size slider, optional custom text with `parse`/`format`). Lives in `src/algorithms/<family>/<slug>.ts`.
   - **`StructureModule<M, S>`** (`defineStructure`): an immutable model `M` changed by operations (`run(model, args)` is a generator that yields frames and **returns the new model**; it must never mutate `model`). Lives in `src/structures/<family>/<slug>.ts`. The explorer keeps history/undo and encodes operations in the URL (`?start=&seed=&ops=push:5;pop`).
3. Each module names a `view` kind; `src/viz/views.tsx` maps kinds to renderers (`array`, `grid`, `graph`, `tree`, `linear`, `hash`, `text`, and `memory` for learner code run line by line). A view gets `{ state }` and owns its tracer/types under `src/viz/<kind>/`. `ArrayTracer` (`src/viz/array/tracer.ts`) is the reference pattern: mutate through methods, `t.frame({...})` returns a copy-on-write snapshot.
4. `recordTrace()` / `recordOperation()` (`src/engine/trace.ts`) record a run; `useTracePlayer()` holds only an index on a requestAnimationFrame clock (step back, scrub, `?step=` deep links), and gates forward motion on unanswered Predict questions.
5. Views key every element by **stable id** and animate with Motion (`layout`/`layoutId` for HTML, `motion.*` SVG elements animating attributes). Motion components inherit the stage's `MotionConfig` (tween length from playback speed; `reducedMotion="user"`).
6. `src/registry.ts` merges the per-family registries (`src/algorithms/<family>/index.ts`, `src/structures/<family>/index.ts`); `app/visualisers/[slug]/page.tsx` serves every registered module. `src/components/explorer/` holds the shared UI: `TraceStage` (view, narration, predict card, controls, pseudo-code, stats, variables, legend), `AlgorithmExplorer`, `StructureExplorer`, `InputPanel`.

**Porting a visualiser:** write the module (generator, pseudo-code, stats, legend with a `{ neutral: … }` row, `content` with idea/invariant/whenToUse/traits/experiments, checkpoints at real decisions), add it to its family's `index.ts`, delete the legacy `app/visualisers/<slug>/` folder (static folders take precedence over `[slug]`), and add property tests next to it (correct result vs a reference implementation on random inputs, every frame narrated, valid pseudo-code lines, well-formed checkpoints, monotonic stats, and for structures: operations never mutate their input model).

**Never** animate by mutating React state inside async loops with sleeps, and never key moving elements by array index: that is what made the legacy pages choppy.

**Reuse a view before writing one.** `GridView` (`src/viz/grid/types.ts`) composes parts: tables (look `table`/`board`/`timeline`, cell styles incl. `block` walls, arrows, pieces, interval `bars`, `guides`, per-row `scales`, a `group` to sit parts side by side), lists and meters. `TreeView` (`src/viz/tree/types.ts`) draws one tree or a forest (`roots`, `parentArrows`, an aligned `table` of rows), and with `search: true` a recursion/decision tree; build those from a list of calls with `src/viz/tree/search.ts`, which lays out the whole tree up front so nodes never move as it is revealed and turns sideways on narrow screens.

**Operations:** `disabledReason(model, args?)` blocks an operation with a reason (the form disables itself as the learner types; replay and the run button use `blockedReason()`). Use `type: 'choice'` args (options from the model) for references that must exist. Prefer a narrated run over disabling when the attempt itself teaches (searching for a missing key).

### Lessons and the concept graph

- `src/content/concepts.yaml` (validated by Zod in `concepts.ts`) is the concept graph: tracks, concepts with prerequisites, the visualisers that teach each, an optional lesson, and planned concepts for the roadmap. `src/content/content.test.ts` rejects unknown ids, cycles, untaught visualisers, and planned concepts that link anywhere.
- Lessons are MDX in `src/content/lessons/<slug>.mdx`, listed with their metadata in `src/content/lessons/index.ts`, served by `app/learn/[lesson]`. Every lesson follows the learning loop with `<Section step="hook|parts|see|predict|do|check|recap">`, and uses the widgets registered in `src/mdx-components.tsx`: `Terms`/`Term` (pre-training), `Explore` (a visualiser; `settings` take the same keys as the page URL), `PredictChallenge` (predict mode with a goal; make sure the run has at least that many questions), `Quiz` (retrieval practice with explanations), `KeyIdea`, `Misconception`. Math uses `$…$` (KaTeX).
- Visualisers inside lessons run with `variant="lesson"`: they start from their settings, never write the URL, keep keyboard shortcuts to the focused stage, stack their panels, and ask at every decision in Predict mode.
- Progress (completed lessons, best quiz and prediction scores) lives in localStorage (`src/components/lesson/progress.ts`) until accounts arrive.

### Code workspace (learner code drives the views)

- `src/workspace/protocol.ts` is the contract: a `RunRequest` (language, code, entry function, args, limits) produces a `RunResult` whose `events` (array created, compare, write, append, pop, print — each with the learner's line and simple local `vars`) describe what the code did to its *visual collections*. `src/workspace/contract.ts` holds the shared cases every runtime must pass, with exact events; add a case there when you change semantics, never in one runtime only.
- Learners can make their own visual collections with `table(rows, cols, fill)` and `array(values)` (both runtimes provide them); a `cellWrite` carries `from`, the cells read since the statement began (tracked per call, so memoised recursion and helpers work), which the grid trace draws as dependency arrows. `traceFor()` picks the view: GridView (every collection as a table) once a run makes a grid, otherwise ArrayView.
- `trace.ts` turns events into the same `Trace<ArrayState>` the built-in visualisers play (two writes that exchange two cells on the same or the next line become a swap, keeping element identity, so bars slide). `runner.ts` owns the workers, kills one that overruns its time budget, and starts a fresh one next run.
- **Python** runs in Pyodide 314 (CDN) in `public/workers/python.mjs`, a *static module worker*: Pyodide refuses classic workers, and Turbopack-bundled workers run classic. The Python-side logic is `HARNESS` in `python/harness.ts` (AST rewrite of comparisons, `VisualList`, a `sys.settrace` step counter, print capture), sent to the worker on init and unit-tested in Node with the npm `pyodide` build. **JS/TS** is stripped with sucrase, instrumented with acorn/astring and run by `js/runtime.ts` in a bundled worker; it is plain TS, tested directly in Node.
- Exercises live in `src/content/exercises/`: the model in `shared.ts` (task, starter and solution per language, an `args` builder, examples to watch, judged tests, a `check` that explains failures, hints), one file per family (`arrays.ts`, `grids.ts`, `graphs.ts`, `trees.ts`), gathered by `index.ts`. `/code` lists them, `/code/[slug]` hosts `Workspace.tsx`, and a visualiser page links to its exercise. `exercises.test.ts` runs every solution and starter through both runtimes and checks the languages do the same things to the arrays, tables and graphs. Verdicts are local practice feedback, labelled as such.
- **Exercise formats** (`Workspace.tsx` is a ladder of stages; `useExerciseRun` runs whatever code a stage produces against the example and every test, and `RunOutput` shows verdicts and the trace): `parsons` (shuffled solution lines plus `distractors`; Python indentation is part of the puzzle, JS indentation follows the braces; `formats/parsons.ts`), `fill` (the solution with `«n:text»` blanks in `blanks`, and `fades` listing which blanks each level hides; `formats/blanks.ts`), `write` (the editor), and `bug` (kind `'bug'`: the starter has one bug, `bug.symptom`/`bug.explanation`). Kind `'modify'` starts from working code (PRIMM's Modify). Verdicts come from running the tests, so any working answer passes; the reference order and answers only power opt-in hints ("point out a misplaced line", "reveal a gap"). Passed stages are kept in localStorage (`storage.ts`).
- **Line by line (`mode: 'lines'`, Python Tutor style):**
  - **Runtimes:** both also emit a `step` event before every line, at every return, and as an exception unwinds. A step holds the whole stack (Global frame first, locals in binding order, harness names hidden; a Python closure's free variables are drawn in the frame that defines them, as in JS) and the heap reachable from it. Object ids stay stable for the run, so two names for one list share an arrow.
  - **Limits:** `MAX_ITEMS`, `MAX_OBJECTS` and `MAX_DEPTH` cap what a step holds, and runs use `LINE_LIMITS`.
  - **Contract:** lines-mode contract cases compare steps across languages by shape. Primitives are spelled per language, and refs are relabelled by first appearance.
  - **Trace:** `lines.ts` holds the step walker (`traceSteps`, one frame per step, narrated by `narrate`), shared by every view of a 'lines' run; a view adds clauses for what memory can't show. `traceLines()` (picked by `traceFor()` when a run has steps) turns steps into `Trace<MemoryState>`. Changes are flagged by diffing steps, and a note says what the line did. Pass `code` in the options so a condition line is narrated as "Line 2: n <= 1? No, so line 5 is next."
  - **View:** `MemoryView` (`src/viz/memory/`) draws frames, objects and measured SVG arrows. Its screen-reader description is `describe.ts`, and `fixtures.ts` holds sample states.
  - **Workspace:** the "Line by line, with memory" switch runs only the example this way; the tests still run in visual mode.
- **Graphs and trees (learner code on GraphView and TreeView):**
  - **Arguments:** `graph` (each node's neighbours in reading order, `graphArg()` in `exercises/graphs.ts` builds it in label order; a read-only dict / object whose reads are `neighbours` and `edge` events) and `tree` (level order, LeetCode style; the function gets the root `TreeNode`, which is also in scope, and a returned tree comes back in level order). Contract cases cover both.
  - **Watching:** their examples always run in 'lines' mode (`watchedByLine`), and `traceFor()` draws the steps on GraphView (`traceGraph.ts`) or TreeView (`traceTree.ts`); `view: 'memory'` (the "Show the memory diagram" switch) asks for the memory view instead.
  - **Marks come from the learner's own variables, never their names:** in a queue or stack (a list the code takes items out of) or a paused call = waiting; in another set, dict or list = recorded; the node whose neighbours the innermost call reads, or that it took out of a queue into a variable, or its first node-valued variable = current; the edge taken just before a node first appears anywhere = the edge that reached it. Every container gets a panel named after its variable, and the first dict of numbers is written under the nodes. On a tree, the innermost call's most recently assigned tree variable is current, paused calls' nodes wait and draw the path down, and a node the code makes floats as its own root until it is linked in.
- **Lessons** embed code with these widgets:
  - `<PredictCode exercise="…" question choices answer why />`: read the solution, predict, then run. Running is locked until the learner predicts.
  - `<CodeExercise exercise="…" stages={[…]} />`.
  - `<TraceCode snippet="…" />`: a short, editable program run line by line on the memory view. It takes the same optional predict props.
  - Snippets live in `src/content/snippets.ts`, and write Python there rather than in MDX props, where indentation is fragile. `snippets.test.ts` runs every one in every language it offers.
  - Use `exercise="…"` for exercise slugs and `snippet="…"` for snippets; content tests check both. `slug="…"` is for visualisers.
  - Section steps include PRIMM's `run`, `investigate`, `modify` and `make`. `sorting-in-code.mdx` is the PRIMM template; `recursion.mdx` shows tracing.
- Learner code runs with the worker's same-origin privileges: fine with no accounts, but revisit (sandboxed iframe) before code sharing or auth lands.

### Registry

`src/data/visualisers.js` is the single registry (name, slug, category, complexities, `hidden`) for the home page, search, and the new page headers. Complexities live only there; algorithm modules hold the teaching content.

### Remaining JavaScript

The home page (`app/page.jsx`), root layout, `Header.jsx`, `SearchBar.jsx`, `ui/tabs.jsx` and `src/data/visualisers.js` are still JavaScript. ESLint reports React Compiler hook rules as warnings for `.js/.jsx` and as errors for TypeScript; new code is TypeScript. `VISUALIZER_GUIDE.md` describes the removed async-loop pattern and is kept only for history.

### Tests that guard every module

- `src/registry.test.ts`: every module is listed in `src/data/visualisers.js`, no legacy folder shadows its route, pseudo-code lines are ≤ 42 characters (the code panel width), and teaching content is complete.
- Per-family property tests next to the modules (results vs reference implementations, frames, checkpoints, immutability).
- `e2e/all-visualisers.spec.ts` opens and runs every visualiser listed in the registry with no console errors.
- `e2e/a11y.spec.ts` runs axe (WCAG 2.2 A/AA + best practice) on every page in both themes, a few steps into each run, and checks the theme toggle and embed override.

### Design system

State colours are theme tokens in `app/globals.css` (Okabe–Ito, colour-blind-safe): `bar`, `mark-compare`, `mark-swap`, `mark-write`, `mark-focus`, `mark-frontier`, `mark-done`. `src/viz/marks.ts` is the one shared vocabulary (`compare`, `swap`, `write`, `pivot`, `min`, `key`, `frontier`, `sorted`, `visited`, `found`, `path`, `reject`), each with a glyph and `bg`/`fill`/`stroke`/`text` classes, so colour is never the only cue and a colour means the same thing in every view. Modules relabel marks in their legend rather than inventing colours.

**Colours are semantic tokens, never palette classes.** `globals.css` defines what a colour is *for*: planes `page`, `surface`, `subtle`, `sunken`; hairlines `line-soft`, `line`, `line-strong`; text `ink`, `ink-soft`, `ink-muted` (and `ink-faint`, decoration only, below text contrast); `accent`/`accent-strong` (white text on them), `accent-ink`, `accent-soft`, `accent-line`; feedback `good`/`warn`/`bad` with `-ink`, `-soft`, `-line`; `mark-*-ink` for mark hues as text; `series-1..4` for chart series. Write `bg-surface text-ink border-line`, not `bg-white text-gray-900 border-gray-200`; every ink clears 4.5:1 on page, surface and sunken in both themes. Text on a mark *fill* is `text-white` on `compare` and `text-on-mark` (dark in both themes) on every other mark; unmarked text takes the theme's `ink`. Tints of a fill (`bg-mark-done/25`, `opacity-25` overlays) work in both themes.

**Dark mode** redefines the tokens, so components need no `dark:` variants. It follows the OS by default; the header's `ThemeToggle` (System → Light → Dark) stamps `data-theme` on `<html>`, saved in localStorage and applied before paint by `THEME_SCRIPT` (`src/lib/theme.ts`), and an embed can pass `?theme=light|dark`. The custom `dark:` variant covers both the OS and the stamp, for the rare one-off (the home-page gradient). Mark fills are the same in both themes (see the note in `globals.css` on why they sit above the dataviz dark lightness band). Colours that end up in style props (chart series) are `var(--color-…)` strings, set via `style`, not SVG attributes.

**Accessibility conventions:** a view's panels are `role="group"` with a label, not `<section>` landmarks or headings (a page can hold several visualisers, and panel titles don't belong in its outline). Narration is a polite live region while stepping and silent during playback. Keyboard-readable charts are sliders with `aria-valuetext`. `html` has `scroll-padding-top` so anchors and focus clear the sticky header, and `prefers-reduced-motion` stops CSS tweens as well as Motion's.

## Naming Conventions

- Routes: `/visualisers/<kebab-case-slug>` (kept stable for SEO; ported ones are served by `[slug]`)
- New code is TypeScript; components are PascalCase `.tsx`
- Tailwind v4 (CSS-first `@theme` config, no `tailwind.config.js`)

## Dependencies

- Next.js 16.4, React 19.3, Tailwind CSS 4.3, TypeScript 6.0 (pinned below 6.1: typescript-eslint doesn't support 7 yet, and TS 7 drops the JS compiler API Next uses)
- Motion 14 (`motion/react`) for layout animation
- Vitest 5 + fast-check (property tests), Playwright 1.64 (e2e), @axe-core/playwright 4.13 (accessibility scans)
- react-icons, Radix UI (tabs), Vercel Analytics
