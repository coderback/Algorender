import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Joins class names so a caller's class replaces a primitive's class for the
// same property (a card's `flex-row` beats its `flex-col`), instead of both
// landing in the list and the CSS order deciding. tailwind-merge is told about
// the theme's own scales, so `text-title-card` (a size) and `text-ink` (a
// colour) don't knock each other out.
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['title-page', 'title-section', 'title-card', 'number-big', 'number-tile', 'eyebrow'],
      radius: ['card', 'tile', 'well', 'chip'],
      shadow: ['segment', 'review', 'float'],
      ease: ['standard'],
    },
  },
});

export const cx = (...classes: ClassValue[]) => merge(clsx(classes));
