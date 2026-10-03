import { describe, expect, test } from "bun:test";
import { CASES, GHOST_SEEDS, daysBetween } from "./data";
import { breachRanks, componentsFor, flagStory, structuralHoles } from "./analysis";

describe("flagStory — the 'days saved' headline", () => {
  const story = flagStory(CASES);

  test("flags at the earliest date three states are spanned", () => {
    expect(story.flagDate).toBe("2026-06-18");
    expect(story.flaggedCases).toBe(3);
    expect(story.statesAtFlag).toBe(3);
  });

  test("daysBeforeLast is the flag-to-last-linked-FIR span", () => {
    expect(story.lastFir).toBe("CR-006");
    expect(story.lastFirDate).toBe("2026-06-28");
    expect(story.daysBeforeLast).toBe(daysBetween(story.flagDate, story.lastFirDate));
    expect(story.daysBeforeLast).toBe(10);
  });

  test("daysEarly is the separate, smaller next-FIR gap", () => {
    expect(story.nextFir).toBe("CR-004");
    expect(story.daysEarly).toBe(daysBetween(story.flagDate, "2026-06-22"));
    // The two metrics are distinct; the UI must not conflate them.
    expect(story.daysEarly).toBeLessThan(story.daysBeforeLast);
  });
});

describe("breachRanks — the Vyuh Breaker", () => {
  const ranks = breachRanks(CASES);
  const base = componentsFor(CASES, null).length;

  test("ranks a genuine breaker first", () => {
    expect(ranks[0].nodeId).toBe("bk-3310");
    expect(ranks[0].pairsLost).toBeGreaterThan(0);
  });

  test("fragmentsDelta reports the increase, not an absolute count", () => {
    for (const r of ranks) {
      expect(r.fragments).toBeGreaterThanOrEqual(r.fragmentsDelta + base - 1);
      expect(r.fragmentsDelta).toBe(ranks.find(x => x.nodeId === r.nodeId)!.fragmentsDelta);
    }
  });

  test("a non-breaker reports zero fragmentation", () => {
    const flat = ranks.find(r => r.nodeId === "ph-9876543210");
    expect(flat).toBeDefined();
    expect(flat!.fragmentsDelta).toBe(0);
    expect(flat!.pairsLost).toBe(0);
  });

  test("sort is descending by pairsLost", () => {
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i - 1].pairsLost).toBeGreaterThanOrEqual(ranks[i].pairsLost);
    }
  });
});

describe("structuralHoles — ghost discovery", () => {
  const holes = structuralHoles(CASES);

  test("excludes co-location artifacts (no person <-> location pairs)", () => {
    for (const h of holes) {
      const coLocated = h.a.startsWith("loc-") || h.b.startsWith("loc-");
      expect(coLocated).toBe(false);
    }
  });

  test("only surfaces instrument-to-instrument pairs", () => {
    const instruments = ["ph-", "bk-", "a-", "upi-"];
    for (const h of holes) {
      expect(instruments.some(p => h.a.startsWith(p))).toBe(true);
      expect(instruments.some(p => h.b.startsWith(p))).toBe(true);
    }
  });

  test("a pair that already co-occurs in a case is not a hole", () => {
    // bk-8842 and bk-3310 both appear in CR-006, so they are directly linked —
    // the heuristic must not propose them as a missing intermediary.
    expect(CASES.some(c => c.entities.includes("bk-8842") && c.entities.includes("bk-3310"))).toBe(true);
    const keys = new Set(holes.map(h => [h.a, h.b].sort().join("|")));
    expect(keys.has(["bk-8842", "bk-3310"].sort().join("|"))).toBe(false);
  });

  test("surfaces the strongest genuine instrument gap", () => {
    // Ravi's handler phone and the Odisha burner never share a case but their
    // neighbourhoods overlap — the GHOST-1 hypothesis, in NET-A.
    const top = holes[0];
    expect(top).toBeDefined();
    expect(top.network).toBe("NET-A");
    expect([top.a, top.b]).toContain("ph-9988776655");
  });

  test("returns sorted, capped results", () => {
    expect(holes.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < holes.length; i++) {
      expect(holes[i - 1].jaccard).toBeGreaterThanOrEqual(holes[i].jaccard);
    }
  });

  test("every seeded ghost names the exact record to request", () => {
    for (const g of GHOST_SEEDS) {
      expect(g.lead.request.length).toBeGreaterThan(0);
      expect(g.lead.window.length).toBeGreaterThan(0);
      expect(g.lead.payoff.length).toBeGreaterThan(0);
    }
  });
});