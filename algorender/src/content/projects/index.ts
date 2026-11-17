// Milestone projects: an ordered ladder of code exercises that builds one real
// thing from scratch (least squares, micrograd, a char GPT…), closing a stage
// of the math and ML path (src/content/stages.ts). A project is done when
// every part's write (or bug) stage has passed, which is a projection of
// `exercise.passed` events (src/progress/projects.ts), so it needs no event of
// its own. Its parts usually run their tests in judge mode on the project
// budget (Exercise.judge in src/content/exercises/shared.ts).
//
// Client-safe and small: Play and the study plan read it. It must not import
// the exercises themselves; projects.test.ts checks the parts exist.
//
// The first project (least squares, M1) arrives with batch B3.

export type Project = {
  slug: string;
  title: string;
  /** One line for cards and the plan. */
  summary: string;
  /** The stage of the math and ML path it closes (its milestone). */
  stage: number;
  /** Its parts, in order: code exercise slugs, each done once its write (or bug) stage passes. */
  parts: readonly string[];
  /** The concepts it builds: finishing it reaches the implement level in each. */
  concepts: readonly string[];
  /** Where to see the finished thing working (a visualiser, usually). */
  showcase: { href: string; label: string };
  /** About how long it takes, for the study plan (3–5 h). */
  hours: number;
};

export const projects: readonly Project[] = [];

export const getProject = (slug: string) => projects.find((p) => p.slug === slug);

/** The project that closes a stage, if it has one yet. */
export const projectForStage = (stage: number, list: readonly Project[] = projects) => list.find((p) => p.stage === stage);
