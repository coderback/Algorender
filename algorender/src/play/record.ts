'use client';

import { record } from '@/progress/hooks';
import type { GameId } from './games';

/** A finished round of a Play game (see `game.played` in src/progress/events.ts for what score, max and won mean per game). */
export const recordGame = (game: GameId, item: string, result: { score: number; max: number; won: boolean }) =>
  record('game.played', { game, item, score: result.score, max: result.max, won: result.won });
