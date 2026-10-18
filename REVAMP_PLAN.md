# Algorender 2.0 — Revamp Plan

> **Status:** proposal · 2026-10-15
> This replaces the server-centric direction in `SCALING_GUIDE.md`. `VISUALIZER_GUIDE.md` documents the old async-loop pattern and will be rewritten once the new engine lands.
> It draws on an audit of the current codebase plus four research tracks: learning science, gamification, the competitive landscape, and the technical stack. Key sources are in the appendix.

## TL;DR

1. **Replace the engine instead of patching 52 pages.** The choppiness comes from the architecture:
   - every page mutates React state inside an async `wait()` loop;
   - bars are keyed by array index, so nothing ever actually moves;
   - there is no concept of a "step".

   The fix is *record → replay*. Each algorithm becomes a pure generator that emits a trace of typed steps. One shared player then renders those steps, interpolates between them, scrubs, and steps backward.
2. **Watching doesn't teach; doing does.** The most consistent finding in algorithm-visualization research is that *what learners do* matters more than *what they see*. Predicting, performing steps, changing inputs and building are what produce learning. Algorender today sits on the lowest rung, viewing. Every concept should move learners up the ladder: **See → Predict → Do → Build → Practice → Retain**.
3. **Positioning: the interactive, executable textbook and gym for the CS→AI stack.** No product combines all four of these:
   - visuals you can step through;
   - *your own code*, in your language, driving those same visuals;
   - a pattern-tagged judge whose failing tests replay visually;
   - spaced review and mastery tracking on one prerequisite graph spanning DS&A → Math → ML → Systems.
4. **Gamification: yes, if the game is the learning task.** Examples: "be the algorithm", predict the step, break it, debug it. XP is earned for mastery and spaced recall, never for time or activity, and competitive features are opt-in. Points, badges and leaderboards bolted on top have weak, fragile evidence: competition alone has ≈0 effect in rigorous studies.
5. **AI tutor: yes, with guardrails.** Unrestricted GPT-4 raised practice scores but cut exam scores by 17%. A grounded, hints-only tutor did not cause that harm. Ground the tutor in the live trace and a reference solution, and enforce a hint ladder in the UI.
6. **Stack:**

   | Area | Choice |
   |---|---|
   | App | Next 16 + TypeScript + Tailwind 4 |
   | Animation | Motion for tweening; d3/elk for layout |
   | Code editor | CodeMirror 6 |
   | In-browser execution | Pyodide + Web Workers (Python/JS) |
   | Authoritative judging | Firecracker sandbox (Java/C++/Go) |
   | Content | Fumadocs MDX |
   | Accounts and progress | Own Postgres + Better Auth, inside the Next.js app |
   | Spaced repetition | ts-fsrs |
   | Tutor | Claude 5.5 models |

7. **Order:** foundation and engine → port the 52 visualizers with lesson structure → code workspace → practice and progress → math and ML tracks → personalization and tutor → play mode, systems track, community.

---

## 1. Where Algorender is today

**Inventory.**
- 52 visualizers: 15 data structures and 37 algorithms. Bloom Filter is hidden.
- 12,153 lines of `page.jsx`, about 233 per page, with no shared engine.
- JavaScript, no tests, Next 15.5, Tailwind 3.4, dark mode disabled.

### Why it's choppy (root causes)

| # | Cause | Where |
|---|---|---|
| 1 | Bars and nodes are keyed by array index, so a swap is just two fixed slots changing height. Nothing travels. | `components/SortingChart.jsx:57` (`key={index}`); same pattern in 38 pages |
| 2 | The swap and the next comparison highlight land in the same React render, so the swap is never seen with its highlight | `bubble-sort/page.jsx:60–69`, `insertion-sort:66–74`, `merge-sort:49–62` |
| 3 | The step delay (100–1000 ms) is unrelated to the 300 ms CSS transition. Slow speeds look like stop-motion; fast speeds cut motion off mid-way. | `components/VisualizerControls.jsx:16–19` |
| 4 | Speed is captured when the run starts, pause is polled every 100 ms, and Reset can bring a stale loop back to life | `bubble-sort:33–38, 64` |
| 5 | Structural operations apply synchronously, so the shape jumps. 17 pages don't animate at all. | `avl-tree:36–66`, `heap:27–64` |
| 6 | Graph algorithms never draw a graph: nodes sit in a flex-wrap and edges are a text list | `dijkstra:103–123`, `breadth-first-search:84–104` |
| 7 | Trees use fixed flex spacing plus absolutely positioned connectors that miss their children. Tailwind classes built at runtime are never generated. | `avl-tree:182–188`, `binary-tree:99–105`, `b-tree:211` |
| 8 | Key intermediate structures are never shown: the counting array, radix buckets, KMP's prefix (LPS) table, Tarjan's low-link values, DP cell dependencies | `counting-sort:81–85`, `radix-sort:46–87`, `kmp:46–81` |

### Missing teaching features
- No step forward or back, scrubbing, per-step narration, pseudo-code highlighting or variable inspector.
- No code in any language, no quizzes, no exercises.
- "How it works" is 2–4 one-liners per page.
- Complexities are defined in two places and disagree in 21 of 52 pages.

### Other debt
- **Accessibility:** zero ARIA or keyboard support; state is shown by colour alone (a red/green problem for colour-blind users); no `prefers-reduced-motion` handling.
- **Mobile:** fixed widths break small screens (`w-12` bars, `min-w-[800px]` trees, a 600 px canvas).
- **SEO:** every page has the same `<title>`.
- **Bugs:** state is mutated in place (`linked-list:28`, `trie:21–28`); Bellman-Ford has no negative-cycle check; KMP promises visuals it doesn't render.

### Verdict
Keep the content inventory and the registry (`src/data/visualisers.js`); replace the page implementations. Each algorithm's real logic is 20–60 lines. Port it into a generator and delete the per-page animation code.

---

## 2. What the research says

### 2.1 Visualizations teach through engagement, not viewing

- **Hundhausen, Douglas & Stasko 2002**, a meta-study of 24 experiments: *how* learners use an algorithm visualization matters more than *what* it shows. Over 40% of the experiments found no effect at all.
- **The Naps et al. 2002 engagement taxonomy** ranks engagement as no viewing → viewing → responding → changing → constructing → presenting. Algorithm visualization has little value without active engagement.
- **Crouch et al. 2004:** students who passively watched a demonstration understood the concept no better than students who never saw it. Students who *predicted the outcome first* understood significantly more.
- **Tversky et al. 2002; Berney & Bétrancourt 2016:** animation beats static pictures only modestly (g≈0.2–0.4). People conceive continuous processes as discrete steps, so step boundaries and learner control matter.
- **Mayer & Chandler 2001:** splitting an animation into segments with a "continue" click improves transfer.
- **Shaffer et al. 2010** surveyed 500+ algorithm visualizations. Most are low quality and skewed toward easy topics such as sorting. Hard topics are under-served, which is an opening for Algorender.
- **TRAKLA2**, where the learner performs the algorithm's steps on the data structure and is auto-graded, is the closest precedent for "be the algorithm".

### 2.2 Principles → features

| Principle (evidence) | What Algorender builds |
|---|---|
| Predict before reveal (Crouch 2004; Kim et al., CHI 2017) | **Predict gates**: "which pair swaps next?", "which node does Dijkstra pop?" The learner's prediction is shown next to the actual result |
| Segmenting and learner control (Mayer; Tversky) | **Stepping by default**: autoplay is opt-in and pauses at segment boundaries; scrubbable timeline with step-back |
| Contiguity, signaling, coherence (Mayer 2017, median d≈0.5–1.3) | **Synced views**: code line ↔ visual ↔ narration updated each step; captions *beside* the visual; one colour meaning per state; no decorative motion |
| Pre-training (Mayer) | **Pre-training cards**: a 30-second "parts list" (pivot, frontier, attention head) before the full run |
| Worked examples → fading (Renkl & Atkinson 2003; van Merriënboer 1990) | **Fading ladder** per topic: watch → fill a trace table → Parsons problem (reorder given lines) → fill-in-the-blank → write from scratch |
| Tracing before writing (Lister 2004; Xie et al. 2019) | **Tracing gates**: trace and "explain in plain English" checks before code-writing problems |
| PRIMM (Sentance et al. 2019) | **Exercise template**: Predict → Run → Investigate → Modify → Make |
| Retrieval and spacing (Dunlosky 2013; Adesope 2017) | **FSRS review queue** with cards generated from visualizer states ("what is the array after pass 2?") |
| Interleaving similar categories (Brunmair & Richter 2019) | **Mixed sets** of easily confused things: BFS/DFS/Dijkstra, quick/merge/heap sort, L1/L2 regularization |
| Self-explanation (Bisra et al. 2018, g≈0.55) | **"Why" prompts** at pivotal steps ("why is the pivot now final?") with rubric or AI feedback |
| Concreteness fading (Fyfe 2014); "concrete before abstract" (3Blue1Brown) | **Math and ML lessons**: concrete numbers → symbols → formula, each term colour-linked to the visual |
| Expertise reversal (Kalyuga 2003) | **Adaptive scaffolding** fades with mastery; experts can skip straight to problems |
| Mastery needs delayed, varied retrieval (Oreopoulos et al. 2026: "three in a row" did not improve delayed learning) | **Mastery** means correct on *new* inputs *days later*, not an immediate streak |
| Ladder of abstraction (Bret Victor) | **Abstraction views**: small multiples of every pass; operations-vs-n charts across algorithms; parameter sweeps |

### 2.3 AI tutors

| Study | Finding |
|---|---|
| **Bastani et al., PNAS 2025** (~1,000 students) | Unrestricted GPT-4: practice +48%, exam **−17%**. A hint-only "GPT Tutor" grounded in teacher solutions: practice +127% with no exam harm, but no exam gain either. |
| **Kestin et al., Scientific Reports 2025** (Harvard physics) | A tutor with pre-written solutions and *platform-enforced* step sequencing beat in-class active learning by about 0.6 SD. The prompt alone could not keep students in order. |
| **Khanmigo** (NBER working-paper draft, 2026) | No measurable benefit over Khan Academy alone. Students wanted answers, got hints, and stopped using it. Restriction without engagement design fails. |
| **CS-specific tools** (CodeAid, CodeHelp, CS50 Duck) | Conceptual help, pseudo-code and error annotation work; full solutions are never given. |
| **Prather 2024; Lehmann 2025** | Using an LLM as a *substitute* for thinking reduces understanding and widens the gap between weak and strong students. |

**Design implications:**
- Ground the tutor in the reference solution and the live trace.
- Enforce a hint ladder in the UI: concept → pointer to the line or step → pseudo-code → partial code.
- Trigger help on mistakes inside practice.
- Let the tutor drive the visualizer ("look at step 14").
- Run a cheap post-check that blocks solution leaks.

### 2.4 Gamification: the verdict

**What the evidence says:**
- **Meta-analyses:** the cognitive effect is g≈0.4–0.5 (Sailer & Homner 2020; Bai et al. 2020). Only the cognitive effect survives in rigorous studies; motivational and behavioural effects are fragile.
- **Novelty:** effects dip around week 4 (Rodrigues et al. 2022).
- **Competition:** competition alone ≈0 (motivational g=−0.09). Competition **plus collaboration** is strong (g=0.61–0.73). Both figures are from the rigorous subset in Sailer & Homner.
- **Badges, points, streaks:**
  - Mandatory badges plus a leaderboard *lowered* intrinsic motivation and exam scores (Hanus & Fox 2015).
  - Points raise the *quantity* of work, not competence (Mekler 2017).
  - A broken streak reduces later engagement (Silverman & Barasch 2023).
- **In programming specifically**, levels were the only game element with a measurable effect (Costa 2023).
- **Game-based learning**, where the learning *is* the game, shows d≈0.3 on learning and 0.36 on retention (Wouters 2013; Clark 2016).
- **AI and public rankings:**
  - Advent of Code removed its global leaderboard in 2025 because of the stress it caused.
  - Codeforces banned AI-written solutions in rated rounds.
  - Public leaderboards on code problems are now polluted by AI.

**Verdict: valid, as an active "Play" mode next to "Watch", not a cosmetic skin.** The design is in §7.

### 2.5 The market gap

| Product | Strength | What it lacks |
|---|---|---|
| VisuAlgo, USFCA, algorithm-visualizer.org | Free, broad DS&A coverage | Dated; no user code, no ML or math, no learning path |
| Python Tutor | Steps through *your* code | Generic memory boxes (an array never becomes bars); no curriculum |
| LeetCode, NeetCode, AlgoMonster | Problem bank, patterns, video | No interactive visuals, no spaced review, one-size roadmap |
| Brilliant | Best interactive micro-lessons | Too shallow for interview-level DS&A; little real coding |
| Math Academy | Adaptive mastery plus spaced repetition | No visual intuition, no coding |
| Polo Club, bbycroft, 3Blue1Brown, MLU-Explain | The best ML and math explainers | Isolated, passive, no exercises or path. Distill has been on hiatus since 2021. |
| Deep-ML, TorchLeet | Implement ML in the browser | No picture of what *your* model code is doing |

**Cross-domain links nobody shows:**
- DP ↔ Bellman equation ↔ RL value iteration
- Chain rule → computational graph → backprop
- Graph search → HNSW vector search
- Hashing → Bloom filter → LSM tree
- Heaps → OS schedulers
- Dijkstra → link-state routing
- Edit distance ↔ Viterbi

**Pricing:** paid interview-prep tiers cluster at $119–199 per year (NeetCode $119, LeetCode $159, ByteByteGo $189). Free visuals are table stakes because VisuAlgo and Python Tutor are free. If Algorender charges, it should charge for practice, personalization, the judge and the tutor.

---

## 3. Product vision

**In one line:** see it, predict it, build it, break it, keep it. That applies to every concept from bubble sort to backprop to Raft, all on one engine and one prerequisite graph.

### 3.1 The learning loop (every concept)

| Stage | Engagement level | What the learner gets |
|---|---|---|
| **Hook** | — | One paragraph of motivation plus a concrete example: why does this exist? |
| **See** | controlled viewing | Stepper with synced code, narration and state, plus pre-training cards |
| **Predict** | responding | Predict gates at key steps |
| **Do** | changing | Be-the-algorithm; custom and adversarial inputs |
| **Build** | constructing | Parsons → fill-in → write it in your language; your code drives the same visual |
| **Practice** | constructing | Pattern-tagged problems; failing tests replay visually |
| **Retain** | retrieval | Spaced review cards; interleaved sets |
| **Explain** | presenting | Explain-it-back; record and share a narrated walkthrough |

### 3.2 Surfaces
- **Explore**: free, no login. Every visualizer, with shareable permalinks and embeddable iframes. This is the search-traffic entry point.
- **Learn**: tracks and courses made of lessons (MDX with embedded widgets).
- **Practice**: problem bank, pattern drills and the judge.
- **Review**: the daily spaced-repetition (FSRS) queue.
- **Play**: game modes (§7).
- **Plan**: a personalized study plan built from goal, available time and a diagnostic.
- **Tutor**: a context-aware side panel available everywhere.

---

## 4. Feature catalogue

Impact = impact on learning. Diff = differentiation from competitors. Effort is S/M/L; phase refers to §8.

| Feature | Impact | Diff | Effort | Phase |
|---|---|---|---|---|
| Trace engine + player (step back, scrub, speed, keyboard, reduced motion) | enabler | — | M | 0 |
| Synced triple view: code line ↔ visual ↔ narration + variables | H | M | M | 0–1 |
| Predict-the-next-step gates | H | H | S | 1 |
| Custom and adversarial inputs; presets (sorted, reversed, duplicates, worst case) | H | M | S | 1 |
| Lesson template (hook, pre-training, see, predict, do, check) | H | M | M | 1 |
| Algorithm races and complexity playground (operations vs n, curve fit) | H | H | S–M | 1 |
| Shareable permalinks and embeds | M | M | S | 1 |
| Be-the-algorithm mode | H | H | M | 1–2 |
| Code workspace: CodeMirror + Python/JS/TS in the browser | H | M | M | 2 |
| **Visualize YOUR code** (visual-collections API; Python-Tutor-style tracing mode) | H | H | L | 2 |
| Parsons, fill-in-the-blank and faded worked examples | H | M | S | 2 |
| Bug-hunt mode | M | M | S | 2 |
| Problem bank with typed signatures and multi-language stubs | H | M | M | 3 |
| Server judge (Java, C++, Go, …) with hidden tests | H | M | L | 3 |
| Failing test case replays visually on *your* code | H | H | M | 3 |
| Pattern-recognition drills (30-second "which pattern?") | H | H | S | 3 |
| Accounts and local-first progress sync | enabler | — | M | 3 |
| FSRS review queue with auto-generated cards | H | M | M | 3 |
| Math manipulatives (grid warps, eigenvectors, gradients, Bayes, CLT) | H | M | M | 4 |
| ML labs (regression, k-means, MLP playground, micrograd graph, attention, sampling, 2D diffusion) | H | H | M–L | 4 |
| "Build micrograd / nanoGPT visually" track | H | H | M | 4 |
| Knowledge map, diagnostic placement, mastery tracking (BKT) | H | H | M | 5 |
| Personalized study plans (goal + weekly hours → schedule that re-plans) | H | M | M | 5 |
| AI tutor (grounded, hint ladder, trace-aware) | H | M | M | 5 |
| Explain-it-back with rubric scoring | H | M | M | 5 |
| Misconception-targeted quizzes | H | M | M | 5 |
| Play mode (§7) | M–H | M | M | 6 |
| Systems simulators (scheduling, paging, Raft, LSM, consistent hashing, queueing) | H | H | M | 6 |
| Mock interview mode | M | M | L | 6 |
| Classroom / teacher mode | M | M | L | 6+ |
| Community-authored visualizations | M | H | L | 6+ |
| i18n, offline PWA drills, notes and Anki export | M | L | S–M | 6+ |
| Accessibility (keyboard, aria-live narration, colour-blind-safe palette) | M | M | S | **every phase** |

---

## 5. Curriculum map

There are five tracks on one prerequisite graph. ★ marks the most visually compelling topics; ✓ marks topics that exist today and will be ported.

### 0. Foundations
Big-O and growth curves★ → recursion and the call stack★ → loop invariants.

### 1. Data structures and algorithms

**Existing, to port:**
- sorting (8)✓, searching (6)✓, graph algorithms (10)✓
- DP (4)✓, backtracking (2)✓, strings (5)✓
- linear, hierarchical, graph and hash data structures (15)✓

**Build first, by LeetCode pattern:**
- sliding window★, two pointers★, monotonic stack★
- union-find★, backtracking decision tree★
- the DP family★ (coin change, LIS, grid paths, house robber)
- interval sweep★, segment tree★, Fenwick tree
- A★ on a grid★, top-k / two heaps, LRU cache★
- binary search on the answer, prefix sums, red-black tree

### 2. Math for CS and ML
- **Discrete math:** logic and proofs; induction★ shown beside recursion; recurrences and the Master theorem (recursion tree★); combinatorics; modular arithmetic and RSA★.
- **Probability and statistics:** Bayes (area diagram)★; distributions; CLT sampler★; MLE/MAP; Markov chains★; Monte Carlo★.
- **Linear algebra:** matrices as grid warps★; determinant as area★; eigenvectors★; projections and least squares★; SVD (image compression)★; PCA.
- **Calculus:** derivative as slope★; chain rule as a computational graph★; Taylor series★; gradients and contours★; Jacobian and Hessian.
- **Optimization:** gradient descent, momentum and Adam on 2D loss surfaces★; convexity; Lagrange multipliers★.
- **Information theory:** entropy, cross-entropy and KL★; Huffman coding★ (a bridge to DS&A).
- **Numerical methods:** floating-point bit layout★; Newton's method★; log-sum-exp stability.

### 3. Machine learning
- **Classical:**
  - linear regression★ (drag points, see residuals), logistic regression★
  - k-NN★ (Voronoi cells), k-means★, PCA★
  - decision trees★, gradient boosting★, SVM★ (margin, kernel lift), naive Bayes
  - bias-variance★, regularization geometry★, ROC★
- **Deep learning:**
  - perceptron★, MLP playground★, backprop and autograd (micrograd graph)★
  - optimizers and normalization
  - CNN★ (kernels, feature maps), RNN/LSTM★
  - embeddings★, attention★ (Q/K/V heatmap), transformer block★
- **LLMs:** BPE tokenization★; sampling (temperature, top-k, top-p)★; KV cache★; LoRA★; RAG and HNSW vector search★; quantization★; MoE routing★; RLHF/DPO.
- **Reinforcement learning:** bandits★; gridworld MDP★; value and policy iteration★ (linked to DP); Q-learning★; MCTS★.
- **Generative models:** VAE latent walk★; GAN★; diffusion on 2D points★.

### 4. Systems and software engineering
- **Operating systems:** CPU scheduling Gantt chart★; paging, TLB and page replacement★; race-condition interleavings★; deadlock★.
- **Networking:** TCP handshake and the congestion-control sawtooth★.
- **Storage and databases:** B+tree and LSM compaction★; isolation anomalies★.
- **Caching:** LRU/LFU★; consistent hashing★.
- **Distributed systems:** Raft★; Lamport and vector clocks★; token-bucket rate limiter★; queueing latency (p99 vs utilization)★.
- **System design:** case studies run on a simulator.

**Cross-links to make explicit in lessons:**
- DP ↔ Bellman equation ↔ value iteration
- chain rule ↔ backprop
- edit distance ↔ Viterbi
- heaps ↔ schedulers
- Dijkstra / Bellman-Ford ↔ routing
- hashing ↔ Bloom filter ↔ LSM tree
- graph search ↔ HNSW

---

## 6. Architecture

### 6.1 Trace engine (record → replay)

Each algorithm becomes a pure, deterministic generator. Running it to completion yields a `Trace`, and a separate player renders any step of that trace.

```ts
// src/engine/types.ts — sketch
type Id = string;                         // stable identity — never an array index

type Step = {
  line?: number;                          // pseudo-code / source line to highlight
  note: string;                           // narration (also announced via aria-live)
  vars?: Record<string, unknown>;         // variable inspector
  marks?: Record<Id, Mark>;               // compare | active | done | pivot | frontier …
  ops: Op[];                              // what changed since the previous step
  checkpoint?: Checkpoint;                // predict / be-the-algorithm prompt
};

type Op =
  | { t: 'swap'; a: Id; b: Id }
  | { t: 'set'; id: Id; value: unknown }
  | { t: 'move'; id: Id; to: number }
  | { t: 'push' | 'pop'; container: Id; id?: Id }
  | { t: 'link' | 'unlink'; from: Id; to: Id }          // lists, trees, graphs
  | { t: 'cell'; r: number; c: number; value: unknown; deps?: [number, number][] };

type Trace<S> = {
  algo: string; input: unknown; seed: number;
  initial: S; steps: Step[]; keyframes: Map<number, S>;
};

function* bubbleSort(items: Item[]): Generator<Step> { /* one Step per meaningful event */ }
```

- **Seeking.** *As built in Phase 0:* each frame stores a copy-on-write snapshot, so frames share every lane that didn't change. Seeking is a plain array lookup, and memory stays small at the input sizes the visualisers allow. Ops plus keyframes (a keyframe every ~50 steps) remain the plan for traces too large to snapshot, such as ML training runs.
- **Determinism.** Inputs come from a seeded random generator. That enables:
  - permalinks such as `?algo=quick-sort&seed=42&step=37`;
  - snapshot tests;
  - a tutor that can say "look at step 37".
- **Correctness.** Property tests (fast-check) check that replaying the trace produces exactly what the algorithm actually outputs.
- **One schema for everything.** The visual-collections API (§6.4) emits the same `Op`s, so the learner's code and the built-in algorithms share one player.
- **Caps.** Traces are capped at ~50k events. Past that, a "fast mode" drops per-comparison events.

### 6.2 Player

**API.** `useTracePlayer(trace)` returns `{ index, playing, speed, step(±1), seek(i), play(), pause() }`. It runs on a `requestAnimationFrame` clock.

**Timing.**
- Tween duration is derived from speed, which removes the delay/transition mismatch.
- Scrubbing uses zero-duration tweens.

**Keyboard.** ←/→ step, Space plays and pauses, Home/End jump to the ends.

**Accessibility.**
- `<MotionConfig reducedMotion="user">`: with reduced motion, the view cuts straight to end states while stepping and narration still work.
- Narration is announced in an `aria-live="polite"` region.
- A pause control is always available (WCAG 2.2.2).

### 6.3 Renderer primitives

| Primitive | Used by | Tech | Switch renderer above |
|---|---|---|---|
| `ArrayView` (bars, cells, pointers, windows) | sorting, searching, two pointers, sliding window, strings | SVG/HTML + Motion `layout`, keyed by id | ~500 items → Canvas2D |
| `GraphView` | graph algorithms, graph data structures, HNSW, Raft | SVG; layout computed **once** (seeded d3-force, elkjs, dagre) | ~300 nodes / 1k edges → Sigma or Pixi |
| `TreeView` | BST, AVL, red-black, B-tree, heap, trie, segment tree, recursion trees | SVG + d3-hierarchy tidy layout each frame; nodes animate by id | ~1k nodes |
| `GridView` | DP tables, pathfinding, sudoku, N-Queens, matrices | CSS grid / SVG + an overlay of dependency arrows | ~2,500 cells → Canvas2D |
| `StackQueueView`, `HashView`, `MemoryView` | linear structures, hashing, Python-Tutor mode | SVG/HTML | — |
| `PlotView` | complexity playground, loss curves, distributions, math | SVG (d3-scale/shape); Mafs for interactive planes | — |
| `NetworkView` | MLP, CNN, attention | SVG when small, Canvas or Pixi for thousands of edges | ~1k edges |
| `SurfaceView` | loss landscapes, 3D math | three.js / react-three-fiber | — |

**Design system.**
- One colour means one thing across every primitive.
- The palette is colour-blind-safe, and state is also shown by shape or pattern, never by colour alone.
- Light and dark themes.

### 6.4 Code workspace

**Editor.** CodeMirror 6: works on mobile and is roughly 200 KB, versus 2–5 MB for Monaco, which has no official mobile support.

**Run** (in the browser, free to operate):
- **Python:** Pyodide 314 in a Worker. About 6 MB, lazy-loaded, cached by a service worker.
- **JS/TS:** a Worker, with esbuild-wasm or Babel transpiling TypeScript. QuickJS where hard step or memory limits are needed.
- **Verdicts:** computed locally in practice mode and labelled as such, because hidden tests can't be hidden from a browser.

**Submit** (server, authoritative):
- **Sandbox:** Firecracker-based. Vercel Sandbox first, e2b as the alternative.
- **Languages:** Python, JS/TS, Java, C++ and Go first; Rust, C#, Kotlin and SQL later.
- **Cost:** about $0.0002 per batched submission at current published rates.
- **Rejected options:**
  - Self-hosted Judge0: its last release (April 2024) fixed a CVSS-10 sandbox escape, and there has been none since.
  - Piston: its public API closed in February 2026.

**Problem schema** (YAML validated by Zod). Each problem has:
- a typed signature that generates each language's stub and test driver;
- sample, hidden and generated tests;
- comparators: exact, float tolerance, unordered, or custom;
- per-language time multipliers;
- reference solutions in every language, all checked in CI.

The driver reads every test from stdin and writes results to a side channel, so the learner's `print` calls can't corrupt the verdict. Comparison runs outside the sandbox, in trusted code.

**Visualizing the learner's code** works in two tiers:
1. **Visual collections:** `VisualArray`, `VisualGraph`, `VisualGrid` and `VisualTree`, whose operations emit the same `Op`s as the built-in algorithms.
   - Semantics are exact: a comparison is known, not guessed.
   - Works in any language.
   - The driver wraps inputs automatically based on the signature: `List[int]` → bars, `TreeNode` → tree, a 2D list → grid, an adjacency dict → graph.
2. **Generic tracing**, Python-Tutor style, for intro lessons: `sys.settrace` inside Pyodide for Python, Babel AST instrumentation for JS.
   - **Spike first:** confirm that `sys.settrace` works inside Pyodide.

### 6.5 ML and math
- **Precompute by default:**
  - Train small models offline in PyTorch.
  - Export per-step metrics and float16 weight/activation snapshots as chunked binaries on a CDN.
  - Scrub them with the same player. This is deterministic and works on phones.
- **Train live only tiny models** (≤10k parameters), using a hand-written TypeScript autograd in a Worker. That code doubles as the "build micrograd" exercise.
- **Inference demos:** transformers.js v4 or ONNX Runtime Web, using WebGPU with a WASM fallback.
  - Avoid TensorFlow.js: no release since January 2025.
  - WebGPU is still missing on Firefox for Linux and Android, so always ship fallbacks.
- **Math:**
  - KaTeX rendered at build time (remark-math / rehype-katex).
  - Mafs for interactive 2D planes; react-three-fiber for 3D.
  - Don't depend on Desmos: its partner terms are unpublished.

### 6.6 Content system

**Lessons.**
- Written in MDX via **Fumadocs MDX** (used headless), with Zod-validated frontmatter.
- Ruled out: `next-mdx-remote` was archived in April 2026, and Contentlayer is dead.

**Widgets** are MDX components registered globally, with JSON-serializable props:
- `<Visualizer algo="quick-sort" input={[5,3,8]} mode="predict" />`
- `<Exercise id="two-sum" />`
- `<Quiz id="bst-1" />`
- `<Review card="heap-after-insert" />`

**Data.**
- Problems, quizzes, concepts and the prerequisite graph live as YAML/JSON collections.
- CI fails on broken references and builds every page.
- `src/data/visualisers.js` becomes the `concepts` collection: one source of truth for complexities, which fixes the 21 pages that currently disagree.

**i18n (later).** Per-locale content directories with stable IDs, and `next-intl` for UI strings.

### 6.7 Accounts, progress, personalization

**Anonymous-first progress.**
- Progress is an append-only event log in IndexedDB (Dexie) with UUIDv7 IDs.
- On sign-in it is pushed to the server idempotently.

**Accounts** (decided 2026-10-15).
- **Own managed Postgres** (e.g. Neon) accessed with **Drizzle**, plus **Better Auth** running inside the Next.js app. Users, sessions and every other table live in our own schema.
- No separate backend service for now. All database access goes through server-only modules (`src/server/*`): route handlers and server actions. The browser never talks to the database directly. If we later need long-running workers or a public API, those modules can be lifted into a service without a rewrite.
- Better Auth plugins cover what's coming: Stripe for paid extras, organizations for classroom mode.
- Only the server can write verdicts from the authoritative judge.

**Spaced repetition** (`ts-fsrs`). Attempt outcomes map to review ratings:

| Outcome | Rating |
|---|---|
| Failed | Again |
| Solved with hints | Hard |
| Solved | Good |
| Solved fast | Easy |

**Mastery.**
- BKT (or a lighter Elo/IRT model) per concept, over the prerequisite graph.
- A concept counts as mastered only after *delayed, varied* retrieval.
- Study plans draw next items from the "outer fringe" of what the learner has mastered.

**Study plans.** A goal (e.g. "interview-ready in 8 weeks", "ML engineer foundations"), weekly hours and a diagnostic produce a schedule over the graph. The schedule re-plans from actual performance.

```
users(id, locale, settings jsonb, created_at)
concepts(id, slug, title, domain);  concept_prereqs(concept_id, prereq_id, strength)
attempts(id uuidv7, user_id, item_id, item_version, lang, verdict, passed, total,
         runtime_ms, hints_used, code_hash, source[local|server], created_at)
mastery(user_id, concept_id, p_known, n_obs, updated_at)
review_cards(user_id, card_id, due, stability, difficulty, reps, lapses, state, last_review)
review_logs(id, user_id, card_id, rating, review_at, elapsed_days, scheduled_days)
course_plans(id, user_id, goal, target_date);  course_plan_items(plan_id, position, item_id, status, scheduled_for)
tutor_usage(user_id, day, input_tokens, cached_tokens, output_tokens, cost_usd)
-- Access control lives in server code: every query is scoped to the session user,
-- and server-judged verdicts are written only by the judge route.
```

### 6.8 AI tutor

**Models.**
- Haiku 5.5: quick hints, classification and the solution-leak check.
- Sonnet 5.5: code review and debugging.
- Opus 5.5: only where an eval shows it earns its cost.
- Rough cost per active learner at 200 turns a month: about $0.20 on Haiku to about $3.30 on Sonnet.

**Prompt layout.**
- Order: a fixed Socratic system prompt with the hint ladder → cached lesson and problem context, including the reference solution → the conversation.
- Per-turn state (the learner's code, test results, current trace step) is injected as data.
- Learner code is clearly delimited, to blunt prompt injection.

**Guardrails enforced in the UI, not just the prompt.**
- Hint levels unlock one at a time.
- A full solution only after several genuine attempts plus an explicit request.
- Before asking for help, a short "what do you think is happening?" prompt; afterwards, a one-line reflection.

**Tools.** The tutor can call `seekTrace(step)`, `highlight(ids)` and `runTests()`, so its explanations point at the visual.

**Cost and abuse control.**
- Login required.
- Upstash per-user rate limits and daily token budgets.
- `max_tokens` caps.
- A global spend kill switch.

### 6.9 Recommended stack

Versions were checked against the npm registry on 2026-10-15.

| Concern | Choice | Version |
|---|---|---|
| Framework | Next.js App Router | 16.4.1 |
| UI | React (+ React Compiler) | 19.3.1 |
| Language | TypeScript, adopted incrementally via `allowJs` | 6.0.3. TS 7 is out, but its package drops the JS compiler API that Next's type-check uses, and typescript-eslint supports only versions below 6.1. |
| Styling | Tailwind + shadcn/ui | 4.3.3 |
| Tweening | Motion (`motion/react`) | 14.2.0 |
| Layout math | d3, elkjs, dagre | — |
| Heavy 2D / 3D | PixiJS / three + react-three-fiber | — |
| Editor | CodeMirror 6 | @codemirror/view 6.43.14 |
| Python in the browser | Pyodide (in a Worker) | 314.0.7 |
| Server judge | Vercel Sandbox (alternative: e2b) | — |
| Content | Fumadocs MDX + Zod | 15.4.7 / 4.6.7 |
| Math | KaTeX, Mafs | 0.19.0 / — |
| Auth + database | Managed Postgres (e.g. Neon) + Drizzle + Better Auth | better-auth 1.7.x |
| Spaced repetition | ts-fsrs | 5.4.2 |
| AI | Claude 5.5 models via the AI SDK | ai 7.0.141 |
| Tests | Vitest + fast-check + Playwright | 5.0.4 / — / 1.64.1 |

**Upgrade notes:**
- `next lint` is removed in Next 16. Switch to the ESLint CLI with flat config; the untracked `.eslintrc.json` goes away.
- Node 22+.
- Turbopack is the default for dev and build.
- Upgrade Tailwind with `npx @tailwindcss/upgrade`.

### 6.10 Target layout

```
algorender/
  content/
    lessons/<track>/<slug>.mdx
    problems/<slug>.yaml
    concepts.yaml              # replaces src/data/visualisers.js; includes prerequisite edges
  src/
    engine/                    # types, trace builder, keyframes, seeded PRNG, useTracePlayer
    algorithms/<slug>.ts       # pure generators + pseudo-code + metadata
    viz/                       # ArrayView, GraphView, TreeView, GridView, PlotView, …
    workspace/                 # editor, runtimes (pyodide, js), visual collections, judge client
    learn/                     # lesson widgets: Predict, BeTheAlgorithm, Parsons, Quiz, Review
    progress/                  # event log, sync, fsrs, mastery
    tutor/                     # client panel (server route lives in app/api/tutor)
    app/                       # /visualisers/[slug], /learn/[track]/[lesson], /practice/[slug], /review, /plan
```

A single dynamic `/visualisers/[slug]` route replaces the 52 hand-written pages. It keeps the existing URLs, so search rankings and links survive without redirects. Legacy static folders take precedence until each one is ported and deleted.

---

## 7. Gamification design: "Play" mode

**On by default** (gives information, rewards mastery):
- **Mastery XP**, earned for:
  - first-try correct predictions and steps on *randomized* inputs;
  - delayed spaced-review recall at 1, 7 and 30 days;
  - transfer problems.
- **Zero XP** for watching or for time spent; diminishing returns on repeats and on items below the learner's level.
- **Levels per topic** (trace → predict → implement → analyze) rather than one global level. Levels were the only element with an effect in programming studies.
- **Informational badges** for learning behaviours: first-try accuracy, finding a counterexample, explaining a step. Never mandatory.
- **A daily challenge**: your due reviews plus one new item.

**Opt-in only:**
- **Weekly streaks** ("4 review days a week"), with free built-in repair and no loss-framed notifications.
- **Skill-matched leagues** of about 30 people:
  - ranked on mastery XP, with team and co-op variants;
  - the default view is your personal best plus a histogram of everyone's solutions (as in Zachtronics games), not a rank.
- **Timed modes**, only on material the learner has already mastered.
- **Asynchronous duels** on randomized interactive traces. AI copy-paste can't shortcut "perform step 7 of this heap".

**Never:**
- XP for activity or time
- paid streak repair or XP boosts
- hearts or lives that block practice
- loot boxes
- global all-time leaderboards on code problems
- public ranking of beginners

**Game modes built on the engine:**
1. **Be the Algorithm:** perform the next swap, relaxation or rotation; any divergence from the true trace is visualized.
2. **Predict the Frame.**
3. **Comparison Budget:** sort using fewer comparisons than merge sort. This teaches the n log n lower bound.
4. **Invariant Puzzles:** keep heap, BST or red-black properties valid under scripted operations.
5. **Break It:** craft quicksort's worst case, a hash-flooding input, a counterexample to a greedy algorithm, or a learning rate that diverges.
6. **Debug It:** a buggy implementation's trace diverges from the correct one; find the faulty line.
7. **Constrained-instruction puzzles** (in the style of Human Resource Machine), scored on steps and memory against a histogram of all players.
8. **ML challenges:**
   - gradient-descent golf;
   - hyperparameter tuning with a budget of runs and a *hidden* test set, so overfitting the public board is itself the lesson;
   - diagnose-the-loss-curve.
9. **Boss battles:** cumulative, interleaved challenges, e.g. "pick and run the right shortest-path algorithm".

**Measuring it.**
- Run an A/B test for 12+ weeks with a holdout group that has gamification off; novelty effects dip around week 4.
- Decide on learning metrics.
- Watch the ratio of XP to mastery gained, the rate of rapid guessing, and outcomes for the bottom quartile.

---

## 8. Roadmap

Every phase ships something usable; nothing waits for the whole revamp. Old pages stay live until their replacement ships.

### Phase 0 — Foundation

**Work:**
- **Upgrades:** Next 15.5 → 16 and Tailwind 3 → 4; TypeScript via `allowJs`; ESLint flat config; Vitest and Playwright.
- **Design system:** tokens for light and dark themes, a colour-blind-safe state palette, accessible base components.
- **Engine:** types, trace builder, keyframes, seeded random generator, `useTracePlayer`.
- **Controls and panes:** a `<Stepper>` (step, scrub, speed, keyboard, reduced motion), plus narration and pseudo-code panes.
- **Primitives:** `ArrayView` and `GridView` first.
- **Proof:** port the 8 sorting algorithms to generators.

**Done when:**
- In bubble, quick and merge sort, bars visibly move, the run steps backward and scrubs, and a URL can link to a specific step.
- Property tests pass.
- Lighthouse accessibility score ≥ 95.

**Status (2026-10-15, branch `revamp/phase-0`):**
- **Done:**
  - Upgraded to Next 16.4, React 19.3, Tailwind 4.3 and TypeScript 6.0 (with `allowJs`), with ESLint flat config, Vitest + fast-check and Playwright.
  - Engine built: `src/engine`, `src/viz/array`, `src/components/explorer`.
  - All 8 sorting algorithms ported, served by `app/visualisers/[slug]`; the old pages and `SortingChart` are deleted.
  - 53 unit and property tests: sorted output, no element lost or duplicated in any frame, valid pseudo-code lines, stability where claimed.
  - 16 Playwright tests, covering:
    - every sort runs to the end;
    - bars glide rather than jump, measured per animation frame;
    - reduced motion cuts straight to each state;
    - keyboard controls, step-back, deep links and custom input;
    - no horizontal scroll on mobile.
- **Not done:**
  - `GridView` moves to Phase 1 alongside the DP ports.
  - The Lighthouse accessibility audit hasn't been run yet.
  - The dark theme waits until the legacy pages, which hard-code light colours, are ported.

### Phase 1 — Port and teach

**Work:**
- **Primitives:** `GraphView`, `TreeView`, `StackQueueView`, `HashView`.
- **Port** the remaining 44 visualizers, fixing the correctness bugs found in the audit.
- **Structure:** the lesson template and `concepts.yaml`; one dynamic `/explore/[slug]` route; per-page metadata and OG images; a sitemap.
- **Features:** predict gates, custom and adversarial inputs, algorithm races, the complexity playground, permalinks and embeds.
- **New DS&A pattern visualizers:** sliding window, two pointers, monotonic stack, union-find, intervals, the backtracking tree, the DP family.

**Done when:**
- All 52 visualizers run on the new engine.
- The old `/visualisers/*` URLs redirect.
- Every concept has hook → see → predict.

**Status (2026-10-15, branch `revamp/phase-1`):**
- **Done:**
  - **Engine generalised:**
    - `AlgorithmModule` / `StructureModule` with typed inputs, so data structures are changed by operations, with undo and `?ops=` links.
    - One renderer per view kind.
    - A shared mark vocabulary.
  - **Predict mode:** checkpoint questions gate the player, with a score.
  - **All 52 visualisers ported:** URLs unchanged, so no redirects are needed. That's 39 algorithms plus 13 data structures, on five new views (grid, graph, tree, linear/hash, text), with the audit's bugs fixed.
  - **Bloom filter:** working again and unhidden.
  - **New pattern visualisers:** two pointers, sliding window, monotonic stack.
  - **New pages and features:**
    - `/compare`: a sorting race on a shared work clock, plus a growth chart with n²/2 and n log₂ n references, a table view and keyboard access.
    - `/embed/[slug]`, with an embed-snippet button.
    - Sitemap, robots, `metadataBase`.
  - **Tests:** 714 unit/property tests (713 pass, 1 skipped) and 80 Playwright tests, including a smoke test of every visualiser. The registry test checks every module against the shared rules.
  - **Cleanup:** legacy components, hooks and empty folders removed. Lint has 0 warnings.
- **Not done:**
  - The lesson template and `concepts.yaml`.
  - Union-find, intervals, the backtracking decision tree and the extra DP family.
  - OG images.
  - Letting `disabledReason` see an operation's arguments. For now, an invalid argument gets a narrated explanation frame instead.
  - A choice-type argument (pick an existing vertex).
- **Carried to Phase 1b, before Phase 2.**

**Phase 1b status (2026-10-15, branch `revamp/phase-1b`):**
- **Done:**
  - **Lessons:**
    - `concepts.yaml` concept graph, validated by Zod.
    - A `/learn` concept map.
    - Four MDX lessons: binary search, two pointers, memoization and Dijkstra. Each follows hook → parts → see → predict → check → recap, with KaTeX math.
    - Embedded visualisers in a `lesson` variant, prediction challenges, quizzes, and progress kept in localStorage.
  - **New visualisers (9, so 64 in total):**
    - DP: coin change, longest increasing subsequence (with a patience-sorting mode), unique paths, house robber.
    - Intervals: merge intervals, meeting rooms.
    - Backtracking: subsets and permutations, drawn as decision trees.
    - Union-find, with union by rank and path compression.
  - **View extensions:** grid bars, walls, groups and empty states; tree forests and search trees with a sideways layout on phones.
  - **Operations:**
    - `disabledReason` sees an operation's arguments, so forms block bad input as you type.
    - Choice arguments let you pick an existing vertex, edge or key, and replace the error frames.
  - **OG images:** for the site, every visualiser and every lesson.
  - **Home page:** links to Learn and Compare.
  - **Tests:** 943 unit/property tests (942 pass, 1 skipped) and 97 Playwright tests, covering the lessons and every visualiser.
- **Not done:**
  - Lessons for the remaining concepts. The map lists them as planned.
  - ~~The Lighthouse accessibility audit~~ and ~~dark theme~~: done on `revamp/a11y-dark`, below.

**Accessibility and dark mode (2026-10-15, branch `revamp/a11y-dark`):**
- **Audit:**
  - axe-core (WCAG 2.2 A/AA plus best practice) ran over all 74 pages. Run in place of Lighthouse, which uses the same engine on fewer rules.
  - The baseline found five rules failing.
    - Colour contrast: 272 elements, mostly `gray-400` text at about 2.5:1, and white on the green and orange mark fills.
    - Tabs whose `aria-controls` pointed nowhere.
    - Duplicate landmarks when a page holds two visualisers.
    - Heading order in the view panels.
    - An unroled chart element with an `aria-label`.
  - All are fixed. `e2e/a11y.spec.ts` now scans every page in both themes on every run.
  - Manual checks:
    - A keyboard walk: every focus visible and clear of the sticky header (`scroll-padding-top`).
    - 320px reflow with no horizontal scroll.
    - Reduced motion now also stops CSS tweens.
    - Narration as a polite live region.
    - The mobile header now shows Learn and Compare, which phones could not reach before.
- **Dark mode:**
  - Semantic colour tokens replace ~600 palette classes.
  - Follows the OS, with a System/Light/Dark toggle in the header, applied before paint so it never flashes.
  - `?theme=` for embeds.
  - Compare-page series use the dataviz dark steps, validated against the dark card.
  - Mark fills stay Okabe–Ito. The validator flags three as bright for the dark band, but stepping them down merges amber into orange, so that is a recorded trade-off.
- **Tests:**
  - 943 unit tests (942 pass, 1 skipped).
  - 247 Playwright tests, including 150 axe scans, all passing against a production build.
  - The suite can now run on `next start` as well as `next dev`.

### Phase 2 — Code workspace

**Work:**
- **Runtime:** CodeMirror; Pyodide and JS/TS Workers; the visual-collections API for Python and JS.
- **Tracing:** Python-Tutor-style trace mode, after the `settrace` spike.
- **Exercises:** Parsons, fill-in, faded examples and bug-hunt; the PRIMM exercise template.

**Done when:** a learner writes bubble sort in Python or JS and watches *their* code drive `ArrayView`.

**Status (2026-10-15, branch `revamp/phase-2`): the "done when" is met. This is Phase 2a.**
- **Spike, resolved:**
  - Pyodide 314 (Python 3.14) runs in a Web Worker, and `sys.settrace` and `ast` work there.
  - The Python worker is a static script in `public/workers/`, loading Pyodide from the jsDelivr CDN. (Since 2b, both workers are classic scripts inside the sandbox, below.)
  - The cold load takes about 6 s, and the browser cache shortens later ones.
- **Built:**
  - **One event protocol and a shared contract** (`src/workspace/protocol.ts`, `contract.ts`). Both runtimes pass identical cases, with exact events, lines and variables.
  - **Python runtime:** an AST rewrite records exact comparisons, a `VisualList` records writes, a step limit stops endless loops, and `print`/`input` are captured.
  - **JS/TS runtime:** sucrase strips TypeScript, then acorn and astring instrument the code. It runs in strict mode, and a learner's try/catch can't swallow the limits.
  - **Trace and editor:** events become the same trace the built-in visualisers play, with swaps recognised and index variables drawn as pointers. The editor is CodeMirror 6, themed by tokens; it highlights the run line and error line and has Ctrl/⌘+Enter to run.
  - **Workspace pages:** `/code` and `/code/[slug]`. Four exercises (bubble, insertion and selection sort, and binary search) come with starters, solutions, examples, judged tests, explanatory checks and staged hints.
- **Tests:**
  - Unit tests cover the runtimes and trace conversion.
  - Every exercise solution is checked in all three languages, and they must do the same things to the array.
  - `e2e/workspace.spec.ts` covers JS and Python runs, errors, storage and axe in both themes.
- **Phase 2b (branch `revamp/phase-2b`):**
  - **Done:**
    - **The fading ladder** on every write exercise: put the lines in order (Parsons, with distractors; Python asks for indentation too), fill the gaps (1 to 5 gaps per level), then write it.
    - **Hints:** "point out a misplaced line" and "reveal a gap" are opt-in.
    - **Verdicts come from running the tests,** so any working answer passes.
    - **New exercises:** three bug hunts and a Modify exercise.
    - **PRIMM:** `PredictCode` (running is locked until the learner predicts) and `CodeExercise` lesson widgets, plus PRIMM section steps, with the lesson "Bubble sort in code" (`/learn/sorting-in-code`).
    - **Visual grids:**
      - `table()` and `array()` work in both runtimes.
      - Cell writes carry their dependencies, and the run plays on GridView with arrows.
      - New exercise: "Count the paths through a grid".
    - **Python-Tutor-style line tracing (`mode: 'lines'`):**
      - Both runtimes record the call stack and the reachable heap before every line, at every return, and as an exception unwinds. Object ids stay stable for the run, so aliases share an arrow. Twelve shared contract cases compare the steps across languages.
      - `MemoryView` (`src/viz/memory/`) draws frames, objects and arrows, with change cues and a full spoken description.
      - The narration says what each line did, and quotes the condition an `if` or `while` tested.
      - Every exercise has a "Line by line, with memory" switch.
      - The `TraceCode` lesson widget traces short snippets (`src/content/snippets.ts`), with an optional predict-first lock. The new lesson "Recursion: watch the call stack" (`/learn/recursion`) is built on it.
    - **Graphs and trees for learner code:**
      - Both runtimes take a `graph` argument (a read-only dict of neighbour lists whose reads are events) and a `tree` argument (LeetCode's `TreeNode`), with shared contract cases.
      - Their runs are watched line by line and drawn on GraphView and TreeView from the learner's own variables: queues and stacks wait, sets and dicts record, the call stack's nodes draw the path, and the edges that first reached each node draw the search tree. Narration adds what the line read ("takes the edge A – B").
      - New exercises: BFS levels, DFS order, BST insert and inorder traversal, each with the full fading ladder and feedback that names common mix-ups (breadth-first order for DFS, preorder for inorder).
    - **Sandboxed learner code:**
      - Both runners' workers live in hidden `<iframe sandbox="allow-scripts">` frames (`public/sandbox.html`). Learner code therefore has an opaque origin: no app cookies, storage or same-origin API calls, which is ready for accounts and shared code in Phase 3. A CSP limits its network access to the Pyodide CDN.
      - The page hands each worker its script as text and a `MessagePort`, and a timeout removes the frame. The JS worker is bundled by esbuild (`scripts/build-workers.mjs`) into a classic script, since a module worker can't start from a blob in an opaque origin.
      - Checked in Chromium: Pyodide stays in the browser cache across visits, the CSP blocks other hosts, and e2e covers the isolation. Firefox and Safari aren't checked yet.
  - **Status (2026-10-16): Phase 2b is done.**
  - **Deferred, with a reason: a service worker for Pyodide.** The browser already caches the CDN download. A repeat visit still takes about 6 s, but that is WebAssembly compile and start-up, which a service worker can't speed up. It would only add offline use.

### Phase 3 — Practice and progress

**Work:**
- **Problems:** the problem schema and code generation; about 75 problems tagged by pattern (Grind/NeetCode-style coverage).
- **Judging:** the local judge; the server judge (Vercel Sandbox) for Java, C++ and Go.
- **Feedback:** failing tests replay visually; pattern drills.
- **Progress:** Postgres + Better Auth, the local-first event log with sync, and the FSRS review queue with auto-generated cards.

**Done when:** a learner can sign in, solve problems in 5 languages, and use a daily review queue that works offline and syncs.

**Split into three steps, each on its own stacked branch:**
- **3a: problems and the local judge** (`revamp/phase-3a`).
  - **Problems:** one YAML file per problem (`src/content/problems/`, validated by Zod) with an original statement, a typed signature, examples, hand-picked tests, seeded generated tests, a comparator, hints, the pattern and why it fits, and reference solutions.
  - **Signature types:** `int`, `float`, `bool`, `string`, arrays and 2D arrays of them, `TreeNode` and `ListNode`. A `void` function is judged on the argument it changes in place, and a design problem is judged on a sequence of method calls.
  - **Generated code:** each language's stub comes from the signature.
  - **Judge mode in both runtimes:** the code runs without instrumentation, so large tests run at full speed. The judge compares answers with an exact, float-tolerance, unordered or custom check, in trusted code.
  - **Pages:** `/practice` lists problems by pattern and difficulty, and `/practice/[slug]` holds the statement, editor, examples, submission and verdicts.
  - **Replay:** a failing test can be watched on the array, grid, tree or memory view.
  - **Pattern drills:** "which pattern fits?" questions that mix patterns.
  - **Content:** about 75 problems. Every reference solution runs against every test in Python, JavaScript and TypeScript.
  - **Status (2026-10-16): 3a is done.**
    - **Content:** 91 problems (20 easy, 65 medium, 6 hard) across 22 patterns, from hashing to bit manipulation, including six design problems (stack with minimum, LRU cache, trie, word dictionary, median finder, kth largest in a stream).
    - **Checks:** every problem passes its examples, about 5 hand-picked edge cases and 6–10 seeded random tests in Python (Pyodide), JavaScript and TypeScript through the browser's own judge. Every stub parses and fails something. Every example replays on its view.
    - **Watching a failing test:** an `int[]` argument now plays line by line on the array view (`traceArray.ts`), with the learner's index variables drawn as pointers at every line. A run recorded only at comparisons and writes missed code that reads cells inside arithmetic.
    - **Links:** visualiser pages list the problems that use them, and the home page, header and sitemap link to `/practice`.
    - **Left for 3c:** Java, C++ and Go stubs and drivers (the signature types map onto them directly), and the server judge.
- **3b: accounts and progress** (`revamp/phase-3b`).
  - **Accounts:** Drizzle over Postgres (PGlite in development and tests, any Postgres through `DATABASE_URL`) and Better Auth.
  - **Progress:** the local-first event log (IndexedDB, UUIDv7) with an idempotent sync route. Existing localStorage progress moves into it.
  - **Review:** the FSRS review queue (`ts-fsrs`) with cards generated from solved problems and lesson quizzes, and `/review` working offline.
  - **Status (2026-10-16): 3b is done.**
    - **Accounts:** Better Auth with email and password (GitHub and Google when their keys are set), database sessions, rate limits counted in the database, and Origin checks on every state-changing request. `/account` signs in, shows sync and a progress summary, signs out and deletes the account (with its progress).
    - **Database:** Drizzle over PGlite locally (no setup) or any Postgres through `DATABASE_URL`, with `npm run db:migrate` for real databases.
    - **Progress:** an event log, not tables of totals. Six event kinds, each a fact with a UUIDv7 id and the device's time; solved problems, lesson scores, exercise stages and review schedules are all computed from the events. This replaces the plan's `attempts`/`review_cards`/`review_logs` tables (§6.7): one table holds everything, two devices merge by union, and the device works the same online and off.
    - **Sync:** the device keeps its events in IndexedDB, claims anonymous work on sign-in, pushes unsent events (idempotent) and pulls from a cursor, offline included. Explicit sign-out removes the account's events from the device; an expired session only hides them. Progress from localStorage is imported once.
    - **Review:** FSRS, day-based and deterministic. Solving a problem makes a recall card ("which pattern, what key idea?", self-rated); a lesson quiz answer makes that question come back. `/review` shows due cards with keyboard ratings and the next interval on each button, and the header shows how many are due.
    - **Offline:** a service worker caches pages network-first and hashed assets for good, and precaches `/review`. e2e covers rating offline and syncing once back.
    - **Left for later:** email verification and password reset (they need an email provider), and a mastery model over the concept graph (Phase 5).
- **3c: the server judge** (`revamp/phase-3c`).
  - **Drivers:** generated drivers for Java, C++ and Go, which read typed tests on stdin and write answers to a side channel.
  - **Sandbox:** Vercel Sandbox behind sign-in and quotas, with server-written verdicts.
  - **Checks:** reference solutions in all five languages, checked in CI.
  - **Status (2026-10-16): 3c is built; it runs on Vercel once the owner sets up the sandbox snapshot.**
    - **Languages:** Java, C++ and Go join Python, JavaScript and TypeScript on every problem. Their stubs follow LeetCode's conventions, generated from the same signatures.
    - **Drivers:** generated per problem and language. Tests go in as typed tokens on stdin; answers come back as JSON lines on a side file, so the learner's prints never mix with them and are split by test. Errors point at the learner's own line in all three languages; C++ crashes, endless recursion, endless loops and compile errors each get a plain explanation. Expected answers never enter the sandbox: the server judges with the same comparators and checks as the browser.
    - **Sandbox:** a Vercel Sandbox microVM per run (Firecracker), started from a snapshot with the toolchains, with no network, stopped as soon as the answers are read. Locally the same script runs in a Docker container with no network. One request compiles once and judges every test.
    - **Accounts and quotas:** server runs need sign-in; one at a time, 30 an hour and 200 a day by default, counted in a `judge_run` table. A submission's verdict is written by the server as a verified `problem.submitted` event, which devices pull like any other; a device can't claim `verified` itself.
    - **Left for later:** hidden tests (every test still ships with the page, for the browser's judge), watching a Java/C++/Go run step by step, and Rust, C#, Kotlin and SQL.

### Phase 4 — Math and ML tracks

**Work:**
- **Primitives and rendering:** `PlotView`, `NetworkView`, `SurfaceView`; KaTeX; Mafs.
- **Math, build first:** grid warps, eigenvectors, gradient descent and optimizers, the chain-rule graph, Bayes, CLT, entropy and KL, SVD, floating point.
- **ML, build first:** linear and logistic regression, k-means, decision trees and boosting, perceptron and MLP, micrograd, CNN, attention, BPE, sampling, KV cache, gridworld Q-learning, 2D diffusion.
- **Supporting work:** an offline training pipeline for precomputed traces; the "build micrograd visually" track.

**Done when:** the math and ML tracks on the concept map open real lessons, and each concept on the build-first lists has a visualiser that runs on the trace engine with Predict mode.

**Decisions (2026-10-17):**
- **Our own SVG `PlotView`, not Mafs.** It shares the theme tokens, the marks, Motion tweens keyed by stable id, and the screen-reader description pattern of the other views. Mafs is slow-moving (§10) and would be a second visual language.
- **Direct manipulation through the trace engine.** A view can draw draggable handles; the module maps a drag to a new input (`input.drag`), the explorer records the trace again and stays on the same frame. Handles also move with the arrow keys, and the custom text input is the non-dragging alternative (WCAG 2.5.7).
- **Contours before 3D.** Loss surfaces are drawn as contour maps (marching squares) on `PlotView`. `SurfaceView` (three.js) waits until a lesson needs real 3D, since it costs ~600 KB.
- **TypeScript before PyTorch.** Models small enough to train in the browser train in TypeScript, deterministically from a seed, so traces stay reproducible and testable. Precomputed traces are produced by TypeScript scripts at build time. A PyTorch pipeline is added only when a model is too big for that (a CNN on real images).

**Split into four steps, each on its own stacked branch:**
- **4a: plots and the first math** (`revamp/phase-4a`).
  - **Primitive:** `PlotView` (planes with axes, warped grids, vectors, points, paths, infinite lines, contour maps and draggable handles, plus matrix and readout panels).
  - **Linear algebra:** matrices as grid warps (with the determinant as area), eigenvectors.
  - **Calculus and optimization:** the derivative as the limit of secants, gradient descent on contour maps, and momentum, RMSProp and Adam racing on the same surface.
  - **Site:** a "Math & ML" section on the home page and in search; the math and ML tracks open on the concept map; lessons on transformations, eigenvectors and gradient descent.
  - **Status (2026-10-17): 4a is done.**
    - **PlotView:** planes with warped grids, vectors, points, paths, infinite lines, labels and contour maps, plus matrix and readout panels; shapes glide by id between frames, labels nudge apart, and a text description goes to screen readers. Planes stack on phones and pass axe in both themes.
    - **Direct manipulation:** handles drag (or move with the arrow keys); the trace is recorded again in place on the same frame, the URL and the input box follow, and Predict answers reset with the new trace.
    - **Visualisers (5):** linear transformations (columns as where î and ĵ land, the grid warping in steps, the determinant as area, flips and squashes), eigenvectors (a sweep around the circle that stops on every eigen direction, then the whole plane moved with the eigen lines fixed), derivatives (secants shrinking to the tangent, left and right limits, the corner of |x|, then f′ traced), gradient descent (four surfaces, step sizes that converge, crawl, zigzag or diverge, local minima, a draggable start) and a race of gradient descent, momentum, RMSProp and Adam.
    - **Checks:** property tests against the maths (images of î, ĵ and v; parallel A·v exactly at eigen directions, with eigenvalues multiplying to det A; secant and tangent slopes; every descent step is x − η∇f; the race's plain descent matches the gradient-descent visualiser step for step; momentum and Adam beat plain descent in the ravine and the banana), and e2e for dragging, keyboard handles and the Math & ML tab.
    - **Lessons:** "Matrices move space", "Eigenvectors" and "Gradient descent: how models learn", each with a predict challenge and a quiz.
    - **Left for 4b+:** code exercises on math (implement a gradient step), histograms and image parts for `PlotView`, and `NetworkView`.
- **4b: probability, information and numbers** (`revamp/phase-4b`): Bayes as areas, the CLT sampler, entropy, cross-entropy and KL, SVD image compression, floating-point bit layout.
  - **Status (2026-10-17): 4b is done.**
    - **PlotView additions:** bar charts with named (categorical) ticks, grayscale and signed pixel images, bit rows split into toned fields, and fill strength for meaningful areas.
    - **Visualisers (5):**
      - **Bayes' rule:** everyone as a square split by the prior, a zoom on the evidence strip, natural frequencies, a second test that uses the posterior as the new prior, and draggable prior and likelihoods.
      - **Central limit theorem:** four populations and a sample-size slider; the means pile up against N(μ, σ/√n).
      - **Entropy:** surprise in bits per outcome, entropy, cross-entropy against a model Q, and KL. The bars can be dragged, and a model that rules out a possible outcome costs infinite bits.
      - **SVD:** six 24×24 pictures rebuilt one rank-1 piece at a time, with energy, storage and error; the decomposition is a one-sided Jacobi SVD of our own.
      - **Floating point:** float32 sign, exponent and fraction; the exact stored value (via BigInt) against the number asked for; neighbouring floats; subnormals, ±0, ∞, NaN and 0.1 + 0.2.
    - **Checks:** property tests against the maths:
      - Bayes: the areas tile the square, and the green share is the posterior.
      - Entropy: Gibbs' inequality.
      - SVD: reconstruction, orthonormality and Eckart–Young at every rank.
      - Floating point: bits match Float32Array, and exact decimals are right.
      - CLT: the means' average and spread agree with μ and σ/√n.
    - **Lessons:** Bayes' rule, the central limit theorem, and entropy and KL.
    - **Left for later:** lessons for SVD and floating point, Monte Carlo and Markov chains, and the geometric (rotate–stretch–rotate) picture of SVD.
- **4c: classical ML and micrograd** (`revamp/phase-4c`): the chain-rule computation graph (`NetworkView`), a TypeScript autograd that doubles as the "build micrograd" exercises, linear and logistic regression (drag the points), k-means, decision trees and boosting, the perceptron and an MLP playground.
  - **Status (2026-10-17): 4c is done.**
    - **Primitives:** network diagrams as a PlotView part (value boxes, operation circles, neurons; edge width and hue from signed weights), decision-region heatmaps, a micrograd-style autograd engine, and seeded 2D datasets.
    - **Visualisers (8):**
      - **The chain rule:** forward, then backward node by node with the reason for every local derivative, accumulation when a value is reused, and a nudge check at the end.
      - **Linear regression:** residuals drawn as real squares, draggable points, a comparison with least squares.
      - **Logistic regression:** probability regions and a cross-entropy chart, failing honestly on XOR and circles.
      - **k-means:** territories and moving centroids, draggable starts, local optima.
      - **The perceptron:** never converging on XOR.
      - **Decision trees:** Gini splits with the tree drawn as it grows, and overfitting.
      - **Gradient boosting:** stumps fitted to residuals, with shrinkage.
      - **An MLP playground:** hidden units bending the boundary, live weights on the diagram.
    - **Build micrograd:** three code exercises in Python, JavaScript and TypeScript (backprop through a neuron by hand, each operation's local gradient, the topological backward pass), with checks that name the usual mistakes.
    - **Checks:**
      - Autograd against finite differences; the MLP's hand-written backprop against autograd to 1e-9.
      - Each split and stump against a brute-force optimum.
      - Inertia never rises; gradient descent reaches the closed-form least squares.
      - The perceptron stops exactly on separable data.
      - Every chain-rule question is answered by the next frame.
    - **Lessons:** backpropagation (with the exercises), linear regression, and neural networks.
    - **Left for later:** lessons for logistic regression, k-means and trees, and a validation set to show overfitting directly.
- **4d: deep learning, LLMs and RL** (`revamp/phase-4d`): CNN kernels and feature maps, attention, BPE, sampling, the KV cache, gridworld Q-learning, 2D diffusion, and the build-time pipeline for precomputed traces.
  - **Status (2026-10-18): 4d is done.**
    - **PlotView additions:** token rows (chips that glide when tokens merge or arrive), outlined boxes and per-pixel values on images, sized images, and an intensity heatmap for weight matrices.
    - **Visualisers (7):**
      - **Convolution:** a 3×3 kernel sliding over a picture, the feature map filling in, the output-size formula, stride, ReLU and max-pooling.
      - **Attention:** 2D queries, keys and values drawn as arrows; scores, ÷√d, softmax, the weighted sum tip to tail, the full matrix, a causal mask, and a draggable query.
      - **BPE:** pair counts, merges, re-tokenising the text, then encoding an unseen word by replaying the merges.
      - **Sampling:** logits from a toy word model, temperature, top-k and top-p cuts, and a seeded draw on cumulative slices.
      - **KV cache:** K and V growing a row per generated token, rows computed with and without a cache, and an illustrative memory calculation.
      - **Q-learning:** ε-greedy tabular Q-learning on cliff, maze and near-or-far gridworlds, with every TD update narrated.
      - **Diffusion:** a 2D cloud noised by the closed form, then fresh noise turned back into the shape by a trained denoiser.
    - **Build-time pipeline:** `npm run models` trains models too slow for the browser, deterministically, in TypeScript (bundled with esbuild), and writes compact JSON to `src/ml/pretrained/`. A test fails on stale weights (config hash) and checks quality. The first model is the diffusion denoiser: 27 KB, about 50 s to train.
    - **Checks:** property tests against references:
      - convolution and pooling;
      - softmax attention and masking, and cached attention equal to a full recompute at every step;
      - BPE against a reference trainer, merges replayed on new text, and lossless joins;
      - temperature, top-k and top-p, and the drawn token's interval;
      - TD updates, and Q against value iteration's Q*;
      - forward-process statistics, denoiser gradients against autograd, and reverse samples landing on the shape.
    - **Lessons (10):**
      - New for 4d: convolution, attention, how a language model writes, Q-learning and diffusion.
      - The 4a–4c gaps: SVD, floating point, logistic regression, k-means, and decision trees with boosting.
    - **Left for later:**
      - a CNN trained on real images (the first model too big for TypeScript);
      - multi-head attention and positional encodings;
      - policy gradients;
      - lazy-loading modules per page, so pretrained weights stop shipping with every visualiser.

### Phase 5 — Personalization and tutor

**Work:**
- **Personalization:** the knowledge-map UI, diagnostic placement, BKT mastery, the study-plan generator.
- **Tutor:** grounded, with a hint ladder, trace tools, a leak check and budgets.
- **Assessment:** explain-it-back; misconception-targeted quizzes.

**Decisions (2026-10-18):**
- **Mastery is a projection of the event log, not a table.** BKT runs over the same events on every device, like FSRS review, so it works offline and merges by union. The `mastery` table in §6.7 isn't needed.
- **Placement uses the lesson quiz questions** and the prerequisite graph, so it grows with the lessons. It records its own event kind, so a placement miss never becomes a review card.

**Split into four steps, each on its own stacked branch:**
- **5a: mastery and the knowledge map** (`revamp/phase-5a`).
  - **Status (2026-10-18): 5a is done.**
    - **Mastery:** BKT per concept from quiz answers, prediction challenges, exercises, problem submissions and reviews. "Mastered" needs delayed, varied retrieval; anything less is "practised" or "learning". Known concepts make their untouched prerequisites "assumed".
    - **Knowledge map:** every concept card on `/learn` shows its status or "Ready to start". A next-steps panel lists started concepts, then the fringe across the three areas, with mastery counts.
    - **Placement check:** `/learn/placement`, up to 12 adaptive questions that split the unsettled part of the graph. "Not sure" beats guessing, a beginner is let off after three misses in an area, and the results list what was placed out and where to start, including the math an ML goal needs.
    - **Checks:** unit tests for tracing, every event's evidence, statuses and the fringe. A property test runs 200 simulated learners whose knowledge respects the graph and checks the check never settles a concept wrongly. E2e covers the placement flow and a lesson answer showing up on the map, with axe on each state.
- **5b: study plans** (`revamp/phase-5b`): a goal plus weekly hours produce a schedule over the graph that re-plans from performance.
  - **Status (2026-10-18): 5b is done.**
    - **Plans are a projection, too.** A `plan.set` event holds the goal, hours a week and an optional target date, and the schedule is recomputed from the events, so it re-plans itself. The `course_plans` tables in §6.7 aren't needed.
    - **Goals:** coding interviews, DS&A foundations, ML foundations, and deep learning with LLMs. Each lists its target concepts in teaching order, and prerequisites arrive just before they're needed.
    - **Schedule:** concepts are packed into weeks at the chosen hours, with 15% kept for reviews. Each concept's time estimate counts its lesson, visualisers, two problems, an exercise and a later review. For a fresh learner, interviews comes to 38 h and ML foundations to 9 h.
    - **On track:** the plan says whether you're on track against the schedule as set, and how many hours a week a target date needs, or that no pace can meet it.
    - **`/plan`:** shows the goal with progress and a projected finish, an "up next" card (lesson or visualisers, the easiest unsolved problems, an exercise, and reviews due), and the weeks ahead.
    - **Mark as known:** a "concept.marked" event lets the learner move past concepts with nothing to answer (Big-O, B-trees). It counts like a right placement answer.
    - **Navigation:** the header gains "Plan", and the concept map links to the plan.
    - **Checks:**
      - Unit and property tests: prerequisite order for every goal; packing within the hours, in order and unsplit; dropping known concepts; re-planning from the current week; the behind count against the original schedule; and the hours a target date needs.
      - E2e: make a plan, mark a concept known, see the next one, then stop the plan, with axe on each state.
- **5c: the AI tutor** (`revamp/phase-5c`): grounded in the reference solution and the live trace, with a hint ladder enforced in the UI, trace tools, a leak check, budgets and a kill switch.
  - **Decisions (2026-10-18, owner):**
    - **Provider:** Azure AI Foundry, not the Anthropic API directly, for access to more models.
    - **Models:** `gpt-6.1-luna` for hints and the leak check, and `gpt-6.1-sol` for code review. Both are deployment names held in env vars.
    - **Access:** free for signed-in learners.
    - **Budgets:** 30 turns per learner a day, and a $5 a day cap across everyone.
  - **Status (2026-10-18): 5c is built, switched off until the Azure settings and the migration are in place.**
    - **Where:** a tutor panel beside every practice problem and code exercise.
    - **Before the first hint:** the learner says what they think is happening.
    - **Hint ladder:** a nudge, where to look, the steps, a partial fix. It climbs one level at a time per item, on the server. The last level needs a failed run and two earlier hints.
    - **Review my code:** the strong model says where the bug is and why, without fixing it.
    - **Follow-ups and reflection:** follow-up questions stay at the current level. An optional "What will you try?" travels with the next turn.
    - **Line pointer:** a reply that points at a line highlights it in the editor. This is the first of the plan's trace tools; `seekTrace` and `runTests` are left for later.
    - **Grounding:** the statement, the authors' hints and approach, and the reference solution in the learner's language, which the tutor is told never to quote.
    - **Learner data:** fenced and defused against prompt injection.
    - **Leak check:** deterministic (code allowed per level, and overlap with the solution's token runs the learner doesn't already have), then a fast-model check for the levels that may contain code. A leak is retried once, then replaced.
    - **Budgets and kill switch:** turns and costs are recorded in a new `tutor_turn` table. They enforce the per-learner turns and the global daily spend cap. `TUTOR_ENABLED=off` switches the tutor off.
    - **Checks:** 14 service tests on in-memory Postgres with a scripted model, and an e2e test of the whole panel with a stand-in model, including axe.
    - **Left for later:** streaming replies, the `seekTrace`/`runTests` tools, a tutor on visualisers and lessons, and real price figures for the two deployments.
- **5d: assessment:** explain-it-back with rubric scoring, and misconception-targeted quizzes (`revamp/phase-5d`).
  - **Decisions (2026-10-18):**
    - **Mistakes live in the lessons.** Each `<Misconception>` gets an id and hidden probe questions, and quiz choices that embody a mistake point at it (`traps`), so the MDX stays the one source. A mistake is evidence the learner holds, not just a wrong answer.
    - **Scoring reuses the tutor.** The fast model scores explanations on the tutor's settings and budgets (no new table: a `tutor_turn` with action `explain`). With the tutor off, or signed out, the learner scores themselves against the rubric and an example answer, so the feature works for everyone.
    - **Mistakes gate mastery.** A concept can't be mastered while a mistake in its lesson is open.
  - **Status (2026-10-18): 5d is built.**
    - **Mistakes:** every lesson names two common mistakes (sorting-in-code included), each with two probes and at least one quiz question that traps it. Picking a trapped answer, in a lesson quiz or the placement check, names the mistake on the spot and links to its correction. It records a `misconception.picked` event.
    - **Clearing them:** the mistake gets its own review card, due the next day, which asks its probes in turn and then shows the correction. Two right answers in a row clear it, and making it again reopens it. The mistake box in the lesson says where the learner stands, and `/learn` lists the mistakes still to clear.
    - **Explain it back:** every lesson ends with a "Say it in your own words" step: a prompt, a rubric of 3–5 points and an example answer. Signed in with the tutor on, the model gives a verdict per point with a quote from the learner's text and one line of feedback, and flags a stated mistake. Replies are checked on the server: one verdict per point, quotes really in the text, only the lesson's mistake ids. The score is an `explanation.scored` event and counts toward mastery at two thirds of the rubric; the text never leaves the device except to be scored, and is never stored.
    - **Checks:** content tests for every lesson's mistakes, probes, traps and prompts; unit tests for the mistake projection, its review card, the mastery gate and explanation evidence; service tests for scoring (checked replies, shared budgets, defusing, a reply that isn't JSON); e2e for a trapped answer through to its review card the next day, self-scoring, and model scoring with the stand-in model, with axe on each state.
    - **Left for later:** "why" prompts at pivotal visualiser steps, recorded walkthroughs, and misconception-specific distractors generated from learner answers.

### Phase 6 — Play, systems, community

**Work:**
- **Play mode** (§7).
- **Systems track:** the simulators.
- **Extras:** mock interviews, classroom mode, community visualizations, i18n, PWA.

---

## 9. Success metrics

- **Learning (primary):**
  - spaced-review accuracy at 1, 7 and 30 days;
  - first-try accuracy on unseen randomized traces;
  - pre/post concept checks;
  - time to mastery;
  - transfer-problem success.
- **Engagement (secondary):** weekly learners, spaced vs binge sessions, course completion.
- **Guardrails:** hint-abuse rate, reported solution leaks, tutor cost per learner, bottom-quartile outcomes.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Scope: this is years of content | Ship phase by phase. Once the engine and primitives exist, each new concept is mostly content work. Follow the build-first lists. |
| Authoring cost, the reason Distill stopped | Reusable primitives, generators of about 50 lines each, MDX widgets, content CI |
| Running untrusted code | Managed Firecracker sandbox with no network, resource limits (ulimits) and one ephemeral sandbox per submission. Comparators run outside it, behind auth and quotas. |
| Weight of browser runtimes: Pyodide is ~6 MB, cross-origin isolation (COOP/COEP) breaks embeds, iOS memory is tight | Lazy-load in Workers, cache with a service worker, send isolation headers only on workspace routes, fall back to the server |
| AI tutor cost, abuse and answer leakage | Model routing, per-user budgets, prompt caching, a leak checker, a kill switch |
| Dependency churn: TF.js dormant, next-mdx-remote archived, Mafs slow-moving | Thin adapters, schema-validated content, CI that builds everything |
| Novelty-driven engagement that hides a lack of learning | Learning metrics and holdout groups |

## 11. Decisions

**Made (2026-10-15):**
1. **Accounts and backend:** our own managed Postgres + Drizzle + Better Auth inside the Next.js app. No separate backend service for now (§6.7).
2. **Business model:** free visuals; paid practice, judge, tutor and study plans, priced within the $119–199/yr band competitors use.
3. **Migration:** Phase 0 on the `revamp/phase-0` branch, then port page by page with the old routes live until each replacement ships.

**Still open:**
4. **Judge languages** beyond Python/JS/TS: Java, C++ and Go are recommended.
5. **Brand scope:** keep the name "Algorender" as it expands into ML, math and systems?

---

## Appendix: key sources

**Learning science and visualization**
- Hundhausen, Douglas & Stasko 2002, *J. Visual Languages & Computing* — https://doi.org/10.1006/jvlc.2002.0237
- Naps et al. 2002, ITiCSE working group, engagement taxonomy — https://doi.org/10.1145/960568.782998
- Crouch, Fagen, Callan & Mazur 2004, *Am. J. Physics* (prediction vs passive demos) — https://www.compadre.org/portal/items/detail.cfm?ID=2329
- Tversky, Morrison & Bétrancourt 2002, "Animation: can it facilitate?" — https://faculty.washington.edu/aragon/classes/hcde411/w13/readings/Tversky_AnimationFacilitate_IJHCS02.pdf
- Berney & Bétrancourt 2016, *Computers & Education* — https://archive-ouverte.unige.ch/unige:92234
- Mayer 2017, "Using multimedia for e-learning", *JCAL* — https://doi.org/10.1111/jcal.12197
- Shaffer et al. 2010, "Algorithm Visualization: The State of the Field", *TOCE* — https://doi.org/10.1145/1821996.1821997
- Xie et al. 2019, theory of instruction for intro programming — https://faculty.washington.edu/ajko/papers/Xie2019IntroCSTheoryOfInstruction.pdf
- Ericson et al. 2022, Parsons problems working group — https://doi.org/10.1145/3571785.3574127
- Oreopoulos, Liut, Sungu & Low 2026 (what counts as mastery) — https://doi.org/10.26300/01qv-6c22
- FSRS benchmark — https://github.com/open-spaced-repetition/srs-benchmark
- Bret Victor, "Up and Down the Ladder of Abstraction" — https://worrydream.com/LadderOfAbstraction/ · "Learnable Programming" — https://worrydream.com/LearnableProgramming/
- Transformer Explainer (Cho et al.) — https://arxiv.org/abs/2408.04619

**AI tutors**
- Bastani et al. 2025, *PNAS* — https://doi.org/10.1073/pnas.2422633122
- Kestin et al. 2025, *Scientific Reports* — https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/
- Khanmigo evaluation (Hechinger summary of NBER draft, Sept 2026) — https://hechingerreport.org/proof-points-khanmigo-math-ai-tutor/
- CodeAid — https://arxiv.org/abs/2401.11314 · CodeHelp — https://arxiv.org/abs/2308.06921 · Prather et al. "The Widening Gap" — https://arxiv.org/abs/2405.17739

**Gamification**
- Sailer & Homner 2020, *Educational Psychology Review* — https://link.springer.com/article/10.1007/s10648-019-09498-w
- Hanus & Fox 2015, *Computers & Education* — https://doi.org/10.1016/j.compedu.2014.08.019
- Silverman & Barasch 2023, *J. Consumer Research* (broken streaks) — https://doi.org/10.1093/jcr/ucac029
- Rodrigues et al. 2022 (novelty effect in CS1) — https://doi.org/10.1186/s41239-021-00314-6
- Costa 2023 (gamification in programming education) — https://doi.org/10.1002/cae.22630
- Wouters et al. 2013 (serious games meta-analysis) — https://doi.org/10.1037/a0031311
- Advent of Code 2025 leaderboard change — https://adventofcode.com/2025/about

**Market and technology**
- VisuAlgo — https://visualgo.net · Python Tutor — https://pythontutor.com · NeetCode Pro — https://neetcode.io/pro · Math Academy — https://www.mathacademy.com/courses
- Distill hiatus — https://distill.pub/2021/distill-hiatus/
- Judge0 sandbox-escape write-up — https://tantosec.com/blog/judge0/ · Piston API status — https://github.com/engineer-man/piston
- Vercel Sandbox pricing — https://vercel.com/docs/vercel-sandbox/pricing
- Next.js 16 upgrade guide — https://nextjs.org/docs/app/guides/upgrading/version-16
- WebGPU implementation status — https://github.com/gpuweb/gpuweb/wiki/implementation-status

> Some secondary details in the research (individual pricing figures, a few effect sizes) could not be checked against primary sources. None of the recommendations above depends on them.
