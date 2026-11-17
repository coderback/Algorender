// Mock interviews' settings. They run on the tutor's models and prices
// (../tutor/config.ts), so they are off whenever the tutor is, and have a kill
// switch of their own. A round has its own budget, apart from tutor turns:
//
//   INTERVIEWS_ENABLED       'off' switches mock interviews off (read at build time by the pages)
//   INTERVIEW_ROUNDS_PER_DAY rounds each learner may start a day (2)
//   INTERVIEW_REPLIES        interviewer replies from the model per round (16)
//   INTERVIEW_DAILY_USD      interviews' share of the day's spend (half of TUTOR_DAILY_USD),
//                            inside TUTOR_DAILY_USD, which stays the one hard ceiling

import { costOf, tutorConfig, type TutorConfig } from '../tutor/config';

export type InterviewConfig = {
  tutor: TutorConfig;
  roundsPerDay: number;
  replies: number;
  dailyUsd: number;
};

const number = (value: string | undefined, fallback: number) => (value && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback);

/** Mock interviews' settings, or null when they (or the tutor they run on) are off. */
export function interviewConfig(env: Record<string, string | undefined> = process.env): InterviewConfig | null {
  if ((env.INTERVIEWS_ENABLED ?? '').toLowerCase() === 'off') return null;
  const tutor = tutorConfig(env);
  if (!tutor) return null;
  return {
    tutor,
    roundsPerDay: number(env.INTERVIEW_ROUNDS_PER_DAY, 2),
    replies: number(env.INTERVIEW_REPLIES, 16),
    dailyUsd: Math.min(tutor.dailyUsd, number(env.INTERVIEW_DAILY_USD, tutor.dailyUsd / 2)),
  };
}

/** Tokens in and out of each kind of call, measured on the prompts (generous: the transcript grows). */
const TOKENS = {
  reply: { in: 5_000, out: 200 },
  leak: { in: 2_000, out: 40 },
  debrief: { in: 10_000, out: 1_000 },
} as const;

/** What one interviewer reply costs at most: the reply, its leak check, and one stricter retry of both. */
export const replyEstimate = (c: InterviewConfig) => 2 * (costOf(c.tutor, 'fast', TOKENS.reply.in, TOKENS.reply.out) + costOf(c.tutor, 'fast', TOKENS.leak.in, TOKENS.leak.out));

/** What a debrief costs at most: the strong model's scores, a leak check, and one retry of both. */
export const debriefEstimate = (c: InterviewConfig) => 2 * (costOf(c.tutor, 'strong', TOKENS.debrief.in, TOKENS.debrief.out) + costOf(c.tutor, 'fast', TOKENS.leak.in, TOKENS.leak.out));

/** What a whole round may cost: every reply it is allowed, and its debrief. */
export const roundEstimate = (c: InterviewConfig) => c.replies * replyEstimate(c) + debriefEstimate(c);
