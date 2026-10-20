import { describe, expect, it } from 'vitest';
import { lessons } from './index';
import { lessonSections } from './sections';
import { STEP_LABEL } from '@/components/lesson/steps';

describe('lesson sections', () => {
  it('every lesson lists its sections, each a known step with its own anchor', () => {
    for (const l of lessons) {
      const sections = lessonSections(l.slug);
      expect(sections.length, l.slug).toBeGreaterThan(2);
      expect(new Set(sections.map((s) => s.id)).size, l.slug).toBe(sections.length);
      for (const s of sections) expect(Object.keys(STEP_LABEL), `${l.slug}: ${s.step}`).toContain(s.step);
    }
  });
});
