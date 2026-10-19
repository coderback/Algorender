import { describe, expect, it } from 'vitest';
import { loadConcepts } from '@/content/concepts';
import { evaluate, withWorkload } from '@/systems/design/evaluate';
import { validateDesign } from '@/systems/design/validate';
import { caseStudies, getCaseStudy } from '.';

// What each starting design should get wrong: these checks must fail, and the
// ones in `passes` must not (the point of each case is one or two lessons).
// Checks in neither list may go either way.
const START: Record<string, { fails: string[]; passes: string[] }> = {
  'url-shortener': { fails: ['throughput', 'p99', 'errors'], passes: ['cost'] },
  'rate-limited-api': { fails: ['p99', 'failures'], passes: ['cost'] },
  'news-feed': { fails: ['p99', 'write-p99'], passes: ['cost', 'stale'] },
  chat: { fails: ['p99'], passes: ['throughput', 'cost'] },
  'key-value-store': { fails: ['stale', 'survive'], passes: ['throughput', 'p99', 'errors', 'cost'] },
};

// Every check runs the case's traffic for its seconds (twice with faults); this
// keeps the canvas responsive and the suite quick.
const TIME_LIMIT_MS = 4000;

describe('case studies', () => {
  it('have unique slugs that no static /design route shadows, real concepts, and complete content', () => {
    const slugs = caseStudies.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const reserved of ['sandbox', 'estimate']) expect(slugs).not.toContain(reserved);
    expect(Object.keys(START).sort()).toEqual([...slugs].sort());
    const concepts = new Set(loadConcepts().concepts.map((c) => c.id));
    for (const c of caseStudies) {
      expect(c.slug).toMatch(/^[a-z0-9-]+$/);
      expect(concepts.has(c.concept), c.concept).toBe(true);
      expect(getCaseStudy(c.slug)).toBe(c);
      expect(c.hints).toHaveLength(3);
      expect(c.requirements.length).toBeGreaterThan(0);
      for (const text of [c.title, c.summary, c.brief, c.lesson]) expect(text.trim()).not.toBe('');
      expect(Object.keys(c.targets).length).toBeGreaterThan(0);
      expect(c.seconds).toBeGreaterThan(0);
      expect(c.seconds).toBeLessThanOrEqual(20);
      expect(c.workload.rps * (c.workload.spike?.factor ?? 1)).toBeLessThanOrEqual(20_000);
    }
  });

  describe.each(caseStudies.map((c) => [c.slug, c] as const))('%s', (slug, study) => {
    it('starts and ends with runnable designs sending the case’s traffic', () => {
      for (const d of [study.start, study.reference]) {
        expect(validateDesign(d)).toEqual([]);
        const clients = d.components.filter((c) => c.kind === 'clients');
        expect(clients).toHaveLength(1);
        expect(clients[0].kind === 'clients' && clients[0].workload).toEqual(study.workload);
      }
    });

    it('has a reference that meets every target', () => {
      const t0 = performance.now();
      const e = evaluate(study.reference, study);
      expect(performance.now() - t0).toBeLessThan(TIME_LIMIT_MS);
      expect(e.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.actual}, want ${c.want}`)).toEqual([]);
      expect(e.passed).toBe(true);
      expect(e.faultResult === null).toBe(!study.targets.survive);
    });

    it('starts from a design that fails in the way the case is about', () => {
      const t0 = performance.now();
      const e = evaluate(study.start, study);
      expect(performance.now() - t0).toBeLessThan(TIME_LIMIT_MS);
      expect(e.passed).toBe(false);
      const ok = new Map(e.checks.map((c) => [c.id, c.ok]));
      for (const id of START[slug].fails) expect(ok.get(id), `${id} should fail`).toBe(false);
      for (const id of START[slug].passes) expect(ok.get(id), `${id} should pass`).toBe(true);
    });
  });
});

describe('settings a case fixes', () => {
  it('runs every app at the case’s fan-out and no replica closer than its least lag, whatever the design says', () => {
    for (const study of caseStudies.filter((s) => s.fixed)) {
      const cheat = {
        components: study.reference.components.map((c) =>
          c.kind === 'app' ? { ...c, fanout: 1 } : c.kind === 'database' ? { ...c, replicaLagMs: 0 } : c,
        ),
      };
      const d = withWorkload(cheat, study);
      for (const c of d.components) {
        if (c.kind === 'app' && study.fixed?.fanout != null) expect(c.fanout).toBe(study.fixed.fanout);
        if (c.kind === 'database' && study.fixed?.minReplicaLagMs != null) expect(c.replicaLagMs).toBe(study.fixed.minReplicaLagMs);
      }
    }
    expect(caseStudies.filter((s) => s.fixed).map((s) => s.slug).sort()).toEqual(['key-value-store', 'news-feed']);
  });
});
