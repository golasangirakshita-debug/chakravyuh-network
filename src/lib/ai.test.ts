import { describe, expect, test } from "bun:test";
import { AI_TASKS, createAiContext, draftIntelligenceReport } from "@/lib/ai";
import { flagStory } from "@/lib/analysis";
import { CASES, EDGES, NODES } from "@/lib/data";

const ctx = createAiContext(NODES, EDGES, CASES);

describe("task registry", () => {
  test("every task has a unique id, group and description", () => {
    const ids = AI_TASKS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of AI_TASKS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(10);
      expect(["graph", "temporal", "intel", "integrity"]).toContain(t.group);
    }
  });

  test("every task returns a headline, detail and no empty rows", async () => {
    for (const task of AI_TASKS) {
      const result = await task.run(ctx);
      expect(result.headline.length).toBeGreaterThan(5);
      expect(result.detail.length).toBeGreaterThan(20);
      for (const row of result.rows) {
        expect(row.label.length).toBeGreaterThan(0);
        expect(row.value.length).toBeGreaterThan(0);
        if (row.score !== undefined) {
          expect(row.score).toBeGreaterThanOrEqual(0);
          expect(row.score).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  test("lead prioritisation returns descending probabilities", async () => {
    const result = await AI_TASKS.find(t => t.id === "graph.prioritise")!.run(ctx);
    const scores = result.rows.map(r => r.score ?? 0);
    for (let i = 1; i < scores.length; i++) expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    expect(result.rows.length).toBe(10);
  });

  test("evidence verification seals and validates the chain", async () => {
    const result = await AI_TASKS.find(t => t.id === "integrity.verify")!.run(ctx);
    expect(result.headline).toContain("Chain intact");
    const verdict = result.rows.find(r => r.label === "Verdict");
    expect(verdict?.value).toBe("VALID");
  });
});

describe("report drafting", () => {
  const report = draftIntelligenceReport(ctx);

  test("covers every required section", () => {
    const headings = report.sections.map(s => s.heading);
    expect(headings).toHaveLength(6);
    expect(headings[0]).toContain("Scope");
    expect(headings[1]).toContain("Validation");
    expect(headings[2]).toContain("Structure");
    expect(headings[3]).toContain("Leads");
    expect(headings[4]).toContain("Gaps");
    expect(headings[5]).toContain("Timing");
    for (const s of report.sections) expect(s.paragraphs.length).toBeGreaterThan(0);
  });

  test("states the seed and parameter count of the model it came from", () => {
    expect(report.generatedBy).toContain(`seed ${ctx.gnn.seed}`);
    const total = ctx.gnn.dims.params + ctx.gnn.linkParams;
    expect(report.generatedBy).toContain(String(total));
  });

  test("quotes the verified escalation-lead figure, not a different one", () => {
    const story = flagStory(CASES);
    const timing = report.sections.find(s => s.heading.includes("Timing"))!;
    expect(timing.paragraphs.join(" ")).toContain(`${story.daysBeforeLast} days`);
  });

  test("carries the not-a-charge-sheet caveat", () => {
    expect(report.caveat).toContain("charge sheet");
    expect(report.caveat).toContain("Does not determine guilt");
  });
});