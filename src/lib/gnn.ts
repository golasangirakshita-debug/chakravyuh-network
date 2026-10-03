/* ============================================================================
 * GNN — a Graph Convolutional Network, implemented and trained in-browser.
 *
 * This is a real Kipf & Welling GCN, not a metaphor:
 *   H = ReLU(Â · X·W1 + b1)      Â = D^-1/2 (A + I) D^-1/2
 *   Z = Â · H·W2 + b2            multi-label heads, sigmoid + BCE loss
 *
 * Weights are initialised with Glorot from a seeded PRNG and trained with
 * full-batch Adam on labels derived from the case corpus, so every number the
 * console shows is reproducible from the seed and traceable to a gradient.
 *
 * Two learned heads:
 *   0 "escalation" — will this entity end up inside a high-risk FIR?
 *   1 "pivot"      — is it a structural bridge whose removal fragments the graph?
 *
 * A separate bilinear link head is trained to reconstruct observed edges, and
 * is then used to propose entity pairs that are NOT in any record.
 * ========================================================================== */

import { breachRanks } from "@/lib/analysis";
import {
  CASES,
  EDGES,
  ENTITIES,
  NODES,
  daysBetween,
  type CaseDef,
  type EntityType,
  type GraphEdge,
  type GraphNode,
} from "@/lib/data";

export const HEAD_NAMES = ["escalation", "reuse"] as const;
export type HeadName = (typeof HEAD_NAMES)[number];

const TYPES: EntityType[] = ["case", "person", "alias", "phone", "bank", "upi", "location"];
const NETS = ["NET-A", "NET-B", "NOISE"] as const;
const INSTRUMENTS: EntityType[] = ["phone", "bank", "upi", "alias"];

/* ------------------------------------------------------------------ *
 * Minimal dense linear algebra (row-major Float64Array)
 * ------------------------------------------------------------------ */

export interface Tensor {
  data: Float64Array;
  rows: number;
  cols: number;
}

function tensor(rows: number, cols: number, data?: Float64Array): Tensor {
  return { data: data ?? new Float64Array(rows * cols), rows, cols };
}

function matmul(a: Tensor, b: Tensor): Tensor {
  const c = tensor(a.rows, b.cols);
  for (let i = 0; i < a.rows; i++) {
    const ao = i * a.cols;
    const co = i * c.cols;
    for (let k = 0; k < a.cols; k++) {
      const av = a.data[ao + k];
      if (av === 0) continue;
      const bo = k * b.cols;
      for (let j = 0; j < b.cols; j++) c.data[co + j] += av * b.data[bo + j];
    }
  }
  return c;
}

/** Aᵀ·B without materialising the transpose. */
function matmulT(a: Tensor, b: Tensor): Tensor {
  const c = tensor(a.cols, b.cols);
  for (let i = 0; i < a.rows; i++) {
    const ao = i * a.cols;
    for (let k = 0; k < a.cols; k++) {
      const av = a.data[ao + k];
      if (av === 0) continue;
      const bo = i * b.cols;
      const co = k * c.cols;
      for (let j = 0; j < b.cols; j++) c.data[co + j] += av * b.data[bo + j];
    }
  }
  return c;
}

function colSum(a: Tensor): Float64Array {
  const out = new Float64Array(a.cols);
  for (let i = 0; i < a.rows; i++) {
    const off = i * a.cols;
    for (let j = 0; j < a.cols; j++) out[j] += a.data[off + j];
  }
  return out;
}

function sigmoid(t: Tensor): Tensor {
  const out = tensor(t.rows, t.cols);
  for (let i = 0; i < t.data.length; i++) out.data[i] = 1 / (1 + Math.exp(-t.data[i]));
  return out;
}

/** Row-wise sum of a dense vector added to every row of a tensor. */
function broadcast(a: Tensor, bias: Float64Array): Tensor {
  const out = tensor(a.rows, a.cols);
  for (let i = 0; i < a.rows; i++) {
    const off = i * a.cols;
    for (let j = 0; j < a.cols; j++) out.data[off + j] = a.data[off + j] + bias[j];
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Seeded PRNG + Adam
 * ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function glorot(rand: () => number, fanIn: number, fanOut: number): Tensor {
  const limit = Math.sqrt(6 / (fanIn + fanOut));
  const t = tensor(fanIn, fanOut);
  for (let i = 0; i < t.data.length; i++) t.data[i] = (rand() * 2 - 1) * limit;
  return t;
}

interface AdamState {
  m: Float64Array;
  v: Float64Array;
  step: number;
}

function adamUpdate(p: Tensor, g: Tensor, state: AdamState, lr: number, l2: number) {
  state.step += 1;
  const { m, v } = state;
  const b1 = 0.9;
  const b2 = 0.999;
  const eps = 1e-8;
  const c1 = 1 - Math.pow(b1, state.step);
  const c2 = 1 - Math.pow(b2, state.step);
  for (let i = 0; i < p.data.length; i++) {
    const grad = g.data[i] + l2 * p.data[i];
    m[i] = b1 * m[i] + (1 - b1) * grad;
    v[i] = b2 * v[i] + (1 - b2) * grad * grad;
    p.data[i] -= (lr * (m[i] / c1)) / (Math.sqrt(v[i] / c2) + eps);
  }
}

function adamState(n: number): AdamState {
  return { m: new Float64Array(n), v: new Float64Array(n), step: 0 };
}

/* ------------------------------------------------------------------ *
 * Graph construction
 * ------------------------------------------------------------------ */

export interface SparseRows {
  idx: Int32Array;
  val: Float64Array;
}

/** Symmetric normalised adjacency with self loops, kept sparse. */
function normaliseAdjacency(n: number, links: Map<number, number>[]): SparseRows[] {
  const deg = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    deg[i] = 1; // self loop
    for (const j of links[i].keys()) deg[i] += links[i].get(j)!;
  }
  const rows: SparseRows[] = [];
  for (let i = 0; i < n; i++) {
    const idx: number[] = [i];
    const val: number[] = [1 / Math.sqrt(deg[i])];
    for (const [j, w] of links[i]) {
      idx.push(j);
      val.push(w / Math.sqrt(deg[i] * deg[j]));
    }
    rows.push({ idx: Int32Array.from(idx), val: Float64Array.from(val) });
  }
  return rows;
}

/** Â · M using the sparse rows. */
function propagate(rows: SparseRows[], m: Tensor, n: number): Tensor {
  const out = tensor(n, m.cols);
  for (let i = 0; i < n; i++) {
    const { idx, val } = rows[i];
    const o = i * m.cols;
    for (let k = 0; k < idx.length; k++) {
      const a = val[k];
      if (a === 0) continue;
      const mo = idx[k] * m.cols;
      for (let j = 0; j < m.cols; j++) out.data[o + j] += a * m.data[mo + j];
    }
  }
  return out;
}

export interface EntityGraph {
  nodes: GraphNode[];
  index: Map<string, number>;
  links: Map<number, number>[];
  pairs: [number, number][];
  /** Co-occurrence weight, keyed "a|b" with a < b. */
  pairWeight: Map<string, number>;
}

export function buildEntityGraph(
  nodes: GraphNode[] = NODES,
  cases: CaseDef[] = CASES,
): EntityGraph {
  const ents = nodes.filter(n => n.kind === "entity");
  const index = new Map(ents.map((n, i) => [n.id, i]));
  const links: Map<number, number>[] = ents.map(() => new Map());
  const pairs: [number, number][] = [];
  const pairWeight = new Map<string, number>();

  const bump = (a: number, b: number) => {
    const [i, j] = a < b ? [a, b] : [b, a];
    if (i === j) return;
    const key = `${i}|${j}`;
    if (!links[i].has(j)) {
      links[i].set(j, 1);
      links[j].set(i, 1);
      pairs.push([i, j]);
    }
    pairWeight.set(key, (pairWeight.get(key) ?? 0) + 1);
  };

  for (const c of cases) {
    const ids = c.entities.map(e => index.get(e)).filter((v): v is number => v !== undefined);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) bump(ids[i], ids[j]);
  }
  return { nodes: ents, index, links, pairs, pairWeight };
}

/* ------------------------------------------------------------------ *
 * Features and labels
 * ------------------------------------------------------------------ */

export const FEATURE_NAMES: string[] = [
  ...TYPES.map(t => `type:${t}`),
  ...NETS.map(n => `net:${n}`),
  "logDegree",
  "logCases",
  "isInstrument",
  "recency",
  "meanConfidence",
  "sourceSpread",
];

export function buildFeatures(
  nodes: GraphNode[],
  edges: GraphEdge[],
  cases: CaseDef[],
): Tensor {
  const n = nodes.length;
  const F = FEATURE_NAMES.length;
  const X = tensor(n, F);
  const deg = new Float64Array(n);
  const conf = new Map<string, { sum: number; c: number }>();
  const spread = new Map<string, Set<string>>();

  for (const e of edges) {
    for (const id of [e.source, e.target]) {
      deg[nodes.findIndex(x => x.id === id)] += 1;
      const cur = conf.get(id) ?? { sum: 0, c: 0 };
      cur.sum += e.confidence;
      cur.c += 1;
      conf.set(id, cur);
      const s = spread.get(id) ?? new Set<string>();
      s.add(e.sourceType);
      spread.set(id, s);
    }
  }

  const nodeAt = new Map(nodes.map((v, i) => [v.id, i]));
  const dates = nodes.map(v => v.date).sort();
  const earliest = dates[0] ?? "2026-01-01";

  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    const off = i * F;
    X.data[off + TYPES.indexOf(node.type)] = 1;
    const netOff = TYPES.length + (NETS.indexOf(node.network as (typeof NETS)[number]) ?? 2);
    X.data[off + netOff] = 1;
    X.data[off + TYPES.length + NETS.length] = Math.log1p(deg[i]) / 3;
    X.data[off + TYPES.length + NETS.length + 1] = Math.log1p(node.caseIds.length) / 2;
    X.data[off + TYPES.length + NETS.length + 2] = INSTRUMENTS.includes(node.type) ? 1 : 0;
    X.data[off + TYPES.length + NETS.length + 3] = Math.min(1, daysBetween(earliest, node.date) / 180);
    const c = conf.get(node.id);
    X.data[off + TYPES.length + NETS.length + 4] = c ? c.sum / c.c : 0.5;
    X.data[off + TYPES.length + NETS.length + 5] = (spread.get(node.id)?.size ?? 0) / 4;
  }
  void nodeAt;
  return X;
}

/**
 * Two supervised heads. Both labels come from facts already in the corpus, so
 * the model is learning to RECOGNISE structure it has never been told about
 * explicitly — the neighbourhood term is what generalises them.
 *
 *   escalation — the entity appears inside at least one high-risk FIR (risk ≥ 70)
 *   reuse      — a financial/identity instrument re-used across 2+ separate FIRs
 *
 * An earlier "pivot" head had only 3 positives, which is too few to learn or
 * to cross-validate; pivots stay an exact computation in breachRanks().
 */
export function buildTargets(nodes: GraphNode[], cases: CaseDef[]): Tensor {
  const risk = new Map(cases.map(c => [c.id, c.risk]));
  const Y = tensor(nodes.length, HEAD_NAMES.length);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    Y.data[i * HEAD_NAMES.length] = node.caseIds.some(c => (risk.get(c) ?? 0) >= 70) ? 1 : 0;
    Y.data[i * HEAD_NAMES.length + 1] = INSTRUMENTS.includes(node.type) && node.caseIds.length >= 2 ? 1 : 0;
  }
  return Y;
}

/* ------------------------------------------------------------------ *
 * Training
 * ------------------------------------------------------------------ */

export interface GnnOptions {
  seed?: number;
  hidden?: number;
  epochs?: number;
  lr?: number;
  l2?: number;
}

export interface GnnEmbedding {
  id: string;
  label: string;
  type: EntityType;
  network: string;
  caseIds: string[];
  /** L2-normalised hidden layer — the learned representation. */
  vector: number[];
  /** Per-head probabilities. */
  probs: [number, number];
}

export interface GnnResult {
  nodes: GraphNode[];
  embeddings: GnnEmbedding[];
  /** id → L2-normalised vector. */
  vectors: Map<string, number[]>;
  /** id → raw node feature row, reused by the link head. */
  features: Map<string, number[]>;
  headNames: readonly string[];
  lossCurve: number[];
  auc: [number, number];
  accuracy: [number, number];
  positives: [number, number];
  dims: { nodes: number; features: number; hidden: number; outputs: number; params: number };
  linkParams: number;
  linkAuc: number;
  /** Held-out AUC of the link head; the training fit is not reported. */
  linkTrainAuc: number;
  linkTestSize: number;
  /** Trained weights of the link-reconstruction head, used by predictLinks. */
  link: { w: Float64Array; b: number };
  seed: number;
  epochs: number;
  trainMs: number;
  graph: EntityGraph;
}

function aucScore(scores: number[], labels: number[]): number {
  const pos = labels.filter(l => l === 1).length;
  const neg = labels.length - pos;
  if (!pos || !neg) return Number.NaN;
  const order = scores
    .map((s, i) => ({ s, l: labels[i] }))
    .sort((a, b) => a.s - b.s);
  let rank = 1;
  const ranks = new Array<number>(order.length).fill(0);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].s === order[i].s) j++;
    const avg = (rank + (rank + (j - i))) / 2;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    rank += j - i + 1;
    i = j + 1;
  }
  let sumPos = 0;
  for (let k = 0; k < order.length; k++) if (order[k].l === 1) sumPos += ranks[k];
  return (sumPos - (pos * (pos + 1)) / 2) / (pos * neg);
}

function trainOnce(
  X: Tensor,
  Y: Tensor,
  adj: SparseRows[],
  opts: Required<GnnOptions>,
  mask?: (row: number, col: number) => boolean,
) {
  const n = X.rows;
  const F = X.cols;
  const H = opts.hidden;
  const K = HEAD_NAMES.length;
  const rand = mulberry32(opts.seed);

  const W1 = glorot(rand, F, H);
  const b1 = new Float64Array(H);
  const W2 = glorot(rand, H, K);
  const b2 = new Float64Array(K);

  const sW1 = adamState(W1.data.length);
  const sb1 = adamState(H);
  const sW2 = adamState(W2.data.length);
  const sb2 = adamState(K);

  const lossCurve: number[] = [];
  const gW1 = tensor(F, H);
  const gW2 = tensor(H, K);
  const gb1 = new Float64Array(H);
  const gb2 = new Float64Array(K);

  let used = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < K; j++) if (!mask || !mask(i, j)) used++;

  for (let epoch = 0; epoch < opts.epochs; epoch++) {
    // forward
    const pre1 = broadcast(propagate(adj, matmul(X, W1), n), b1);
    const Hm = tensor(n, H);
    for (let i = 0; i < pre1.data.length; i++) Hm.data[i] = Math.max(0, pre1.data[i]);
    const Z = broadcast(propagate(adj, matmul(Hm, W2), n), b2);
    const P = sigmoid(Z);

    // loss (masked BCE)
    let loss = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < K; j++) {
        if (mask && mask(i, j)) continue;
        const off = i * K + j;
        const y = Y.data[off];
        const p = Math.min(1 - 1e-7, Math.max(1e-7, P.data[off]));
        loss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
      }
    loss = loss / Math.max(1, used);
    lossCurve.push(loss);

    // backward
    const dZ = tensor(n, K);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < K; j++) {
        const off = i * K + j;
        if (mask && mask(i, j)) continue;
        dZ.data[off] = (P.data[off] - Y.data[off]) / Math.max(1, used);
      }

    // Â is symmetric, so Âᵀ = Â
    const g2 = propagate(adj, dZ, n);
    const gW2d = matmulT(Hm, g2);
    const gb2d = colSum(g2);

    // dPre1 = (Â·dZ)·W2ᵀ, then ReLU mask
    const gPre1 = matmul(g2, transposeMatrix(W2));
    for (let i = 0; i < n; i++)
      for (let j = 0; j < H; j++) {
        const off = i * H + j;
        gPre1.data[off] = pre1.data[off] > 0 ? gPre1.data[off] : 0;
      }
    const g1 = propagate(adj, gPre1, n);
    const gW1d = matmulT(X, g1);
    const gb1d = colSum(g1);

    gW1.data.set(gW1d.data);
    gW2.data.set(gW2d.data);
    gb1.set(gb1d);
    gb2.set(gb2d);

    adamUpdate(W1, gW1, sW1, opts.lr, opts.l2);
    adamUpdate(b1 ? { data: b1, rows: 1, cols: H } : W1, { data: gb1, rows: 1, cols: H }, sb1, opts.lr, 0);
    adamUpdate(W2, gW2, sW2, opts.lr, opts.l2);
    adamUpdate({ data: b2, rows: 1, cols: K }, { data: gb2, rows: 1, cols: K }, sb2, opts.lr, 0);
  }

  const pre1 = broadcast(propagate(adj, matmul(X, W1), n), b1);
  const Hm = tensor(n, H);
  for (let i = 0; i < pre1.data.length; i++) Hm.data[i] = Math.max(0, pre1.data[i]);
  const Z = broadcast(propagate(adj, matmul(Hm, W2), n), b2);
  const P = sigmoid(Z);
  return { W1, b1, W2, b2, Hm, P, lossCurve };
}

function transposeMatrix(a: Tensor): Tensor {
  const out = tensor(a.cols, a.rows);
  for (let i = 0; i < a.rows; i++)
    for (let j = 0; j < a.cols; j++) out.data[j * a.rows + i] = a.data[i * a.cols + j];
  return out;
}

/* ------------------------------------------------------------------ *
 * Learned link head — reconstructs edges, then predicts missing ones
 * ------------------------------------------------------------------ */

function pairFeatures(
  a: number[],
  b: number[],
  af: number[],
  bf: number[],
  out: Float64Array,
  off: number,
) {
  const h = a.length;
  for (let i = 0; i < h; i++) out[off + i] = a[i] * b[i];
  for (let i = 0; i < h; i++) out[off + h + i] = Math.abs(a[i] - b[i]);
  // Endpoint structure travels with the pair: embeddings alone overfit on a
  // 34-node graph, but type/network/degree generalise to unseen edges.
  for (let i = 0; i < af.length; i++) out[off + 2 * h + i] = af[i];
  for (let i = 0; i < af.length; i++) out[off + 2 * h + af.length + i] = bf[i];
}

function pairWidth(h: number, f: number) {
  return 2 * h + 2 * f;
}

/**
 * Bilinear link head trained on the SAME L2-normalised embeddings that
 * predictLinks uses — an earlier version trained on raw activations, so the
 * reported accuracy described a model that was never the one being applied.
 *
 * Reports AUC on a held-out 25% of edges, not the training fit.
 */
function trainLinkHead(
  embeddings: number[][],
  feats: number[][],
  graph: EntityGraph,
  opts: Required<GnnOptions>,
) {
  const h = embeddings[0]?.length ?? 0;
  const f = feats[0]?.length ?? 0;
  const width = pairWidth(h, f);
  const rand = mulberry32(opts.seed + 7919);
  const W = glorot(rand, width, 1);
  const b = new Float64Array(1);
  const sW = adamState(W.data.length);
  const sb = adamState(1);
  const gW = tensor(width, 1);
  const gb = new Float64Array(1);

  const shuffle = <T,>(arr: T[]): T[] => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const positives = shuffle(graph.pairs);
  const negPool: [number, number][] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (negPool.length < positives.length * 2 && guard++ < positives.length * 200) {
    const a = Math.floor(rand() * graph.nodes.length);
    const c = Math.floor(rand() * graph.nodes.length);
    if (a === c) continue;
    const key = a < c ? `${a}|${c}` : `${c}|${a}`;
    if (graph.pairWeight.has(key) || seen.has(key)) continue;
    seen.add(key);
    negPool.push([a, c]);
  }

  // Stratified split: an unstratified 75/25 cut put every positive edge in the
  // training slice, leaving a single-class test set and an undefined AUC.
  const posRows = positives.map(([a, c]) => [a, c, 1] as [number, number, number]);
  const negRows = shuffle(negPool).map(([a, c]) => [a, c, 0] as [number, number, number]);
  const split = (rows: [number, number, number][]) => {
    const cut = Math.max(1, Math.min(rows.length - 1, Math.floor(rows.length * 0.75)));
    return { train: rows.slice(0, cut), test: rows.slice(cut) };
  };
  const pos = split(posRows);
  const neg = split(negRows);
  const train = [...pos.train, ...neg.train];
  const test = [...pos.test, ...neg.test];

  const buildF = (rows: [number, number, number][]): Tensor => {
    const out = tensor(rows.length, width);
    rows.forEach(([a, c], i) =>
      pairFeatures(embeddings[a], embeddings[c], feats[a], feats[c], out.data, i * width),
    );
    return out;
  };
  const F = buildF(train);

  const epochs = Math.max(150, Math.floor(opts.epochs * 0.6));
  const curve: number[] = [];
  for (let e = 0; e < epochs; e++) {
    const P = sigmoid(broadcast(matmul(F, W), b));
    let loss = 0;
    const dZ = tensor(train.length, 1);
    for (let i = 0; i < train.length; i++) {
      const y = train[i][2];
      const p = Math.min(1 - 1e-7, Math.max(1e-7, P.data[i]));
      loss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
      dZ.data[i] = (p - y) / train.length;
    }
    curve.push(loss / train.length);
    gW.data.set(matmulT(F, dZ).data);
    gb[0] = colSum(dZ)[0];
    adamUpdate(W, gW, sW, opts.lr, opts.l2);
    adamUpdate({ data: b, rows: 1, cols: 1 }, { data: gb, rows: 1, cols: 1 }, sb, opts.lr, 0);
  }

  const scoreRows = (rows: [number, number, number][]): number[] => {
    if (!rows.length) return [];
    const Z = matmul(buildF(rows), W);
    return Array.from(Z.data, v => 1 / (1 + Math.exp(-(v + b[0]))));
  };
  const heldAuc = aucScore(
    scoreRows(test),
    test.map(s => s[2]),
  );
  const trainAuc = aucScore(
    scoreRows(train),
    train.map(s => s[2]),
  );
  return { W, b, params: W.data.length + 1, auc: heldAuc, trainAuc, curve, testSize: test.length };
}

/* ------------------------------------------------------------------ *
 * Public entry point
 * ------------------------------------------------------------------ */

const cache = new Map<string, GnnResult>();

function signature(nodes: GraphNode[], edges: GraphEdge[], cases: CaseDef[]) {
  return `${nodes.length}:${edges.length}:${cases.length}:${cases[cases.length - 1]?.id ?? ""}:${nodes[0]?.id ?? ""}`;
}

export function trainGnn(
  nodes: GraphNode[] = NODES,
  edges: GraphEdge[] = EDGES,
  cases: CaseDef[] = CASES,
  options: GnnOptions = {},
): GnnResult {
  const key = signature(nodes, edges, cases);
  const cached = cache.get(key);
  if (cached && options.seed === undefined && Object.keys(options).length === 0) return cached;

  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  const opts: Required<GnnOptions> = {
    seed: options.seed ?? 20260618,
    hidden: options.hidden ?? 16,
    epochs: options.epochs ?? 320,
    lr: options.lr ?? 0.08,
    l2: options.l2 ?? 5e-4,
  };

  const graph = buildEntityGraph(nodes, cases);
  const X = buildFeatures(graph.nodes, edges, cases);
  const Y = buildTargets(graph.nodes, cases);
  const adj = normaliseAdjacency(graph.nodes.length, graph.links);

  const { Hm, P, lossCurve } = trainOnce(X, Y, adj, opts);
  const rawVectors: number[][] = [];
  for (let i = 0; i < graph.nodes.length; i++) {
    const v: number[] = [];
    let norm = 0;
    for (let k = 0; k < Hm.cols; k++) {
      const x = Hm.data[i * Hm.cols + k];
      v.push(x);
      norm += x * x;
    }
    norm = Math.sqrt(norm) || 1;
    rawVectors.push(v.map(x => x / norm));
  }
  const featVectors: number[][] = graph.nodes.map((_, i) =>
    Array.from({ length: X.cols }, (_, k) => X.data[i * X.cols + k]),
  );
  const link = trainLinkHead(rawVectors, featVectors, graph, opts);

  const K = HEAD_NAMES.length;
  const auc: [number, number] = [NaN, NaN];
  const accuracy: [number, number] = [0, 0];
  const positives: [number, number] = [0, 0];
  const scores: number[][] = [[], []];
  const labels: number[][] = [[], []];

  const embeddings: GnnEmbedding[] = graph.nodes.map((node, i) => {
    const raw: number[] = [];
    let norm = 0;
    for (let k = 0; k < Hm.cols; k++) {
      const v = Hm.data[i * Hm.cols + k];
      raw.push(v);
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    const vector = raw.map(v => v / norm);
    const probs: [number, number] = [P.data[i * K], P.data[i * K + 1]];
    for (let k = 0; k < K; k++) {
      scores[k].push(probs[k]);
      labels[k].push(Y.data[i * K + k]);
    }
    return {
      id: node.id,
      label: node.label,
      type: node.type,
      network: node.network,
      caseIds: node.caseIds,
      vector,
      probs,
    };
  });

  for (let k = 0; k < K; k++) {
    positives[k] = labels[k].filter(l => l === 1).length;
    auc[k] = aucScore(scores[k], labels[k]);
    let hit = 0;
    for (let i = 0; i < labels[k].length; i++)
      if ((scores[k][i] >= 0.5 ? 1 : 0) === labels[k][i]) hit++;
    accuracy[k] = hit / Math.max(1, labels[k].length);
  }

  const trainMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - started;
  const result: GnnResult = {
    nodes: graph.nodes,
    embeddings,
    vectors: new Map(embeddings.map(e => [e.id, e.vector])),
    features: new Map(graph.nodes.map((n, i) => [n.id, featVectors[i]])),
    headNames: HEAD_NAMES,
    lossCurve,
    auc,
    accuracy,
    positives,
    dims: {
      nodes: graph.nodes.length,
      features: X.cols,
      hidden: Hm.cols,
      outputs: K,
      params: Hm.cols * 0 + X.cols * Hm.cols + Hm.cols + Hm.cols * K + K,
    },
    linkParams: link.params,
    linkAuc: link.auc,
    linkTrainAuc: link.trainAuc,
    linkTestSize: link.testSize,
    link: { w: link.W.data.slice(), b: link.b[0] },
    seed: opts.seed,
    epochs: opts.epochs,
    trainMs,
    graph,
  };
  if (Object.keys(options).length === 0) cache.set(key, result);
  return result;
}

/* ------------------------------------------------------------------ *
 * Downstream learned tasks
 * ------------------------------------------------------------------ */

export interface PredictedLink {
  a: string;
  b: string;
  aLabel: string;
  bLabel: string;
  score: number;
  aType: EntityType;
  bType: EntityType;
  network: string;
  /** The specific record an investigator should request to confirm or refute. */
  request: string;
}

/** Pairs the model believes should exist but appear in no record. */
export function predictLinks(
  result: GnnResult,
  opts: { limit?: number; minScore?: number; includeKnown?: boolean } = {},
): PredictedLink[] {
  const { limit = 12, minScore = 0.5, includeKnown = false } = opts;
  const { nodes, pairWeight } = result.graph;
  const h = result.embeddings[0]?.vector.length ?? 0;
  if (!h) return [];
  const width = pairWidth(h, result.features.get(nodes[0].id)?.length ?? 0);
  const F = new Float64Array(width);
  const out: PredictedLink[] = [];

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const known = pairWeight.has(`${i}|${j}`);
      if (known && !includeKnown) continue;
      // Same rule the verified structuralHoles() heuristic uses: both sides must
      // be instruments. Allowing one side to be a person or location made the
      // decoder rank co-location noise (an alias with every city it appears in)
      // above genuine missing-handler claims.
      if (!INSTRUMENTS.includes(nodes[i].type) || !INSTRUMENTS.includes(nodes[j].type)) continue;
      pairFeatures(
        result.embeddings[i].vector,
        result.embeddings[j].vector,
        result.features.get(nodes[i].id) ?? [],
        result.features.get(nodes[j].id) ?? [],
        F,
        0,
      );
      const s = scorePair(F, result);
      if (s >= minScore) {
        out.push({
          a: nodes[i].id,
          b: nodes[j].id,
          aLabel: nodes[i].label,
          bLabel: nodes[j].label,
          score: s,
          aType: nodes[i].type,
          bType: nodes[j].type,
          network: nodes[i].network,
          request: recordRequest(nodes[i], nodes[j]),
        });
      }
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

function scorePair(f: Float64Array, result: GnnResult): number {
  const lw = result.link;
  if (!lw || lw.w.length !== f.length) return 0.5;
  let z = lw.b;
  for (let k = 0; k < f.length; k++) z += f[k] * lw.w[k];
  return 1 / (1 + Math.exp(-z));
}

function recordRequest(a: GraphNode, b: GraphNode): string {
  const pick = (x: GraphNode, y: GraphNode) =>
    x.type === "phone"
      ? `CDR for ${x.label} covering ${y.caseIds[0] ?? "the overlapping window"}`
      : x.type === "bank" || x.type === "upi"
        ? `Statement for ${x.label} against ${y.label}`
        : `Records linking ${x.label} and ${y.label}`;
  return pick(a, b);
}

export interface Anomaly {
  id: string;
  label: string;
  type: EntityType;
  /** 0 = sits exactly at its type centroid, 1 = maximally unlike its peers. */
  outlier: number;
  risk: number;
  /** Ranking score: outlierness weighted by escalation risk. Rows are sorted by this. */
  priority: number;
  note: string;
}

/** Embedding distance from the centroid of the entity's own type. */
export function detectAnomalies(result: GnnResult, limit = 10): Anomaly[] {
  const centroids = new Map<EntityType, number[]>();
  const groups = new Map<EntityType, GnnEmbedding[]>();
  for (const e of result.embeddings) {
    const g = groups.get(e.type) ?? [];
    g.push(e);
    groups.set(e.type, g);
  }
  for (const [type, list] of groups) {
    const dim = list[0]?.vector.length ?? 0;
    const c = new Array<number>(dim).fill(0);
    for (const e of list) for (let k = 0; k < dim; k++) c[k] += e.vector[k];
    centroids.set(type, c.map(v => v / Math.max(1, list.length)));
  }
  return result.embeddings
    .map(e => {
      const c = centroids.get(e.type) ?? [];
      let dot = 0;
      let cn = 0;
      for (let k = 0; k < c.length; k++) {
        dot += e.vector[k] * c[k];
        cn += c[k] * c[k];
      }
      const cos = dot / (Math.sqrt(cn) || 1);
      const outlier = Math.max(0, Math.min(1, 1 - cos));
      return {
        id: e.id,
        label: e.label,
        type: e.type,
        outlier,
        risk: e.probs[0],
        priority: outlier * (0.4 + e.probs[0]),
        note:
          e.type === "case"
            ? `Case node embedding unlike other case nodes · escalation ${(e.probs[0] * 100).toFixed(0)}%`
            : `Embedding sits ${(Math.max(0, 1 - cos) * 100).toFixed(0)}% away from the ${e.type} centroid · escalation ${(e.probs[0] * 100).toFixed(0)}%`,
      };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

export interface Cluster {
  id: number;
  members: GnnEmbedding[];
  /** Fraction of the cluster drawn from its majority declared network. */
  purity: number;
  majority: string;
  centroid: number[];
}

/** k-means++ over the learned embeddings, seeded so results are reproducible. */
export function clusterEmbeddings(result: GnnResult, k = 4): Cluster[] {
  const vecs = result.embeddings.map(e => e.vector);
  const n = vecs.length;
  if (!n) return [];
  const dim = vecs[0].length;
  const rand = mulberry32(result.seed + 31);
  const centroids: number[][] = [vecs[Math.floor(rand() * n)].slice()];
  while (centroids.length < Math.min(k, n)) {
    const d = vecs.map(v => {
      let best = Infinity;
      for (const c of centroids) {
        let s = 0;
        for (let i = 0; i < dim; i++) s += (v[i] - c[i]) ** 2;
        best = Math.min(best, s);
      }
      return best;
    });
    const total = d.reduce((a, b) => a + b, 0) || 1;
    let r = rand() * total;
    let pick = 0;
    for (let i = 0; i < n; i++) {
      r -= d[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    centroids.push(vecs[pick].slice());
  }

  const assign = new Array<number>(n).fill(0);
  for (let iter = 0; iter < 40; iter++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        let s = 0;
        for (let k = 0; k < dim; k++) s += (vecs[i][k] - centroids[c][k]) ** 2;
        if (s < bestD) {
          bestD = s;
          best = c;
        }
      }
      if (assign[i] !== best) moved++;
      assign[i] = best;
    }
    for (let c = 0; c < centroids.length; c++) {
      const members = vecs.filter((_, i) => assign[i] === c);
      if (!members.length) continue;
      const nc = new Array<number>(dim).fill(0);
      for (const m of members) for (let i = 0; i < dim; i++) nc[i] += m[i];
      centroids[c] = nc.map(v => v / members.length);
    }
    if (!moved) break;
  }

  return centroids
    .map((centroid, c) => {
      const members = result.embeddings.filter((_, i) => assign[i] === c);
      const tally = new Map<string, number>();
      for (const m of members) tally.set(m.network, (tally.get(m.network) ?? 0) + 1);
      const [majority, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];
      return {
        id: c,
        members,
        purity: members.length ? count / members.length : 0,
        majority,
        centroid,
      };
    })
    .filter(c => c.members.length > 0)
    .sort((a, b) => b.members.length - a.members.length);
}

export interface FoldResult {
  fold: number;
  auc: [number, number];
  heldOut: number;
  /** Positives inside the held-out slice — AUC is NaN without both classes. */
  heldOutPositives: number[];
}

/** Masked-label cross-validation: the honest generalisation number. */
export interface CrossValidation {
  folds: FoldResult[];
  pooled: { auc: [number, number]; labels: number; positives: number[] };
}

export function crossValidate(
  nodes: GraphNode[] = NODES,
  edges: GraphEdge[] = EDGES,
  cases: CaseDef[] = CASES,
  folds = 5,
  options: GnnOptions = {},
): CrossValidation {
  const opts: Required<GnnOptions> = {
    seed: options.seed ?? 20260618,
    hidden: options.hidden ?? 16,
    epochs: options.epochs ?? 200,
    lr: options.lr ?? 0.08,
    l2: options.l2 ?? 5e-4,
  };
  const graph = buildEntityGraph(nodes, cases);
  const X = buildFeatures(graph.nodes, edges, cases);
  const Y = buildTargets(graph.nodes, cases);
  const adj = normaliseAdjacency(graph.nodes.length, graph.links);
  const n = graph.nodes.length;
  const K = HEAD_NAMES.length;
  const results: FoldResult[] = [];
  const pooledScores: number[][] = [[], []];
  const pooledLabels: number[][] = [[], []];

  // Each label maps to exactly ONE fold, and the mapping must not collapse for
  // any fold count. Two earlier versions failed: (base + f * 13) % folds === f
  // collapses whenever 13 ≡ 1 (mod folds), and a plain (row * 7 + col * 13) %
  // folds collapses whenever 7 ≡ 0 (mod folds). An integer hash mixes properly
  // for every divisor.
  const foldOf = (row: number, col: number) => {
    let h = Math.imul(row + 1, 0x9e3779b1) ^ Math.imul(col + 1, 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 15), 0x2545f491);
    h ^= h >>> 13;
    return Math.abs(h) % folds;
  };

  for (let f = 0; f < folds; f++) {
    // The hold-out mask is precomputed: trainOnce calls `mask` many times per
    // epoch, so collecting the held-out set inside the callback would duplicate
    // every entry and silently corrupt the AUC.
    const heldMask = new Uint8Array(n * K);
    const held: [number, number][] = [];
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < K; col++) {
        if (foldOf(row, col) === f) {
          heldMask[row * K + col] = 1;
          held.push([row, col]);
        }
      }
    }
    const scores: number[][] = [[], []];
    const labels: number[][] = [[], []];
    const { P } = trainOnce(X, Y, adj, opts, (row, col) => heldMask[row * K + col] === 1);
    for (const [row, col] of held) {
      scores[col].push(P.data[row * K + col]);
      labels[col].push(Y.data[row * K + col]);
      pooledScores[col].push(P.data[row * K + col]);
      pooledLabels[col].push(Y.data[row * K + col]);
    }
    results.push({
      fold: f + 1,
      auc: [aucScore(scores[0], labels[0]), aucScore(scores[1], labels[1])],
      heldOut: held.length,
      heldOutPositives: labels.map(l => l.filter(v => v === 1).length),
    });
  }
  return {
    folds: results,
    // Per-fold AUC is undefined when a fold holds a single class, so the
    // headline number is the AUC pooled over every held-out label.
    pooled: {
      auc: [
        aucScore(pooledScores[0], pooledLabels[0]),
        aucScore(pooledScores[1], pooledLabels[1]),
      ],
      labels: pooledLabels[0].length + pooledLabels[1].length,
      positives: pooledLabels.map(l => l.filter(v => v === 1).length),
    },
  };
}

/** Summary card for the console header. */
export function describeGnn(result: GnnResult) {
  return {
    architecture: `GCN(${result.dims.features} → ${result.dims.hidden} → ${result.dims.outputs})`,
    aggregator: "symmetric-normalised mean (Â = D^-1/2 (A+I) D^-1/2)",
    params: result.dims.params + result.linkParams,
    finalLoss: result.lossCurve[result.lossCurve.length - 1] ?? 0,
    trainMs: result.trainMs,
    auc: result.auc,
    linkAuc: result.linkAuc,
    seed: result.seed,
  };
}

export { ENTITIES };
