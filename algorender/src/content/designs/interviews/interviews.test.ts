import { describe, expect, it } from 'vitest';
import { checkRound, DESIGN_TERMS, designCost, missingFeatures, type InterviewVariant } from '@/interview/design';
import { norm, says } from '@/interview/rules';
import { cpuTime } from '@/testing/timing';
import { validateDesign } from '@/systems/design/validate';
import { caseStudies, getCaseStudy } from '..';
import { getVariant, interviewVariants, variantsOf } from '.';

// Each interview variant is checked as the case studies are (designs.test.ts):
// its start fails in the way the case is about, its reference passes every
// target and its deep dive, and its content is complete. On top: the rate
// estimate is the simulated rate, the brief never states that rate, and the
// brief never names a part the reference adds (the interviewer may not
// either, so the brief mustn't give it away).

// What each start must get wrong (these checks fail), and what it gets right.
const START: Record<string, { fails: string[]; passes: string[] }> = {
  'qr-menus': { fails: ['p99'], passes: ['cost'] },
  'album-links': { fails: ['throughput', 'p99'], passes: ['cost'] },
  'ticket-sale': { fails: ['p99', 'failures'], passes: ['cost'] },
  'weather-api': { fails: ['p99', 'failures'], passes: ['cost'] },
  'workout-feed': { fails: ['write-p99'], passes: ['cost', 'stale'] },
  'order-updates': { fails: ['write-p99'], passes: ['cost', 'stale'] },
  'sensor-readings': { fails: ['p99'], passes: ['cost'] },
  'game-moves': { fails: ['p99'], passes: ['cost'] },
  'session-store': { fails: ['stale', 'survive'], passes: ['cost'] },
  'shopping-carts': { fails: ['stale', 'survive'], passes: ['cost'] },
};

const TIME_LIMIT_MS = 6000;

describe('interview variants', () => {
  it('have unique slugs apart from the cases’, two per case, and complete content', () => {
    const slugs = interviewVariants.map((v) => v.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(Object.keys(START).sort()).toEqual([...slugs].sort());
    for (const c of caseStudies) {
      expect(slugs).not.toContain(c.slug);
      expect(variantsOf(c.slug)).toHaveLength(2);
    }
    for (const v of interviewVariants) {
      expect(v.slug).toMatch(/^[a-z0-9-]+$/);
      expect(getVariant(v.slug)).toBe(v);
      const study = getCaseStudy(v.case)!;
      expect(study, v.case).toBeDefined();
      expect(v.concept).toBe(study.concept);
      expect(v.lesson).toBe(study.lesson);
      expect(v.hints).toHaveLength(3);
      for (const text of [v.title, v.summary, v.brief, v.deepDive.label, v.deepDive.say]) expect(text.trim()).not.toBe('');
      expect(v.workload.rps * Math.max(v.workload.spike?.factor ?? 1, v.deepDive.spike?.factor ?? 1)).toBeLessThanOrEqual(20_000);
      expect(v.deepDive.faults?.length || v.deepDive.spike).toBeTruthy();
      expect(Object.keys(v.deepDive.targets).length).toBeGreaterThan(0);
    }
  });

  describe.each(interviewVariants.map((v) => [v.slug, v] as const))('%s', (slug, v: InterviewVariant) => {
    it('has two or three estimates, one of them the simulated rate, which the brief never states', () => {
      expect(v.estimates.length).toBeGreaterThanOrEqual(2);
      expect(v.estimates.length).toBeLessThanOrEqual(3);
      expect(new Set(v.estimates.map((e) => e.id)).size).toBe(v.estimates.length);
      const rate = v.estimates.filter((e) => e.rate);
      expect(rate).toHaveLength(1);
      expect(Math.abs(v.workload.rps - rate[0].answer) / rate[0].answer).toBeLessThan(0.05);
      for (const e of v.estimates) {
        expect(e.answer).toBeGreaterThan(0);
        expect(Number.isFinite(e.answer)).toBe(true);
        expect(e.working.length).toBeGreaterThan(0);
      }
      const text = `${v.brief}\n${v.requirements.join('\n')}`;
      for (const n of [v.workload.rps, Math.round(rate[0].answer)]) {
        expect(text).not.toContain(n.toLocaleString('en-GB'));
        expect(text).not.toContain(String(n));
      }
    });

    it('never names in its brief a part the reference adds', () => {
      const text = norm(`${v.title}\n${v.summary}\n${v.brief}\n${v.requirements.join('\n')}\n${v.deepDive.say}`);
      const missing = missingFeatures(v.reference, v.start);
      expect(missing.length).toBeGreaterThan(0);
      for (const f of missing) for (const term of DESIGN_TERMS[f]) expect(says(text, term), `${f}: "${term}"`).toBe(false);
    });

    it('starts and ends with runnable designs sending the variant’s traffic', () => {
      for (const d of [v.start, v.reference]) {
        expect(validateDesign(d)).toEqual([]);
        const clients = d.components.filter((c) => c.kind === 'clients');
        expect(clients).toHaveLength(1);
        expect(clients[0].kind === 'clients' && clients[0].workload).toEqual(v.workload);
      }
    });

    it('has a reference that meets every target and survives the deep dive', () => {
      const { result: e, ms } = cpuTime(() => checkRound(v.reference, v, true));
      expect(ms).toBeLessThan(TIME_LIMIT_MS);
      expect(e.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.actual}, want ${c.want}`)).toEqual([]);
      expect(e.checks.some((c) => c.id.startsWith('deep-'))).toBe(true);
      expect(designCost(v.reference, v)).toBeLessThanOrEqual(v.targets.maxCost ?? Infinity);
    });

    it('starts from a design that fails in the way the case is about', () => {
      const e = checkRound(v.start, v, false);
      expect(e.passed).toBe(false);
      const ok = new Map(e.checks.map((c) => [c.id, c.ok]));
      for (const id of START[slug].fails) expect(ok.get(id), `${id} should fail`).toBe(false);
      for (const id of START[slug].passes) expect(ok.get(id), `${id} should pass`).toBe(true);
    });
  });
});
