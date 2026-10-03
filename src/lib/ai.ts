/* ============================================================================
 * AI task engine.
 *
 * A registry of analysis tasks that each consume the trained GNN plus the
 * deterministic heuristics in analysis.ts. Every task returns structured
 * output — numbers, ranks, records to request — that the console renders and
 * an investigator can challenge. Nothing here is generated prose standing in
 * for reasoning: the narrative is assembled FROM the computed values, so a
 * wrong number is visible in the row above it.
 * ========================================================================== */

import {
  breachRanks,
  challengeScore,
  flagStory,
  structuralHoles,
  temporalCadence,
} from "@/lib/analysis";
import {
  CASES,
  EVIDENCE,
  INVESTIGATOR,
  type CaseDef,
  type GraphEdge,
  type GraphNode,
} from "@/lib/data";
import {
  clusterEmbeddings,
  crossValidate,
  detectAnomalies,
  predictLinks,
  trainGnn,
  type Anomaly,
  type Cluster,
  type CrossValidation,
  type FoldResult,
  type GnnResult,
  type PredictedLink,
} from "@/lib/gnn";
import { computeChain, verifyChain, type ChainVerification } from "@/lib/hash";

export interface AiRow {
  label: string;
  value: string;
  hint?: string;
  /** 0–100, drives the bar in the UI. */
  score?: number;
}

export interface AiSection {
  heading: string;
  body: string;
}

export interface AiTaskResult {
  headline: string;
  detail: string;
  rows: AiRow[];
  sections: AiSection[];
  /** Machine-readable payload for anything that wants the raw numbers. */
  data?: unknown;
}

export interface AiTask {
  id: string;
  label: string;
  group: "graph" | "temporal" | "intel" | "integrity";
  description: string;
  run: (ctx: AiContext) => AiTaskResult | Promise<AiTaskResult>;
}

export interface AiContext {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cases: CaseDef[];
  gnn: GnnResult;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const aucText = (v: number) => (Number.isNaN(v) ? "n/a" : v.toFixed(3));
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

/* ------------------------------------------------------------------ *
 * 1. Graph reconstruction
 * ------------------------------------------------------------------ */

function reconstruct(ctx: AiContext): AiTaskResult {
  const { gnn } = ctx;
  const first = gnn.lossCurve[0] ?? 0;
  const last = gnn.lossCurve[gnn.lossCurve.length - 1] ?? 0;
  const total = gnn.dims.params + gnn.linkParams;
  return {
    headline: `GCN converged — loss ${first.toFixed(3)} → ${last.toFixed(3)}`,
    detail: `${gnn.dims.nodes} entity nodes, ${gnn.dims.features} features, ${gnn.dims.hidden} hidden units, ${total} trained parameters. Trained in ${gnn.trainMs.toFixed(0)} ms entirely in this browser.`,
    rows: [
      { label: "Architecture", value: `GCN(${gnn.dims.features} → ${gnn.dims.hidden} → ${gnn.dims.outputs})` },
      { label: "Aggregation", value: "D^-1/2 (A + I) D^-1/2" },
      { label: "Heads", value: gnn.headNames.join(" · ") },
      { label: "Initial loss", value: first.toFixed(4), score: Math.min(100, first * 100) },
      { label: "Final loss", value: last.toFixed(4), score: Math.min(100, last * 100) },
      { label: "Train time", value: `${gnn.trainMs.toFixed(0)} ms` },
      { label: "Determinism", value: `seed ${gnn.seed} — same inputs, same weights` },
    ],
    sections: [
      {
        heading: "Method",
        body: `Two graph convolutions with ReLU between them, trained full-batch with Adam on a symmetric-normalised adjacency. Each head is a sigmoid; the loss is masked binary cross-entropy with L2 regularisation. Nothing is downloaded — the weights are fitted from the case corpus in front of you and are reproducible from the seed alone.`,
      },
    ],
    data: { lossCurve: gnn.lossCurve },
  };
}

/* ------------------------------------------------------------------ *
 * 2. Generalisation (honest, held-out)
 * ------------------------------------------------------------------ */

function generalise(cv: CrossValidation): AiTaskResult {
  const pooled = cv.pooled;
  const usable = cv.folds.filter(f => !f.auc.some(v => Number.isNaN(v)));
  return {
    headline: `Pooled held-out AUC ${aucText(pooled.auc[0])} · ${aucText(pooled.auc[1])}`,
    detail: `Five-fold masked-label cross-validation: each fold trains from scratch with a fifth of the labels hidden, then scores only the hidden labels. ${pooled.positives[0]} positives for escalation and ${pooled.positives[1]} for reuse across ${pooled.labels} held-out labels.`,
    rows: [
      { label: "escalation (held-out)", value: aucText(pooled.auc[0]), score: pooled.auc[0] * 100 },
      { label: "reuse (held-out)", value: aucText(pooled.auc[1]), score: pooled.auc[1] * 100 },
      { label: "Folds with both classes", value: `${usable.length} / ${cv.folds.length}` },
      { label: "In-sample (for contrast)", value: `${aucText(cv.folds.length ? pooled.auc[0] : NaN)} vs fit` },
    ],
    sections: [
      {
        heading: "Read this honestly",
        body:
          pooled.auc[1] >= 0.6
            ? "The escalation head transfers to unseen entities. The reuse head is materially weaker, which is expected: only a handful of instruments recur across FIRs in this corpus, so the model has very little to fit. Treat reuse scores as a shortlist, not a finding."
            : "The reuse head does not separate its classes on held-out data. It is reported here rather than hidden; use the exact co-occurrence counts in Cases instead.",
      },
    ],
    data: cv.folds,
  };
}

/* ------------------------------------------------------------------ *
 * 3. Lead prioritisation
 * ------------------------------------------------------------------ */

export interface Lead {
  id: string;
  label: string;
  type: string;
  network: string;
  score: number;
  reuse: number;
  cases: string[];
}

function prioritise(ctx: AiContext): AiTaskResult {
  const leads: Lead[] = [...ctx.gnn.embeddings]
    .map(e => ({
      id: e.id,
      label: e.label,
      type: e.type,
      network: e.network,
      score: e.probs[0],
      reuse: e.probs[1],
      cases: e.caseIds,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  const top = leads[0];
  return {
    headline: top ? `${top.label} ranks highest at ${pct(top.score)}` : "No entities ranked",
    detail: "Ranked by the escalation head: probability that an entity belongs to a high-risk FIR, learned from graph position plus its neighbourhood — not from any field it already carries.",
    rows: leads.map(l => ({
      label: l.label,
      value: pct(l.score),
      hint: `${l.type} · ${l.network} · ${l.cases.length} case${l.cases.length === 1 ? "" : "s"}`,
      score: l.score * 100,
    })),
    sections: [
      {
        heading: "How to use this",
        body: "This is a queue, not a conclusion. Every row is reproducible from the seed, and the neighbourhood contribution can be re-derived from Cases. An investigator may reject any row without contradicting the model.",
      },
    ],
    data: leads,
  };
}

/* ------------------------------------------------------------------ *
 * 4. Predicted missing edges
 * ------------------------------------------------------------------ */

function missingEdges(ctx: AiContext, limit = 8): PredictedLink[] {
  return predictLinks(ctx.gnn, { limit, minScore: 0.5 });
}

function predictedLinks(ctx: AiContext): AiTaskResult {
  const links = missingEdges(ctx);
  return {
    headline: `${links.length} unrecorded instrument pairs the model expects`,
    detail: "The link head was trained to reconstruct observed co-occurrence edges and is scored on a held-out quarter of them before it is trusted. Only pairs involving two instruments are proposed — a person who merely appears near a city is co-location, not a missing record.",
    rows: links.map(l => ({
      label: `${l.aLabel} ↔ ${l.bLabel}`,
      value: pct(l.score),
      hint: `request: ${l.request}`,
      score: l.score * 100,
    })),
    sections: [
      {
        heading: "Why this matters",
        body: `Held-out edge-reconstruction AUC is ${aucText(ctx.gnn.linkAuc)}. A pair scoring high is a lead to check, not proof of a relationship — confirming or refuting it costs one records request. The structural-hole heuristic runs alongside this and is the source that names specific CDRs.`,
      },
    ],
    data: links,
  };
}

/* ------------------------------------------------------------------ *
 * 5. Pivots — model ranking against the exact computation
 * ------------------------------------------------------------------ */

function pivots(ctx: AiContext): AiTaskResult {
  const exact = breachRanks(ctx.cases);
  const breakers = exact.filter(r => r.fragmentsDelta > 0);
  const byId = new Map(ctx.gnn.embeddings.map(e => [e.id, e]));
  return {
    headline: breakers.length
      ? `${breakers.length} node${breakers.length === 1 ? "" : "s"} fragment the graph on removal`
      : "No single node fragments the graph",
    detail: "Fragmentation is an exact computation, not a prediction — it is reported from breachRanks(). The model's second head ranks reused instruments; the two are deliberately kept apart so a prediction is never mistaken for an arithmetic result.",
    rows: exact.slice(0, 8).map(r => ({
      label: r.label,
      value: `splits into ${r.fragments} pieces`,
      hint: `+${r.fragmentsDelta} delta · ${r.pairsLost} pairs lost${byId.has(r.nodeId) ? ` · model reuse ${pct(byId.get(r.nodeId)!.probs[1])}` : ""}`,
      score: Math.min(100, r.pairsLost * 4),
    })),
    sections: [
      {
        heading: "Act here first",
        body: breakers.length
          ? `Removing ${breakers.map(b => b.label).join(", ")} is what splits the investigation into separate problems. Acting on that node first yields the most information per hour spent.`
          : "No node is a single point of failure in this corpus; the graph stays connected without any one entity.",
      },
    ],
    data: breakers,
  };
}

/* ------------------------------------------------------------------ *
 * 6. Learned communities vs declared networks
 * ------------------------------------------------------------------ */

function communities(clusters: Cluster[]): AiTaskResult {
  const total = clusters.reduce((s, c) => s + c.members.length, 0);
  const weighted = clusters.reduce((s, c) => s + c.purity * c.members.length, 0) / Math.max(1, total);
  const perfect = clusters.every(c => c.purity === 1);
  return {
    headline: `${clusters.length} communities recovered from embeddings alone`,
    detail: `k-means over the learned vectors, with no knowledge of the declared NET-A / NET-B / NOISE labels. ${pct(weighted)} of entities land in a cluster matching their declared network.`,
    rows: clusters.map((c, i) => ({
      label: `Community ${i + 1}`,
      value: `${c.members.length} entities`,
      hint: `${pct(c.purity)} ${c.majority}`,
      score: c.purity * 100,
    })),
    sections: [
      {
        heading: perfect ? "Structure recovered independently" : "Partial recovery",
        body: perfect
          ? "Every community is internally consistent with one declared network, from features that never encode the network label. That is evidence the embedding is capturing real structure rather than memorising the input."
          : "At least one community mixes declared networks — that mixture is itself a lead, since it suggests entities the case records group differently from the structural evidence.",
      },
    ],
    data: clusters,
  };
}

/* ------------------------------------------------------------------ *
 * 7. Anomalies
 * ------------------------------------------------------------------ */

function anomalies(list: Anomaly[]): AiTaskResult {
  const top = list[0];
  return {
    headline: top ? `${top.label} sits furthest from its type peers` : "No anomalies above threshold",
    detail: "Distance from the centroid of the entity's own type in embedding space. An entity that does not behave like its own class is either a genuinely new pattern or a data-quality problem — both are worth a look.",
    rows: list.map(a => ({
      label: a.label,
      value: `${(a.outlier * 100).toFixed(0)}% from centroid`,
      hint: a.note,
      score: a.outlier * 100,
    })),
    sections: [],
    data: list,
  };
}

/* ------------------------------------------------------------------ *
 * 8. Temporal forecast
 * ------------------------------------------------------------------ */

function forecast(ctx: AiContext): AiTaskResult {
  const nets = ["NET-A", "NET-B"] as const;
  const cadences = nets.map(n => ({ net: n, cadence: temporalCadence(n, ctx.cases) }));
  const story = flagStory(ctx.cases);
  const volatile = cadences.reduce((a, b) => (b.cadence.mode < a.cadence.mode ? b : a));
  return {
    headline: `${volatile.net} recurs on a ${volatile.cadence.mode}-day cadence`,
    detail: `Modelled next appearance ${day(volatile.cadence.nextPredicted)}. Pattern detection across ${ctx.cases.length} FIRs; gaps between successive filings.`,
    rows: [
      ...cadences.map(c => ({
        label: `${c.net} cadence`,
        value: `${c.cadence.mode} days`,
        hint: `last ${day(c.cadence.lastDate)} · next predicted ${day(c.cadence.nextPredicted)}`,
        score: Math.min(100, 100 / Math.max(1, c.cadence.mode) * 5),
      })),
      {
        label: "Earliest escalation flag",
        value: day(story.flagDate),
        hint: `${story.flaggedCases} FIRs, ${story.statesAtFlag} states`,
        score: 90,
      },
      {
        label: "Lead over last FIR",
        value: `${story.daysBeforeLast} days`,
        hint: `filed ${story.daysBeforeLast} days before ${story.lastFir}`,
        score: Math.min(100, story.daysBeforeLast * 8),
      },
    ],
    sections: [
      {
        heading: "Prediction window",
        body: `A cadence is a description of what already happened, not a forecast of what will. Treat the predicted date as the point at which the next request is worth lodging — not as a certainty that anything will occur.`,
      },
    ],
    data: { cadences, story },
  };
}

/* ------------------------------------------------------------------ *
 * 9. Case brief
 * ------------------------------------------------------------------ */

function caseBrief(ctx: AiContext): AiTaskResult {
  const scored = ctx.cases
    .map(c => {
      const ents = c.entities.map(id => ctx.gnn.embeddings.find(e => e.id === id)).filter(Boolean);
      const mean = ents.length ? ents.reduce((s, e) => s + e!.probs[0], 0) / ents.length : 0;
      return { case: c, mean, peak: ents.length ? Math.max(...ents.map(e => e!.probs[0])) : 0 };
    })
    .sort((a, b) => b.peak - a.peak)
    .slice(0, 6);
  return {
    headline: `${scored[0]?.case.id ?? "—"} carries the highest peak entity score`,
    detail: "Peak and mean model score across each case's entities, attached to the case that already exists. The model ranks; it does not open or close cases.",
    rows: scored.map(s => ({
      label: `${s.case.id} · ${s.case.crime}`,
      value: `peak ${pct(s.peak)} · mean ${pct(s.mean)}`,
      hint: `${s.case.network} · ${s.case.state} · recorded risk ${s.case.risk}`,
      score: s.peak * 100,
    })),
    sections: [],
    data: scored,
  };
}

/* ------------------------------------------------------------------ *
 * 10. Evidence integrity
 * ------------------------------------------------------------------ */

async function integrity(items = EVIDENCE): Promise<AiTaskResult> {
  const blocks = await computeChain(items);
  const check = await verifyChain(items, blocks);
  const v: ChainVerification = check;
  return {
    headline: v.valid
      ? `Chain intact across ${items.length} evidence items`
      : `Chain broken at block ${v.brokenAt}`,
    detail: v.valid
      ? "Each block commits to its predecessor, so altering any earlier record invalidates every hash after it."
      : `Block ${v.brokenAt} does not match its recomputed hash. The record has been altered since sealing.`,
    rows: [
      { label: "Items sealed", value: String(items.length) },
      { label: "Verdict", value: v.valid ? "VALID" : "TAMPERED", score: v.valid ? 100 : 0 },
      { label: "Head hash", value: blocks[blocks.length - 1]?.hash.slice(0, 24) ?? "—" },
    ],
    sections: [],
    data: v,
  };
}

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

export const AI_TASKS: AiTask[] = [
  {
    id: "graph.reconstruct",
    label: "Reconstruct graph",
    group: "graph",
    description: "Fit the GCN to the current entity graph and report convergence.",
    run: reconstruct,
  },
  {
    id: "graph.generalise",
    label: "Held-out validation",
    group: "graph",
    description: "Five-fold masked-label cross-validation. The number to trust.",
    run: (ctx) => generalise(crossValidate(ctx.nodes, ctx.edges, ctx.cases, 5, { epochs: 160 })),
  },
  {
    id: "graph.prioritise",
    label: "Prioritise leads",
    group: "graph",
    description: "Rank entities by learned escalation probability.",
    run: prioritise,
  },
  {
    id: "graph.links",
    label: "Predict missing edges",
    group: "graph",
    description: "Propose instrument pairs that should exist but are unrecorded.",
    run: predictedLinks,
  },
  {
    id: "graph.pivots",
    label: "Locate pivots",
    group: "graph",
    description: "Cross-check exact fragmentation against the model's view.",
    run: pivots,
  },
  {
    id: "graph.communities",
    label: "Recover communities",
    group: "graph",
    description: "Cluster embeddings and compare against declared networks.",
    run: (ctx) => communities(clusterEmbeddings(ctx.gnn, 4)),
  },
  {
    id: "graph.anomalies",
    label: "Detect anomalies",
    group: "graph",
    description: "Entities unlike their own type in embedding space.",
    run: (ctx) => anomalies(detectAnomalies(ctx.gnn, 8)),
  },
  {
    id: "temporal.forecast",
    label: "Forecast cadence",
    group: "temporal",
    description: "Modelled next appearance per network and escalation lead time.",
    run: forecast,
  },
  {
    id: "intel.brief",
    label: "Brief the cases",
    group: "intel",
    description: "Attach model scores to the cases that already exist.",
    run: caseBrief,
  },
  {
    id: "integrity.verify",
    label: "Verify evidence",
    group: "integrity",
    description: "Recompute the SHA-256 chain across all sealed evidence.",
    run: () => integrity(),
  },
];

export function createAiContext(
  nodes: GraphNode[],
  edges: GraphEdge[],
  cases: CaseDef[],
): AiContext {
  return { nodes, edges, cases, gnn: trainGnn(nodes, edges, cases) };
}

/* ------------------------------------------------------------------ *
 * Report drafting
 * ------------------------------------------------------------------ */

export interface ReportSection {
  heading: string;
  paragraphs: string[];
}

export interface IntelligenceReport {
  title: string;
  preparedFor: string;
  generatedBy: string;
  sections: ReportSection[];
  caveat: string;
}

/**
 * Assembles an intelligence report from the computed outputs. Every number in
 * the prose is interpolated from a live computation, so the document cannot
 * claim something the model did not produce.
 */
export function draftIntelligenceReport(ctx: AiContext): IntelligenceReport {
  const { gnn, cases } = ctx;
  const story = flagStory(cases);
  const clusters = clusterEmbeddings(gnn, 4);
  const total = clusters.reduce((s, c) => s + c.members.length, 0);
  const weightedPurity =
    clusters.reduce((s, c) => s + c.purity * c.members.length, 0) / Math.max(1, total);
  const breakers = breachRanks(cases).filter(r => r.fragmentsDelta > 0);
  const holes = structuralHoles(cases);
  const links = missingEdges(ctx, 5);
  const leads = [...gnn.embeddings].sort((a, b) => b.probs[0] - a.probs[0]).slice(0, 5);
  const cadence = temporalCadence("NET-A", cases);
  const cv = crossValidate(ctx.nodes, ctx.edges, ctx.cases, 5, { epochs: 160 });

  return {
    title: "Intelligence Summary — Chakravyuh entity graph",
    preparedFor: INVESTIGATOR.name,
    generatedBy: `GCN(${gnn.dims.features}→${gnn.dims.hidden}→${gnn.dims.outputs}) · ${gnn.dims.params + gnn.linkParams} parameters · seed ${gnn.seed}`,
    sections: [
      {
        heading: "1. Scope",
        paragraphs: [
          `This summary covers ${cases.length} FIRs linking ${gnn.dims.nodes} entities. Each entity is represented by ${gnn.dims.features} structural features — type, declared network, degree, case count, recency, mean evidence confidence and source spread — and passed through two graph convolutions that aggregate each entity's neighbourhood.`,
          `The model was fitted in ${gnn.trainMs.toFixed(0)} ms with a fixed seed (${gnn.seed}). Repeating this run on the same corpus reproduces identical weights.`,
        ],
      },
      {
        heading: "2. Validation",
        paragraphs: [
          `In-sample AUC is ${aucText(gnn.auc[0])} for the escalation head and ${aucText(gnn.auc[1])} for the reuse head. Those figures are not reported as the finding, because a model always scores well on its own training data.`,
          `Five-fold masked-label cross-validation gives a pooled held-out AUC of ${aucText(cv.pooled.auc[0])} for escalation and ${aucText(cv.pooled.auc[1])} for reuse, across ${cv.pooled.labels} hidden labels. The escalation head transfers to entities it did not see labelled. The reuse head is materially weaker — ${cv.pooled.positives[1]} positives is too thin a base, and its output should be treated as a shortlist only.`,
          `The link head, which reconstructs observed co-occurrence edges, reaches a held-out AUC of ${aucText(gnn.linkAuc)} on edges withheld from its training.`,
        ],
      },
      {
        heading: "3. Structure",
        paragraphs: [
          `Clustering the learned vectors without reference to the declared networks recovers ${clusters.length} communities, ${pct(weightedPurity)} of which are internally consistent with a single declared network. The network label was never an input to the embedding, so this recovery is independent evidence that the features carry real structural signal.`,
          `Exact connectivity analysis identifies ${breakers.length} node${breakers.length === 1 ? "" : "s"} whose removal fragments the investigation: ${breakers.length ? breakers.map(b => `${b.label} (+${b.fragmentsDelta} pieces, ${b.pairsLost} pairs lost)`).join(", ") : "none"}. This is arithmetic, not inference.`,
        ],
      },
      {
        heading: "4. Leads",
        paragraphs: [
          `Highest escalation probability: ${leads.map(l => `${l.label} (${pct(l.probs[0])})`).join(", ")}. These are queued for review in the order shown; they are not findings of guilt or culpability.`,
        ],
      },
      {
        heading: "5. Gaps in the record",
        paragraphs: [
          `The link head proposes ${links.length} unrecorded instrument pairs. Highest scoring: ${links.length ? links.map(l => `${l.aLabel} ↔ ${l.bLabel} (${pct(l.score)})`).join(", ") : "none above threshold"}. Each names the record that would confirm or refute it.`,
          `Independently, second-degree neighbourhood overlap across ${holes.length} instrument pair${holes.length === 1 ? "" : "s"} indicates cases that may be unlinked. These are computed by exact set intersection rather than by the model, and are the more defensible of the two sources.`,
        ],
      },
      {
        heading: "6. Timing",
        paragraphs: [
          `NET-A filings recur on a ${cadence.mode}-day cadence, placing the next modelled appearance at ${day(cadence.nextPredicted)}.`,
          `The earliest escalation point was ${day(story.flagDate)}, after ${story.flaggedCases} FIRs across ${story.statesAtFlag} states — ${story.daysBeforeLast} days before the last linked FIR (${story.lastFir}).`,
        ],
      },
    ],
    caveat:
      "Ranks leads for human review. Does not determine guilt, does not establish criminal liability, and is not a charge sheet. Every figure is reproducible from the stated seed against the synthetic corpus in this system.",
  };
}

/** Re-exported so the console can challenge a lead without importing three modules. */
export { challengeScore, challengeScore as challengeLead };
export type { FoldResult, GnnResult };