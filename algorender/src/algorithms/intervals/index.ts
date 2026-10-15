import type { AnyAlgorithm } from '@/engine/module';
import { meetingRooms } from './meeting-rooms';
import { mergeIntervals } from './merge-intervals';

export const intervals: AnyAlgorithm[] = [mergeIntervals, meetingRooms];
