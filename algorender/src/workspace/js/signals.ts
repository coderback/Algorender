// What ends a run early without being an error of the learner's. Not Errors:
// the learner never sees them, and they need no stack. The instrumented code
// rethrows them from the learner's catch clauses, so a try/catch can't
// swallow them.

/** A limit: too many steps or events (runtime.ts). */
export class StopSignal {}
export const STOP = new StopSignal();

/** A program waiting for input (moreInput), or one that called process.exit (program.ts). */
export class ProgramSignal extends StopSignal {
  constructor(readonly kind: 'wait' | 'exit') {
    super();
  }
}
