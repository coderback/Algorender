import type { AnyAlgorithm } from '@/engine/module';
import { cpuScheduling } from './cpu-scheduling';
import { deadlock } from './deadlock';
import { logicalClocks } from './logical-clocks';
import { pageReplacement } from './page-replacement';
import { queueing } from './queueing';
import { raceConditions } from './race-conditions';
import { tokenBucket } from './token-bucket';

// Systems simulators that run over an input (a workload, a request stream).
// Each one's model is a pure, steppable simulation in src/systems/, so the
// system-design canvas (phase 6d) can reuse it as a component.
export const systems: AnyAlgorithm[] = [cpuScheduling, pageReplacement, queueing, tokenBucket, logicalClocks, raceConditions, deadlock];
