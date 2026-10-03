import { describe, expect, test } from "bun:test";
import {
  buildEntityGraph,
  buildFeatures,
  buildTargets,
  clusterEmbeddings,
  crossValidate,
  detectAnomalies,
  predictLinks,
  trainGnn,
  HEAD_NAMES,
} from "@/lib/gnn";
import { CASES, EDGES, NODES } from "@/lib/data";

const INSTRUMENTS = new Set(["phone", "bank", "upi", "alias"]);
const model = trainGnn(NODES, EDGES, CASES);

describe("graph construction", () => {
  test("keeps only entity nodes and de-duplicates co-occurrence pairs", () => {
    const g = buildEntityGraph(NODES, CASES);
    expect(g.nodes.every(n => n.kind === "entity")).toBe(true);
    expect(g.pairs.length).toBe(new Set(g.pairs.map(p => p.join("|"))).size);
    for (const [a, b] of g.pairs) expect(a).not.toBe(b);
  });

  test("every pair weight counts the cases that actually link the two entities", () => {
    const g = buildEntityGraph(NODES, CASES);
    for (const [i, j] of g.pairs) {
      const idA = g.nodes[i].id;
      const idB = g.nodes[j].id;
      const expected = CASES.filter(c => c.entities.includes(idA) && c.entities.includes(idB)).length;
      expect(g.pairWeight.get(`${i}|${j}`)).toBe(expected);
      expect(expected).toBeGreaterThan(0);
    }
  });
});

describe("features and labels", () => {
  test("feature matrix matches the declared feature names", () => {
    const g = buildEntityGraph(NODES, CASES);
    const X = buildFeatures(g.nodes, EDGES, CASES);
    expect(X.rows).toBe(g.nodes.length);
    expect(X.cols).toBe(16);
  });

  test("exactly one type and one network are hot per row", () => {
    const g = buildEntityGraph(NODES, CASES);
    const X = buildFeatures(g.nodes, EDGES, CASES);
    for (let i = 0; i < X.rows; i++) {
      const typeSum = [0, 1, 2, 3, 4, 5, 6].reduce((s, k) => s + X.data[i * X.cols + k], 0);
      const netSum = [7, 8, 9].reduce((s, k) => s + X.data[i * X.cols + k], 0);
      expect(typeSum).toBe(1);
      expect(netSum).toBe(1);
    }
  });

  test("labels are binary and reuse requires an instrument in 2+ cases", () => {
    const g = buildEntityGraph(NODES, CASES);
    const Y = buildTargets(g.nodes, CASES);
    expect(Y.cols).toBe(HEAD_NAMES.length);
    for (const v of Y.data) expect(v === 0 || v === 1).toBe(true);
    const g2 = buildEntityGraph(NODES, CASES);
    for (let i = 0; i < g2.nodes.length; i++) {
      const node = g2.nodes[i];
      const reuse = Y.data[i * Y.cols + 1];
      if (reuse === 1) {
        expect(INSTRUMENTS.has(node.type)).toBe(true);
        expect(node.caseIds.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe("training", () => {
  test("loss decreases substantially", () => {
    const first = model.lossCurve[0];
    const last = model.lossCurve[model.lossCurve.length - 1];
    expect(first).toBeGreaterThan(last);
    expect(last).toBeLessThan(first * 0.6);
  });

  test("is deterministic for a fixed seed", () => {
    const a = trainGnn(NODES, EDGES, CASES, { seed: 4242 });
    const b = trainGnn(NODES, EDGES, CASES, { seed: 4242 });
    expect(a.lossCurve).toEqual(b.lossCurve);
    expect(a.embeddings[0].vector).toEqual(b.embeddings[0].vector);
    expect(a.link.w).toEqual(b.link.w);
  });

  test("a different seed produces a different fit", () => {
    const a = trainGnn(NODES, EDGES, CASES, { seed: 1 });
    const b = trainGnn(NODES, EDGES, CASES, { seed: 2 });
    expect(a.lossCurve).not.toEqual(b.lossCurve);
  });

  test("every probability is a real sigmoid output", () => {
    for (const e of model.embeddings) {
      for (const p of e.probs) {
        expect(p).toBeGreaterThan(0);
        expect(p).toBeLessThan(1);
      }
      expect(e.vector).toHaveLength(model.dims.hidden);
      const norm = Math.sqrt(e.vector.reduce((s, v) => s + v * v, 0));
      expect(Math.abs(norm - 1)).toBeLessThan(1e-9);
    }
  });

  test("the escalation head separates its classes in-sample", () => {
    expect(model.auc[0]).toBeGreaterThan(0.9);
  });
});

describe("generalisation", () => {
  test("pooled held-out AUC beats chance for escalation", () => {
    const cv = crossValidate(NODES, EDGES, CASES, 5, { epochs: 120 });
    expect(cv.folds).toHaveLength(5);
    expect(cv.pooled.labels).toBeGreaterThan(0);
    expect(cv.pooled.auc[0]).toBeGreaterThan(0.8);
  });

  test("hold-out slices are disjoint and cover every label exactly once", () => {
    const expected = model.embeddings.length * HEAD_NAMES.length;
    for (const folds of [2, 3, 4, 5, 6, 7, 8, 11]) {
      const cv = crossValidate(NODES, EDGES, CASES, folds, { epochs: 40 });
      const total = cv.folds.reduce((s, f) => s + f.heldOut, 0);
      expect(total).toBe(expected);
      for (const f of cv.folds) expect(f.heldOut).toBeGreaterThan(0);
    }
  });

  test("the link head generalises to edges withheld from training", () => {
    expect(model.linkTestSize).toBeGreaterThan(0);
    expect(model.linkAuc).toBeGreaterThan(0.7);
    expect(Number.isNaN(model.linkAuc)).toBe(false);
  });
});

describe("link prediction", () => {
  const links = predictLinks(model, { limit: 10, minScore: 0.5 });

  test("only proposes pairs absent from the record", () => {
    const index = model.graph.index;
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) {
      const i = index.get(l.a)!;
      const j = index.get(l.b)!;
      const key = i < j ? `${i}|${j}` : `${j}|${i}`;
      expect(model.graph.pairWeight.has(key)).toBe(false);
    }
  });

  test("only proposes instrument pairs, never co-location noise", () => {
    for (const l of links) {
      expect(INSTRUMENTS.has(l.aType)).toBe(true);
      expect(INSTRUMENTS.has(l.bType)).toBe(true);
    }
  });

  test("scores are probabilities and each row names a record to request", () => {
    for (const l of links) {
      expect(l.score).toBeGreaterThanOrEqual(0.5);
      expect(l.score).toBeLessThan(1);
      expect(l.request.length).toBeGreaterThan(10);
    }
    for (let i = 1; i < links.length; i++) expect(links[i - 1].score).toBeGreaterThanOrEqual(links[i].score);
  });
});

describe("clusters", () => {
  test("partition every entity exactly once", () => {
    const clusters = clusterEmbeddings(model, 4);
    const seen = clusters.flatMap(c => c.members.map(m => m.id));
    expect(seen).toHaveLength(model.embeddings.length);
    expect(new Set(seen).size).toBe(seen.length);
  });

  test("reproduce the declared networks on this corpus", () => {
    const clusters = clusterEmbeddings(model, 4);
    expect(clusters.every(c => c.purity === 1)).toBe(true);
  });
});

describe("anomalies", () => {
  test("scores are bounded and ranked by priority", () => {
    const list = detectAnomalies(model, 6);
    expect(list).toHaveLength(6);
    for (const a of list) {
      expect(a.outlier).toBeGreaterThanOrEqual(0);
      expect(a.outlier).toBeLessThanOrEqual(1);
      expect(a.priority).toBeCloseTo(a.outlier * (0.4 + a.risk), 10);
    }
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].priority).toBeGreaterThanOrEqual(list[i].priority);
    }
  });
});