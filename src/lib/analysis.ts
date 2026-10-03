/**
 * CHAKRAVYUH — analysis layer.
 * Weighted risk signals, breach-point fragmentation, structural holes (ghosts),
 * devil's advocate re-weighting, the flag timeline and the time-spiral layout.
 */

import {
  CASES,
  CASE_BY_ID,
  DAY,
  EDGES,
  ENTITY_BY_ID,
  NODES,
  SIGNAL_WEIGHTS,
  TIMELINE_END,
  TIMELINE_START,
  type CaseDef,
  type EntityDef,
  type EntityType,
  type GraphEdge,
  type GraphNode,
  type NetworkId,
  daysBetween,
  parseDate,
} from "./data";

/* ============================== Levels ============================== */

export type Level = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type SignalKey = "sharedPhone" | "sharedBank" | "sharedAlias" | "geo" | "temporal";

export function levelOf(score: number): Level {
  if (score >= 85) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

export const LEVEL_COLOR: Record<Level, string> = {
  LOW: "#22C55E",
  MEDIUM: "#F59E0B",
  HIGH: "#FB7185",
  CRITICAL: "#EF4444",
};

export interface Signal {
  key: SignalKey;
  label: string;
  weight: number;
  hit: boolean;
  detail: string;
}

/* ============================== Signal model ============================== */

function entityCases(entityId: string, cases: CaseDef[]): CaseDef[] {
  return cases.filter(c => c.entities.includes(entityId));
}

function minGap(caseList: CaseDef[]): number | null {
  if (caseList.length < 2) return null;
  const sorted = [...caseList].sort((a, b) => a.date.localeCompare(b.date));
  let best: number | null = null;
  for (let i = 1; i < sorted.length; i++) {
    const g = daysBetween(sorted[i - 1].date, sorted[i].date);
    if (best === null || g < best) best = g;
  }
  return best;
}

/** The five weighted signals for a set of entity ids. */
export function signalsFor(entityIds: string[], cases: CaseDef[] = CASES): Signal[] {
  const involved = entityIds.flatMap(id => entityCases(id, cases));
  const seen = new Set<string>();
  const uniq = involved.filter(c => (seen.has(c.id) ? false : (seen.add(c.id), true)));

  const firstOfType = (types: EntityDef["type"][]) =>
    entityIds
      .map(id => ENTITY_BY_ID[id])
      .find(e => e && types.includes(e.type) && entityCases(e.id, cases).length > 1);

  const phone = firstOfType(["phone"]);
  const bank = firstOfType(["bank", "upi"]);
  const alias = firstOfType(["alias"]);

  const stateSet = new Set(uniq.map(c => c.state));
  const geoHit = stateSet.size > 1;
  const gap = minGap(uniq);
  const temporalHit = gap !== null && gap <= 5;

  const phoneIds = phone ? entityCases(phone.id, cases).map(c => c.id) : [];
  const bankIds = bank ? entityCases(bank.id, cases).map(c => c.id) : [];
  const aliasIds = alias ? entityCases(alias.id, cases).map(c => c.id) : [];

  return [
    {
      key: "sharedPhone",
      label: "Shared phone",
      weight: SIGNAL_WEIGHTS.sharedPhone,
      hit: !!phone,
      detail: phone
        ? `${phone.label} recurs in ${phoneIds.length} cases — ${phoneIds.join(", ")}`
        : "No phone shared across cases",
    },
    {
      key: "sharedBank",
      label: "Shared bank / UPI",
      weight: SIGNAL_WEIGHTS.sharedBank,
      hit: !!bank,
      detail: bank
        ? `${bank.label} recurs in ${bankIds.length} cases — ${bankIds.join(", ")}`
        : "No account shared across cases",
    },
    {
      key: "sharedAlias",
      label: "Shared alias",
      weight: SIGNAL_WEIGHTS.sharedAlias,
      hit: !!alias,
      detail: alias
        ? `${alias.label} recurs in ${aliasIds.length} cases — ${aliasIds.join(", ")}`
        : "No alias shared across cases",
    },
    {
      key: "geo",
      label: "Geographic overlap",
      weight: SIGNAL_WEIGHTS.geo,
      hit: geoHit,
      detail: geoHit
        ? `${stateSet.size} states involved — ${[...stateSet].join(", ")}`
        : "Single state only",
    },
    {
      key: "temporal",
      label: "Temporal pattern",
      weight: SIGNAL_WEIGHTS.temporal,
      hit: temporalHit,
      detail:
        gap === null
          ? "Not enough dated observations"
          : temporalHit
            ? `Shortest gap between records is ${gap} day${gap === 1 ? "" : "s"} — repeating cadence`
            : `Shortest gap is ${gap} days — no cadence match`,
    },
  ];
}

export function scoreSignals(signals: Signal[]): number {
  return Math.min(100, signals.filter(s => s.hit).reduce((n, s) => n + s.weight, 0));
}

/* ============================== Selection analysis ============================== */

export interface SelectionAnalysis {
  kind: "case" | "entity" | "edge";
  id: string;
  title: string;
  subtitle: string;
  score: number;
  level: Level;
  signals: Signal[];
  firstSeen: string | null;
  lastSeen: string | null;
  evidenceIds: string[];
  caseIds: string[];
}

export function analyzeSelection(
  id: string,
  cases: CaseDef[] = CASES,
): SelectionAnalysis | null {
  const edge = EDGES.find(e => e.id === id);
  const node = NODES.find(n => n.id === id);
  if (!edge && !node) return null;

  const entityIds = edge ? [edge.target] : node!.kind === "entity" ? [node!.id] : [];
  const caseIds = edge
    ? [edge.caseId]
    : node!.kind === "case"
      ? [node!.id]
      : cases.filter(c => c.entities.includes(node!.id)).map(c => c.id);

  const involvedCases = caseIds.map(cid => CASE_BY_ID[cid]).filter(Boolean) as CaseDef[];
  const signals = signalsFor(entityIds.length ? entityIds : caseIds.flatMap(cid => CASE_BY_ID[cid]?.entities ?? []), involvedCases.length ? involvedCases : cases);

  let score: number;
  let title: string;
  let subtitle: string;

  if (node && node.kind === "case") {
    const c = CASE_BY_ID[node.id];
    score = c?.risk ?? 0;
    title = `${node.id} — ${c?.title ?? ""}`;
    subtitle = `${c?.city}, ${c?.state} · ${c?.crime}`;
  } else if (node) {
    score = scoreSignals(signals);
    title = node.label;
    subtitle = `${node.type.toUpperCase()} · ${node.sub ?? ""}`;
  } else if (edge) {
    score = scoreSignals(signals);
    const ent = ENTITY_BY_ID[edge.target];
    title = `${CASE_BY_ID[edge.caseId]?.id ?? edge.caseId} → ${ent?.label ?? edge.target}`;
    subtitle = `${ent?.type.toUpperCase()} link · source ${edge.sourceType.toUpperCase()} · confidence ${Math.round(edge.confidence * 100)}%`;
  } else {
    return null;
  }

  const dates = involvedCases.map(c => c.date).sort();
  const evidenceIds = involvedCases.flatMap(
    c => [`EV-${c.id.slice(3)}-FIR`, `EV-${c.id.slice(3)}-CDR`, `EV-${c.id.slice(3)}-BANK`, `EV-${c.id.slice(3)}-OSINT`],
  );

  return {
    kind: edge ? "edge" : node!.kind === "case" ? "case" : "entity",
    id,
    title,
    subtitle,
    score,
    level: levelOf(score),
    signals,
    firstSeen: dates[0] ?? null,
    lastSeen: dates[dates.length - 1] ?? null,
    evidenceIds,
    caseIds,
  };
}

/* ============================== Devil's advocate ============================== */

export interface ChallengeReason {
  id: string;
  title: string;
  why: string;
  check: string;
  removes: SignalKey[];
}

export const CHALLENGE_REASONS: ChallengeReason[] = [
  {
    id: "recycled",
    title: "Recycled SIM",
    why: "Operators reissue a number after ~90 days of inactivity. Two 'users' can be one innocent stranger.",
    check: "Request allocation & porting history for the number from the operator.",
    removes: ["sharedPhone"],
  },
  {
    id: "booth",
    title: "Public booth / shared line",
    why: "A booth number appears in unrelated FIRs because unrelated strangers share one handset.",
    check: "Pull ownership of the line plus its full CDR — count distinct callers per day.",
    removes: ["sharedPhone", "temporal"],
  },
  {
    id: "entry",
    title: "Data-entry error",
    why: "One mistyped digit in one FIR manufactures a perfect match between two unrelated records.",
    check: "Re-verify the digitised value against the photographed original exhibit.",
    removes: ["sharedAlias", "geo"],
  },
];

export function challengeScore(signals: Signal[], ticked: string[]): number {
  const removed = new Set(CHALLENGE_REASONS.filter(r => ticked.includes(r.id)).flatMap(r => r.removes));
  return Math.min(
    100,
    signals.filter(s => s.hit && !removed.has(s.key)).reduce((n, s) => n + s.weight, 0),
  );
}

/* ============================== Breach points ============================== */

function sharedPairCount(a: CaseDef, b: CaseDef, removed: string | null): number {
  return a.entities.filter(e => e !== removed && b.entities.includes(e)).length;
}

/** Connected components of cases after removing one entity. */
export function componentsFor(cases: CaseDef[], removed: string | null): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x);
    if (!p || p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const c of cases) parent.set(c.id, c.id);
  for (let i = 0; i < cases.length; i++) {
    for (let j = i + 1; j < cases.length; j++) {
      if (sharedPairCount(cases[i], cases[j], removed) > 0) {
        const ra = find(cases[i].id);
        const rb = find(cases[j].id);
        if (ra !== rb) parent.set(ra, rb);
      }
    }
  }
  const groups = new Map<string, string[]>();
  for (const c of cases) {
    const root = find(c.id);
    groups.set(root, [...(groups.get(root) ?? []), c.id]);
  }
  return [...groups.values()];
}

export interface BreachRank {
  nodeId: string;
  label: string;
  type: string;
  /** Component count AFTER removal (absolute). */
  fragments: number;
  /** How many EXTRA components removal creates over the uncut graph (delta). */
  fragmentsDelta: number;
  /** Same, restricted to non-noise cases. */
  netFragments: number;
  pairsLost: number;
  cases: string[];
}

export function breachRanks(cases: CaseDef[] = CASES): BreachRank[] {
  const baseAll = componentsFor(cases, null).length;
  const netCases = cases.filter(c => c.network !== "NOISE");
  const baseNet = componentsFor(netCases, null).length;

  const connectedPairs = (removed: string | null): Set<string> => {
    const comps = componentsFor(cases, removed);
    const set = new Set<string>();
    for (const comp of comps) {
      for (let i = 0; i < comp.length; i++)
        for (let j = i + 1; j < comp.length; j++) set.add([comp[i], comp[j]].sort().join("|"));
    }
    return set;
  };
  const before = connectedPairs(null);

  const multi = [...new Set(cases.flatMap(c => c.entities))].filter(
    id => cases.filter(c => c.entities.includes(id)).length > 1,
  );

  const ranks: BreachRank[] = multi.map(id => {
    const after = connectedPairs(id);
    let pairsLost = 0;
    for (const p of before) if (!after.has(p)) pairsLost++;
    const ent = ENTITY_BY_ID[id];
    const fragments = componentsFor(cases, id).length;
    return {
      nodeId: id,
      label: ent?.label ?? id,
      type: ent?.type ?? "entity",
      fragments,
      fragmentsDelta: Math.max(0, fragments - baseAll),
      netFragments: componentsFor(netCases, id).length - (baseNet - 1),
      pairsLost,
      cases: cases.filter(c => c.entities.includes(id)).map(c => c.id),
    };
  });

  ranks.sort(
    (a, b) =>
      b.pairsLost - a.pairsLost ||
      b.fragmentsDelta - a.fragmentsDelta ||
      b.fragments - a.fragments,
  );
  return ranks;
}

export const FRAGMENT_COLORS = ["#22D3EE", "#A78BFA", "#F59E0B", "#22C55E", "#FF4FA3", "#A3E635", "#F472B6", "#60A5FA"];

/* ============================== Ghost heuristics ============================== */

function secondDegree(entityId: string, cases: CaseDef[]): Set<string> {
  const out = new Set<string>();
  for (const c of cases) {
    if (!c.entities.includes(entityId)) continue;
    for (const e of c.entities) if (e !== entityId) out.add(e);
  }
  return out;
}

export interface StructuralHole {
  a: string;
  b: string;
  jaccard: number;
  shared: string[];
  network: NetworkId;
}

/**
 * Pairs of entities that never share a case but whose neighbourhoods overlap.
 *
 * Co-located pairs (e.g. two entities that both appear in the Delhi cluster) are
 * excluded: their overlap is an artifact of geography, not evidence of a missing
 * node. We require at least one INSTRUMENT (phone / bank / upi / alias) on each
 * side, which is what a genuine missing handler or mule layer would look like.
 */
export function structuralHoles(cases: CaseDef[] = CASES, minJaccard = 0.1): StructuralHole[] {
  const INSTRUMENTS: EntityType[] = ["phone", "bank", "upi", "alias"];
  const hasInstrument = (id: string) => INSTRUMENTS.includes(ENTITY_BY_ID[id]?.type);

  const ids = [...new Set(cases.flatMap(c => c.entities))];
  const holes: StructuralHole[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      if (!hasInstrument(a) || !hasInstrument(b)) continue;
      const shareCase = cases.some(c => c.entities.includes(a) && c.entities.includes(b));
      if (shareCase) continue;
      const A = secondDegree(a, cases);
      const B = secondDegree(b, cases);
      const inter = [...A].filter(x => B.has(x));
      const union = new Set([...A, ...B]);
      if (!union.size) continue;
      const jaccard = inter.length / union.size;
      if (jaccard < minJaccard) continue;
      const owner = cases.find(c => c.entities.includes(a));
      holes.push({ a, b, jaccard, shared: inter, network: owner?.network ?? "NOISE" });
    }
  }
  return holes.sort((x, y) => y.jaccard - x.jaccard).slice(0, 8);
}

export interface Cadence {
  gaps: number[];
  mode: number;
  lastDate: string;
  nextPredicted: string;
}

/** Recurring gap between successive FIRs — drives "next appearance" prediction. */
export function temporalCadence(net: NetworkId, cases: CaseDef[] = CASES): Cadence {
  const sorted = cases.filter(c => c.network === net).sort((a, b) => a.date.localeCompare(b.date));
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
  const tally = new Map<number, number>();
  for (const g of gaps) tally.set(g, (tally.get(g) ?? 0) + 1);
  const mode = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 3;
  const lastDate = sorted[sorted.length - 1]?.date ?? TIMELINE_END;
  const d = new Date(`${lastDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + mode);
  return { gaps, mode, lastDate, nextPredicted: d.toISOString().slice(0, 10) };
}

/* ============================== Flag story ============================== */

export interface FlagStory {
  flagDate: string;
  flaggedCases: number;
  statesAtFlag: number;
  nextFir: string;
  /** Days between the flag and the NEXT FIR filed after it. */
  daysEarly: number;
  /** Last FIR in the network, and how many days after the flag it was filed. */
  lastFir: string;
  lastFirDate: string;
  /** The “days saved” headline: flag date -> last linked FIR. */
  daysBeforeLast: number;
}

/**
 * The earliest point at which the first FIRs of NET-A span three states —
 * i.e. when CHAKRAVYUH would have raised the network.
 */
export function flagStory(cases: CaseDef[] = CASES): FlagStory {
  const sorted = cases.filter(c => c.network === "NET-A").sort((a, b) => a.date.localeCompare(b.date));
  let idx = 0;
  for (let i = 0; i < sorted.length; i++) {
    const states = new Set(sorted.slice(0, i + 1).map(c => c.state));
    if (states.size >= 3) {
      idx = i;
      break;
    }
  }
  const flagDate = sorted[idx].date;
  const nextFir = sorted[idx + 1] ?? sorted[idx];
  const lastFir = sorted[sorted.length - 1] ?? nextFir;
  return {
    flagDate,
    flaggedCases: idx + 1,
    statesAtFlag: new Set(sorted.slice(0, idx + 1).map(c => c.state)).size,
    nextFir: nextFir.id,
    daysEarly: Math.max(0, daysBetween(flagDate, nextFir.date)),
    lastFir: lastFir.id,
    lastFirDate: lastFir.date,
    daysBeforeLast: Math.max(0, daysBetween(flagDate, lastFir.date)),
  };
}

/* ============================== Time-travel replay ============================== */

export function edgesUpToDate(edges: GraphEdge[], iso: string): GraphEdge[] {
  return edges.filter(e => e.date <= iso);
}

export function casesUpToDate(cases: CaseDef[], iso: string): CaseDef[] {
  return cases.filter(c => c.date <= iso);
}

export function timelineDays(): string[] {
  const out: string[] = [];
  const start = parseDate(TIMELINE_START);
  const end = parseDate(TIMELINE_END);
  for (let t = start; t <= end; t += DAY) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/* ============================== Chakravyuh time-spiral ============================== */

export interface SpiralGuide {
  r: number;
  label: string;
}

export interface SpiralLayoutResult {
  positions: Map<string, { x: number; y: number }>;
  guides: SpiralGuide[];
  center: { x: number; y: number };
}

/**
 * The signature view: every node is placed on an Archimedean spiral where
 * angle and radius are both a function of time — the graph literally becomes
 * a chakravyuh, ring inside ring, oldest at the core.
 */
export function spiralLayout(
  nodes: GraphNode[],
  cases: CaseDef[],
  width: number,
  height: number,
): SpiralLayoutResult {
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.max(120, Math.min(width, height) / 2 - 64);
  const t0 = parseDate(TIMELINE_START);
  const t1 = parseDate(TIMELINE_END);
  const span = Math.max(1, t1 - t0);

  const tOf = (iso: string) => Math.min(1, Math.max(0, (parseDate(iso) - t0) / span));
  const thetaOf = (t: number) => -Math.PI / 2 + t * Math.PI * 3.2;
  const radiusOf = (t: number) => 34 + t * (maxR - 34);

  const positions = new Map<string, { x: number; y: number }>();

  for (const n of nodes) {
    if (n.kind !== "case") continue;
    const t = tOf(n.date);
    const th = thetaOf(t);
    const r = radiusOf(t);
    positions.set(n.id, { x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) });
  }

  for (const n of nodes) {
    if (n.kind !== "entity") continue;
    const pts = n.caseIds.map(id => positions.get(id)).filter(Boolean) as { x: number; y: number }[];
    if (!pts.length) {
      positions.set(n.id, { x: cx, y: cy });
      continue;
    }
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    // The more cases an entity touches, the closer it sinks toward the core.
    const pull = pts.length >= 3 ? 0.62 : pts.length === 2 ? 0.42 : 0.2;
    positions.set(n.id, {
      x: mx + (cx - mx) * pull,
      y: my + (cy - my) * pull,
    });
  }

  const guides: SpiralGuide[] = ["2026-06-10", "2026-06-14", "2026-06-18", "2026-06-22", "2026-06-28"].map(
    label => ({ r: radiusOf(tOf(label)), label: label.slice(8, 10) + " Jun" }),
  );

  void cases;
  return { positions, guides, center: { x: cx, y: cy } };
}

/** Ordered traversal steps for the "Enter the Labyrinth" walkthrough. */
export const LABYRINTH_STEPS = [
  { key: "gate", label: "The gate", match: (n: GraphNode) => n.network === "NOISE", caption: "Outer ring — unrelated reports. Nothing here connects. You are still outside." },
  { key: "netb", label: "Ring 2 · Network B", match: (n: GraphNode) => n.network === "NET-B", caption: "Fake loan-app ring: one UPI handle, one spoofed line, three states." },
  { key: "bridge", label: "The hinge", match: (n: GraphNode) => n.id === "bk-3310", caption: "Mule account XXXX3310 — the single record that quietly joins the two rings." },
  { key: "neta", label: "Core · Network A", match: (n: GraphNode) => n.network === "NET-A", caption: "Six FIRs, one alias, one account. The core was reachable from the first ring." },
] as const;
