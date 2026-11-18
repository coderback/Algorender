# Mock interviews 6f-2: system-design rounds

The design round is the coding round (6f-1) with a case study in place of a
practice problem. Everything that can be shared is shared: the
`interview_round` table and its clock, `/api/interview`, the budgets
(`INTERVIEW_ROUNDS_PER_DAY` counts rounds of either kind), the interviewer's
fences and `defuse()`, the leak check on every reply, the giveaway check, the
hint ladder (levels 1–3, each capping one score), the scripted fallbacks, the
held-back debrief, the self-scored fallback, the kept transcript and the
verified `interview.finished` event.

## Interview variants (content)

A learner who passed a case on `/design/<slug>` has its answer, so a round
never uses a case as it is. Each case has two **interview variants**
(`src/content/designs/interviews/`): a new story that teaches the same
trade-off, with its own traffic, targets, start, reference, three graded
hints, two estimates and a deep-dive scenario. A variant is a `CaseStudy`
(so `evaluate()` runs it unchanged) plus:

- `case`: the case it varies (its concept, lesson and page);
- `estimates`: questions whose facts are in the brief (daily users, actions a
  day, a peak factor, bytes per record). The answer is computed from the facts
  in code, never typed. The peak-traffic estimate is the simulated rate, so
  estimating it right tells the learner what they will design for;
- `deepDive`: a fault or a surge, from content, never invented by the model:
  machines named by kind (the first cache, shard 0's primary) so it applies to
  whatever the learner built, a spike, and the targets that must hold under it.

`interviews.test.ts` checks each variant as `designs.test.ts` checks the
cases: the start fails, the reference passes every target and the deep dive,
the peak estimate is the simulated rate, and the brief never states the rate.

## Phases (45 minutes: 5, 5, 20, 10, with 5 to spare)

| Phase | What happens | Server gate |
|---|---|---|
| Requirements | The variant's brief and requirements, no numbers for the traffic. The learner asks; the interviewer answers from the brief. | none |
| Estimate | Each estimate typed ("6k", "40 GB"), read with `parseEstimate`. The interviewer may ask how they got there, never the number. | every estimate readable before Design |
| Design | The canvas from the variant's start; the traffic the simulator runs is shown now. "Check the design" runs on the server. The learner explains the design in words (at least 15), and the interviewer probes it once. | the explanation before the deep dive |
| Deep dive | The server announces the scenario (scripted, from content). Checks now include it. The learner explains what happens and changes the design. | none |
| Debrief | Scores, evidence, the trade-off (the case's lesson) and one design that passes. | round ended |

## The canvas in a round (`DesignCanvas variant="interview"`)

No hints panel, no "Show a solution", nothing persisted on the device: the
round keeps the design. Every check posts the design to the server, which
validates it, saves it on the round and runs `evaluate()` (seed
`EVALUATION_SEED`), plus the deep dive once that phase has begun, and answers
with the results the canvas shows. A round allows `MAX_CHECKS` (8) checks.
The client is given the variant without its reference, hints or deep dive.

## Scoring (1–4, the coding round's labels)

| Dimension | By | Rule |
|---|---|---|
| Targets | code | the server's final run of the final design, deep dive included: all met within 4 checks is 4, all met after more is 3, at least half is 2 |
| Estimation | code | `judge()` per estimate: spot on 2 points, the right order 1; all points 4, three quarters 3, half 2 |
| Cost | code | the final design's monthly cost: within 10% of the reference's 4, within the target 3, within 1.5× the target 2 |
| Trade-offs | model | names what each choice costs and gains, against the case's lesson; capped by hints like the coding round's approach |
| Communication | model | asked about the requirements, explained the design and the deep dive out loud, answered directly |

Meets the bar is unchanged: every dimension at least 3, no level-3 hint, and
the round ended passing (here: every target, deep dive included, at the end).

## What the interviewer may reveal

- Grounding: the variant's brief, requirements, traffic, targets, hints, the
  case's lesson, the deep dive, and the reference design described in words
  (for its eyes only; the deterministic leak check reads that description as
  the solution).
- Giveaway: the parts the reference has and the learner's design lacks (a
  cache, a queue, a rate limiter, shards, failover, replicas) may not be named
  by the interviewer until the learner or the brief names them.
- Hints: levels 1–3; the authors' hints are the scripted fallback.

## Recording

`interview.finished` already allows `format: 'design'` and `variant`; nothing
about it changes. A design round writes `format: 'design'`, `item` the case,
`variant`, no `language`, and the five scores. Projections that read it:

- mastery: one observation of the case's concept under `design:<case>` (the
  same item a pass on the case page uses), right when it meets the bar;
- levels: trade-offs at least 3 gives analyse (implement still comes only
  from `design.checked` on the case page);
- XP: `XP.interview` once per case, as per problem; the "Interview ready"
  badge counts either format;
- review: no card (there is no design card kind), as proposed;
- Today and the plan's weekly round stay coding-only (6f-3's projections
  filter `format === 'coding'`), since the round belongs to the Coding
  interviews goal.

Checks inside a round don't record `design.checked`: that event means a run
on the case page, and the round's variant is not the case.

## Database

Migration `0005`: `interview_round` gains `variant` (text), `design` (jsonb,
the learner's latest design) and `estimates` (jsonb), and `language` becomes
nullable. Checks are kept in `submissions` (targets as tests, missed as
failed); the design explanation in `approach` (`{ text }`).

## Judgement calls (no board)

- `MAX_CHECKS` 8 a round, and "strong" targets within 4 checks.
- The deep dive is part of passing.
- Design rounds don't count as the plan's weekly round.
- Rounds draw a variant the learner hasn't had a round on, else any (a
  repeat); a case filter on the hub, no level or pattern.
