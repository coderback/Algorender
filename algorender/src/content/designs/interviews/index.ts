import type { InterviewVariant } from '@/interview/design';
import { gameMoves, sensorReadings } from './chat';
import { sessionStore, shoppingCarts } from './key-value-store';
import { orderUpdates, workoutFeed } from './news-feed';
import { ticketSale, weatherApi } from './rate-limited-api';
import { albumLinks, qrMenus } from './url-shortener';

// The case studies' interview variants (REVAMP_PLAN.md 6f-2): two per case,
// in the cases' order. A design round draws one; it never uses a case as it
// is, because a learner who passed the case has its answer. Server code only:
// a variant holds its reference design and deep dive, which the round's page
// must not ship (it gets `publicVariant()`).
export const interviewVariants: readonly InterviewVariant[] = [qrMenus, albumLinks, ticketSale, weatherApi, workoutFeed, orderUpdates, sensorReadings, gameMoves, sessionStore, shoppingCarts];

export const getVariant = (slug: string) => interviewVariants.find((v) => v.slug === slug);

export const variantsOf = (study: string) => interviewVariants.filter((v) => v.case === study);
