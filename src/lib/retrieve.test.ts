import { describe, expect, test } from "bun:test";
import { CASES, EDGES, NODES } from "@/lib/data";
import { trainGnn } from "@/lib/gnn";
import { resolve } from "@/lib/retrieve";

const gnn = trainGnn(NODES, EDGES, CASES);

describe("assistant retrieval", () => {
  test("finds entities appearing in more than one FIR", () => {
    const r = resolve("Which entities appear in multiple FIRs?", { gnn });
    expect(r.intent).toBe("multi-case-entity");
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows) expect(row.detail).toContain("FIRs");
  });

  test("resolves a phone number to its real cases and call records", () => {
    const r = resolve("Show all cases connected to 9876543210", { gnn });
    expect(r.intent).toBe("phone-cases");
    const cases = r.rows.filter(x => x.kind === "case");
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) {
      const id = c.label.slice(0, 6);
      expect(CASES.some(x => x.id === id)).toBe(true);
    }
    expect(r.rows.some(x => x.kind === "cdr")).toBe(true);
  });

  test("returns financial rows with real amounts", () => {
    const r = resolve("Identify financial relationships between these cases", { gnn });
    expect(r.intent).toBe("financial");
    expect(r.rows.some(x => x.detail.includes("case CR-"))).toBe(true);
  });

  test("computes a path only when a recorded one exists", () => {
    const r = resolve("What is the strongest connection between alias Ravi and 9876543210?", { gnn });
    expect(["connection", "general"]).toContain(r.intent);
    // Every returned edge must exist in the edge list.
    for (const row of r.rows.filter(x => x.kind === "edge")) {
      const id = row.id;
      expect(EDGES.some(e => e.id === id)).toBe(true);
    }
  });

  test("explains the model from its own numbers, not from a script", () => {
    const r = resolve("Explain why the GNN flagged this network", { gnn });
    expect(r.intent).toBe("gnn-explanation");
    expect(r.rows[0].detail).toContain(String(gnn.dims.nodes));
    expect(r.rows.some(x => x.detail.includes("escalation"))).toBe(true);
  });

  test("returns nothing rather than guessing when no record matches", () => {
    const r = resolve("What did the suspect eat for breakfast in Iceland?", { gnn });
    expect(r.rows).toHaveLength(0);
    expect(r.scope).toContain("No case, entity, call or transfer");
  });

  test("every row carries an identifier and a non-empty detail", () => {
    for (const q of [
      "Which entities appear in multiple FIRs?",
      "Show all cases connected to 9876543210",
      "Identify financial relationships between these cases",
      "Explain why the GNN flagged this network",
      "Summarise CR-006",
    ]) {
      for (const row of resolve(q, { gnn }).rows) {
        expect(row.id.length).toBeGreaterThan(0);
        expect(row.detail.length).toBeGreaterThan(0);
        expect(row.label.length).toBeGreaterThan(0);
      }
    }
  });

  test("is deterministic", () => {
    const a = resolve("Show all cases connected to 9876543210", { gnn });
    const b = resolve("Show all cases connected to 9876543210", { gnn });
    expect(a).toEqual(b);
  });
});
