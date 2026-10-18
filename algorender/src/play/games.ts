// The Play games (REVAMP_PLAN.md §7): active modes built on the engine, next
// to watching. Every round is an event (`game.played`), so wins feed XP,
// levels and badges (src/progress/play.ts) like everything else.

export type GameId = 'be-the-algorithm' | 'comparison-budget' | 'break-it';

export type Game = { id: GameId; title: string; summary: string; href: string };

export const GAMES: readonly Game[] = [
  {
    id: 'be-the-algorithm',
    title: 'Be the algorithm',
    summary: 'Make the next swap yourself, on a fresh random input every round. Any move the algorithm wouldn’t make is shown.',
    href: '/play/be-the-algorithm',
  },
  {
    id: 'comparison-budget',
    title: 'Comparison budget',
    summary: 'Sort hidden cards by comparing two at a time. Beat merge sort, and see why nobody can beat log₂ n!.',
    href: '/play/comparison-budget',
  },
  {
    id: 'break-it',
    title: 'Break it',
    summary: 'Craft the input that hurts: quicksort’s worst case, a greedy counterexample, a hash flood.',
    href: '/play/break-it',
  },
];

export const getGame = (id: GameId) => GAMES.find((g) => g.id === id)!;
