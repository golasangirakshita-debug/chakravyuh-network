/**
 * CHAKRAVYUH — synthetic forensic dataset.
 * Every page reads from this one source of truth.
 *
 * 12 cases across two organised networks + noise, entities, graph nodes/edges
 * (each edge carries date / caseId / sourceType / confidence), evidence,
 * CDR rows, transactions, kill-chain observations and ghost-node seeds.
 */

/* ============================== Types ============================== */

export type NetworkId = "NET-A" | "NET-B" | "NOISE";
export type SourceType = "fir" | "cdr" | "financial" | "osint";
export type EntityType = "case" | "person" | "alias" | "phone" | "bank" | "upi" | "location";
export type EvidenceType = "FIR" | "CDR" | "BANK" | "OSINT";
export type CaseStatus = "Open" | "Under Review" | "Escalated" | "Closed";

export interface EntityDef {
  id: string;
  type: Exclude<EntityType, "case">;
  label: string;
  meta?: string;
}

export interface CaseDef {
  id: string;
  network: NetworkId;
  state: string;
  city: string;
  date: string; // ISO date
  crime: string;
  status: CaseStatus;
  risk: number;
  title: string;
  summary: string;
  entities: string[];
}

export interface EvidenceItem {
  id: string;
  caseId: string;
  type: EvidenceType;
  title: string;
  timestamp: string;
  content: string;
}

export interface GraphNode {
  id: string;
  kind: "case" | "entity";
  type: EntityType;
  label: string;
  sub?: string;
  network: NetworkId;
  date: string; // first observed
  caseIds: string[];
}

export interface GraphEdge {
  id: string;
  source: string; // node id
  target: string; // node id
  date: string;
  caseId: string;
  sourceType: SourceType;
  confidence: number;
}

export interface CdrRow {
  id: string;
  network: NetworkId;
  caseId: string;
  ts: string;
  phone: string;
  tower: string;
  city: string;
  dur: number;
  dir: "in" | "out";
}

export interface Txn {
  id: string;
  date: string;
  caseId: string;
  from: string;
  to: string;
  amount: number;
  kind: "credit" | "transfer" | "withdrawal" | "collection";
}

export interface TimelineEvent {
  ts: string;
  label: string;
  source: SourceType;
}

/* ============================== Palette / constants ============================== */

export const COLORS = {
  cyan: "#22D3EE",
  violet: "#A78BFA",
  amber: "#F59E0B",
  red: "#EF4444",
  green: "#22C55E",
  pink: "#FF4FA3",
  purple: "#B84DFF",
  grey: "#6B7280",
  lime: "#A3E635",
  white: "#F5F7FB",
} as const;

export const SOURCE_COLOR: Record<SourceType, string> = {
  fir: COLORS.cyan,
  cdr: COLORS.amber,
  financial: COLORS.green,
  osint: COLORS.violet,
};

export const SOURCE_LABEL: Record<SourceType, string> = {
  fir: "FIR",
  cdr: "CDR",
  financial: "Financial",
  osint: "OSINT",
};

export const SIGNAL_WEIGHTS = {
  sharedPhone: 30,
  sharedBank: 30,
  sharedAlias: 15,
  geo: 10,
  temporal: 15,
} as const;

export const INVESTIGATOR = {
  badge: "INV-2041",
  pass: "vyuh123",
  name: "Insp. R. Menon",
  unit: "Cyber & Organised Crime Cell",
  station: "PS Central Crime Station",
} as const;

export const NETWORKS: {
  id: NetworkId;
  label: string;
  risk: number;
  color: string;
  kind: string;
}[] = [
  { id: "NET-A", label: "NETWORK A — “Ravi” trafficking ring", risk: 92, color: COLORS.cyan, kind: "Human trafficking" },
  { id: "NET-B", label: "NETWORK B — fake loan-app fraud ring", risk: 71, color: COLORS.violet, kind: "Cyber financial fraud" },
  { id: "NOISE", label: "Unrelated / single-case reports", risk: 12, color: COLORS.grey, kind: "Mixed" },
];

/* ============================== Entities ============================== */

export const ENTITIES: EntityDef[] = [
  // ---- NET-A ----
  { id: "p-ravi", type: "person", label: "Ravi", meta: "Handler · prime person of interest" },
  { id: "a-ravi", type: "alias", label: "alias “Ravi”", meta: "Shared alias across 5 FIRs" },
  { id: "p-priya", type: "person", label: "Priya Sharma", meta: "Victim · 19 · Bengaluru" },
  { id: "p-neha", type: "person", label: "Neha Patil", meta: "Victim · 22 · Pune" },
  { id: "p-anjali", type: "person", label: "Anjali Rao", meta: "Victim · 20 · Visakhapatnam" },
  { id: "p-sunita", type: "person", label: "Sunita Das", meta: "Victim · 24 · Bhubaneswar" },
  { id: "ph-9876543210", type: "phone", label: "9876543210", meta: "Postpaid · KA circle · 2 states" },
  { id: "ph-9123456780", type: "phone", label: "9123456780", meta: "Prepaid · MH circle" },
  { id: "ph-9988776655", type: "phone", label: "9988776655", meta: "OSINT-linked burner" },
  { id: "bk-8842", type: "bank", label: "XXXX8842", meta: "Recurring credits · 3 cases" },
  { id: "loc-bengaluru", type: "location", label: "Bengaluru", meta: "Karnataka" },
  { id: "loc-pune", type: "location", label: "Pune", meta: "Maharashtra" },
  { id: "loc-hyderabad", type: "location", label: "Hyderabad", meta: "Telangana" },
  { id: "loc-visakhapatnam", type: "location", label: "Visakhapatnam", meta: "Andhra Pradesh" },
  { id: "loc-bhubaneswar", type: "location", label: "Bhubaneswar", meta: "Odisha" },
  { id: "loc-chennai", type: "location", label: "Chennai", meta: "Tamil Nadu" },

  // ---- NET-B ----
  { id: "p-aman", type: "person", label: "Aman Verma", meta: "Complainant · Delhi" },
  { id: "p-ritika", type: "person", label: "Ritika Sen", meta: "Complainant · Surat" },
  { id: "p-deepak", type: "person", label: "Deepak Yadav", meta: "Complainant · Noida" },
  { id: "ph-9810000042", type: "phone", label: "9810000042", meta: "Spoofed customer-care line" },
  { id: "upi-fastcash", type: "upi", label: "fastcash@upi", meta: "Collection handle · 610 credits" },
  { id: "bk-3310", type: "bank", label: "XXXX3310", meta: "Mule account · BRIDGE CR-006 ↔ CR-008" },
  { id: "loc-delhi", type: "location", label: "Delhi", meta: "NCT of Delhi" },
  { id: "loc-surat", type: "location", label: "Surat", meta: "Gujarat" },
  { id: "loc-noida", type: "location", label: "Noida", meta: "Uttar Pradesh" },

  // ---- NOISE / bridge artefacts ----
  { id: "p-sreeja", type: "person", label: "Sreeja Nair", meta: "Complainant · Thrissur" },
  { id: "ph-1800123456", type: "phone", label: "1800123456", meta: "Public STD booth · shared line ⚠" },
  { id: "loc-thrissur", type: "location", label: "Thrissur", meta: "Kerala" },
  { id: "bk-7781", type: "bank", label: "XXXX7781", meta: "Salary account · unrelated" },
  { id: "ph-9040012345", type: "phone", label: "9040012345", meta: "Prepaid · Punjab circle" },
  { id: "loc-ludhiana", type: "location", label: "Ludhiana", meta: "Punjab" },
  { id: "p-arindam", type: "person", label: "Arindam Ghosh", meta: "Complainant · Kolkata" },
  { id: "bk-5527", type: "bank", label: "XXXX5527", meta: "Fixed deposit · unrelated" },
  { id: "loc-kolkata", type: "location", label: "Kolkata", meta: "West Bengal" },
];

export const ENTITY_BY_ID: Record<string, EntityDef> = Object.fromEntries(
  ENTITIES.map(e => [e.id, e]),
);

/* ============================== Cases ============================== */

export const CASES: CaseDef[] = [
  {
    id: "CR-001",
    network: "NET-A",
    state: "Karnataka",
    city: "Bengaluru",
    date: "2026-06-10",
    crime: "Human trafficking",
    status: "Escalated",
    risk: 88,
    title: "Missing person, trafficking suspected",
    summary:
      "Priya Sharma (19) reported missing. CDR places her last contact with a number that resurfaces in three other states.",
    entities: ["p-priya", "a-ravi", "ph-9876543210", "loc-bengaluru"],
  },
  {
    id: "CR-002",
    network: "NET-A",
    state: "Maharashtra",
    city: "Pune",
    date: "2026-06-15",
    crime: "Human trafficking",
    status: "Escalated",
    risk: 84,
    title: "Second victim, identical handler pattern",
    summary:
      "Neha Patil (22) lured with a false job offer. Same “Ravi” alias closes the approach in a different state five days later.",
    entities: ["p-neha", "a-ravi", "ph-9123456780", "loc-pune"],
  },
  {
    id: "CR-003",
    network: "NET-A",
    state: "Telangana",
    city: "Hyderabad",
    date: "2026-06-18",
    crime: "Trafficking — financial layer",
    status: "Under Review",
    risk: 90,
    title: "Cash layer under the alias",
    summary:
      "Person “Ravi” withdraws ₹85,000 in two tranches from account XXXX8842, one day after the Pune report.",
    entities: ["p-ravi", "a-ravi", "bk-8842", "loc-hyderabad"],
  },
  {
    id: "CR-004",
    network: "NET-A",
    state: "Andhra Pradesh",
    city: "Visakhapatnam",
    date: "2026-06-22",
    crime: "Human trafficking",
    status: "Escalated",
    risk: 93,
    title: "Victim recovered, phone reuse confirmed",
    summary:
      "Anjali Rao (20) recovered. The Bengaluru number and account XXXX8842 both reappear — the ring is now visible in 3 states.",
    entities: ["p-anjali", "ph-9876543210", "bk-8842", "ph-1800123456", "loc-visakhapatnam"],
  },
  {
    id: "CR-005",
    network: "NET-A",
    state: "Odisha",
    city: "Bhubaneswar",
    date: "2026-06-25",
    crime: "Human trafficking — OSINT corroboration",
    status: "Under Review",
    risk: 86,
    title: "OSINT ties the alias to a burner",
    summary:
      "A scraped profile links alias “Ravi” to phone 9988776655, carried by victim Sunita Das (24).",
    entities: ["p-sunita", "a-ravi", "ph-9988776655", "loc-bhubaneswar"],
  },
  {
    id: "CR-006",
    network: "NET-A",
    state: "Tamil Nadu",
    city: "Chennai",
    date: "2026-06-28",
    crime: "Money laundering — mule handoff",
    status: "Open",
    risk: 95,
    title: "Mule account appears — and it is not ours",
    summary:
      "₹1,20,000 lands in XXXX8842 and is pushed to mule account XXXX3310 — an account that had already surfaced in a cyber-fraud case in Surat.",
    entities: ["bk-8842", "ph-9988776655", "bk-3310", "loc-chennai"],
  },
  {
    id: "CR-007",
    network: "NET-B",
    state: "Delhi",
    city: "Delhi",
    date: "2026-06-14",
    crime: "Loan-app cyber fraud",
    status: "Open",
    risk: 68,
    title: "Fake loan app, advance-fee theft",
    summary:
      "Aman Verma charged a “processing fee” to fastcash@upi; the app vanished from the store within 48 hours.",
    entities: ["p-aman", "ph-9810000042", "upi-fastcash", "loc-delhi"],
  },
  {
    id: "CR-008",
    network: "NET-B",
    state: "Gujarat",
    city: "Surat",
    date: "2026-06-17",
    crime: "Loan-app cyber fraud",
    status: "Under Review",
    risk: 74,
    title: "Same handle, new state",
    summary:
      "Ritika Sen reports identical scripts from the same spoofed line. Funds hop through mule account XXXX3310.",
    entities: ["p-ritika", "ph-9810000042", "upi-fastcash", "bk-3310", "loc-surat"],
  },
  {
    id: "CR-009",
    network: "NET-B",
    state: "Uttar Pradesh",
    city: "Noida",
    date: "2026-06-21",
    crime: "Loan-app cyber fraud",
    status: "Open",
    risk: 71,
    title: "Third complaint, one collection handle",
    summary:
      "Deepak Yadav paid ₹2,05,000 across nine transactions into fastcash@upi — the same handle as Delhi and Surat.",
    entities: ["p-deepak", "ph-9810000042", "upi-fastcash", "loc-noida"],
  },
  {
    id: "CR-010",
    network: "NOISE",
    state: "Kerala",
    city: "Thrissur",
    date: "2026-06-20",
    crime: "Cheating — unrelated",
    status: "Closed",
    risk: 22,
    title: "Booth-line coincidence",
    summary:
      "Complaint references public booth line 1800123456, which also appears in CR-004. Coincidence, not connection.",
    entities: ["p-sreeja", "ph-1800123456", "loc-thrissur"],
  },
  {
    id: "CR-011",
    network: "NOISE",
    state: "Punjab",
    city: "Ludhiana",
    date: "2026-06-23",
    crime: "Cheating — unrelated",
    status: "Closed",
    risk: 18,
    title: "Salary-account dispute",
    summary: "Internal family transfer dispute. No overlap with either network.",
    entities: ["bk-7781", "ph-9040012345", "loc-ludhiana"],
  },
  {
    id: "CR-012",
    network: "NOISE",
    state: "West Bengal",
    city: "Kolkata",
    date: "2026-06-26",
    crime: "Cheating — unrelated",
    status: "Closed",
    risk: 15,
    title: "Deposit maturity complaint",
    summary: "Fixed-deposit maturity grievance against a private bank. Unrelated.",
    entities: ["p-arindam", "bk-5527", "loc-kolkata"],
  },
];

export const CASE_BY_ID: Record<string, CaseDef> = Object.fromEntries(
  CASES.map(c => [c.id, c]),
);

/* ============================== Graph nodes + edges ============================== */

const SOURCE_BASE: Record<SourceType, number> = {
  fir: 0.9,
  cdr: 0.85,
  financial: 0.9,
  osint: 0.72,
};

function sourceFor(caseId: string, ent: EntityDef): SourceType {
  if (ent.type === "phone") {
    if (caseId === "CR-005" && ent.id === "ph-9988776655") return "osint";
    return "cdr";
  }
  if (ent.type === "bank" || ent.type === "upi") return "financial";
  if (ent.type === "alias") return caseId === "CR-005" ? "osint" : "fir";
  return "fir";
}

/** How many distinct states share this entity (boosts confidence). */
function stateSpread(entityId: string, cases: CaseDef[]): number {
  const states = new Set(
    cases.filter(c => c.entities.includes(entityId)).map(c => c.state),
  );
  return states.size;
}

type Registry = Record<string, EntityDef>;

function buildEdges(cases: CaseDef[], registry: Registry = ENTITY_BY_ID): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const c of cases) {
    for (const eid of c.entities) {
      const ent = registry[eid];
      if (!ent) continue;
      const src = sourceFor(c.id, ent);
      const spread = stateSpread(eid, cases);
      const conf = Math.min(0.98, SOURCE_BASE[src] + Math.max(0, spread - 1) * 0.04);
      edges.push({
        id: `${c.id}::${eid}`,
        source: c.id,
        target: eid,
        date: c.date,
        caseId: c.id,
        sourceType: src,
        confidence: Number(conf.toFixed(2)),
      });
    }
  }
  return edges;
}

function buildNodes(cases: CaseDef[], registry: Registry = ENTITY_BY_ID): GraphNode[] {
  const nodes: GraphNode[] = [];
  for (const c of cases) {
    nodes.push({
      id: c.id,
      kind: "case",
      type: "case",
      label: c.id,
      sub: `${c.city}, ${c.state}`,
      network: c.network,
      date: c.date,
      caseIds: [c.id],
    });
  }
  const seen = new Map<string, GraphNode>();
  for (const c of cases) {
    for (const eid of c.entities) {
      const ent = registry[eid];
      if (!ent) continue;
      const existing = seen.get(eid);
      if (existing) {
        existing.caseIds.push(c.id);
        if (c.date < existing.date) existing.date = c.date;
        if (existing.network !== c.network && existing.network !== "NOISE" && c.network !== "NOISE") {
          existing.network = "NOISE"; // bridge entity — marked below
        }
      } else {
        seen.set(eid, {
          id: eid,
          kind: "entity",
          type: ent.type,
          label: ent.label,
          sub: ent.meta,
          network: c.network,
          date: c.date,
          caseIds: [c.id],
        });
      }
    }
  }
  // The mule account is the bridge between the two networks.
  const bridge = seen.get("bk-3310");
  if (bridge) bridge.network = "NET-A";
  nodes.push(...seen.values());
  return nodes;
}

export const NODES: GraphNode[] = buildNodes(CASES);
export const EDGES: GraphEdge[] = buildEdges(CASES);

/** Rebuild graph elements for the live (possibly extended) case list. */
export function deriveGraph(
  cases: CaseDef[],
  extra: EntityDef[] = [],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const registry: Registry = { ...ENTITY_BY_ID };
  for (const e of extra) registry[e.id] = e;
  const nodes = buildNodes(cases, registry);
  const edges = buildEdges(cases, registry);
  return { nodes, edges };
}

export const NODE_BY_ID: Record<string, GraphNode> = Object.fromEntries(
  NODES.map(n => [n.id, n]),
);

/** Bridge edge that silently links Network A to Network B. */
export const BRIDGE_EDGE_IDS = ["CR-006::bk-3310", "CR-008::bk-3310"];

/* ============================== Evidence ============================== */

const TOWERS: Record<string, string> = {
  "loc-bengaluru": "BLR-142",
  "loc-pune": "PUN-220",
  "loc-hyderabad": "HYD-088",
  "loc-visakhapatnam": "VIZ-119",
  "loc-bhubaneswar": "BBS-301",
  "loc-chennai": "MAA-017",
  "loc-delhi": "DEL-009",
  "loc-surat": "SRT-145",
  "loc-noida": "NOI-203",
  "loc-thrissur": "TCR-064",
  "loc-ludhiana": "LDH-031",
  "loc-kolkata": "CCU-118",
};

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildEvidence(cases: CaseDef[]): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  for (const c of cases) {
    const num = c.id.slice(3);
    const locId = c.entities.find(e => e.startsWith("loc-"));
    const tower = (locId && TOWERS[locId]) || "—";
    const phones = c.entities
      .filter(e => e.startsWith("ph-"))
      .map(e => ENTITY_BY_ID[e].label);
    const banks = c.entities
      .filter(e => e.startsWith("bk-") || e.startsWith("upi-"))
      .map(e => ENTITY_BY_ID[e].label);
    const alias = c.entities.includes("a-ravi") ? "alias “Ravi”" : "no alias captured";

    out.push({
      id: `EV-${num}-FIR`,
      caseId: c.id,
      type: "FIR",
      title: `FIR ${num}/2026 — ${c.city}`,
      timestamp: `${c.date}T10:24`,
      content: `FIR registered at PS Cyber Crime, ${c.city} (${c.state}) under s.366A/420 IPC. Offence: ${c.crime}. Complainant statement recorded, exhibits sealed. Narrative: ${c.summary}`,
    });
    out.push({
      id: `EV-${num}-CDR`,
      caseId: c.id,
      type: "CDR",
      title: `CDR extract — tower ${tower}`,
      timestamp: `${shiftDate(c.date, 1)}T09:05`,
      content: `CDR pulled for ${phones.length ? phones.join(", ") : "n/a"} around tower ${tower}, ${c.city}. 12 cells returned, ${c.date.slice(8, 10)}–${shiftDate(c.date, 2).slice(8, 10)} Jun 2026. SIM/IMEI grouping attached.`,
    });
    out.push({
      id: `EV-${num}-BANK`,
      caseId: c.id,
      type: "BANK",
      title: `Bank statement — ${banks.length ? banks.join(", ") : "no account linked"}`,
      timestamp: `${shiftDate(c.date, 2)}T15:40`,
      content: banks.length
        ? `Account ${banks.join(", ")} statement seized u/s 91 CrPC. Credits and withdrawals mapped against case dates; layering pattern attached as annexure-II.`
        : `No financial instrument linked to this case. Statement request not raised.`,
    });
    out.push({
      id: `EV-${num}-OSINT`,
      caseId: c.id,
      type: "OSINT",
      title: `OSINT correlation — ${alias}`,
      timestamp: `${shiftDate(c.date, 3)}T20:12`,
      content: `Open-source scrape of messaging profiles and listings for ${c.city}. Handles, display pictures and posting cadence compared against the wider set. ${alias === "no alias captured" ? "No match above threshold." : "Alias overlap above 0.86 threshold."} Confidence is corroborative, not determinative.`,
    });
  }
  return out;
}

export const EVIDENCE: EvidenceItem[] = buildEvidence(CASES);
export const EVIDENCE_BY_ID: Record<string, EvidenceItem> = Object.fromEntries(
  EVIDENCE.map(e => [e.id, e]),
);
export function evidenceForCase(caseId: string): EvidenceItem[] {
  return EVIDENCE.filter(e => e.caseId === caseId);
}

/* ============================== CDR rows (12 per network) ============================== */

export const CDR_ROWS: CdrRow[] = [
  // NET-A
  { id: "CDR-A1", network: "NET-A", caseId: "CR-001", ts: "2026-06-10T09:14", phone: "9876543210", tower: "BLR-142", city: "Bengaluru", dur: 214, dir: "out" },
  { id: "CDR-A2", network: "NET-A", caseId: "CR-001", ts: "2026-06-10T21:47", phone: "9876543210", tower: "BLR-142", city: "Bengaluru", dur: 96, dir: "in" },
  { id: "CDR-A3", network: "NET-A", caseId: "CR-002", ts: "2026-06-11T18:33", phone: "9123456780", tower: "PUN-220", city: "Pune", dur: 402, dir: "out" },
  { id: "CDR-A4", network: "NET-A", caseId: "CR-003", ts: "2026-06-13T07:52", phone: "9876543210", tower: "HYD-088", city: "Hyderabad", dur: 128, dir: "out" },
  { id: "CDR-A5", network: "NET-A", caseId: "CR-005", ts: "2026-06-14T11:20", phone: "9988776655", tower: "BBS-301", city: "Bhubaneswar", dur: 77, dir: "in" },
  { id: "CDR-A6", network: "NET-A", caseId: "CR-002", ts: "2026-06-15T13:05", phone: "9123456780", tower: "PUN-220", city: "Pune", dur: 189, dir: "in" },
  { id: "CDR-A7", network: "NET-A", caseId: "CR-004", ts: "2026-06-16T20:41", phone: "9876543210", tower: "VIZ-119", city: "Visakhapatnam", dur: 311, dir: "out" },
  { id: "CDR-A8", network: "NET-A", caseId: "CR-003", ts: "2026-06-18T10:09", phone: "9988776655", tower: "HYD-088", city: "Hyderabad", dur: 244, dir: "in" },
  { id: "CDR-A9", network: "NET-A", caseId: "CR-004", ts: "2026-06-19T16:27", phone: "9876543210", tower: "BLR-142", city: "Bengaluru", dur: 63, dir: "out" },
  { id: "CDR-A10", network: "NET-A", caseId: "CR-004", ts: "2026-06-22T08:58", phone: "9988776655", tower: "VIZ-119", city: "Visakhapatnam", dur: 151, dir: "in" },
  { id: "CDR-A11", network: "NET-A", caseId: "CR-005", ts: "2026-06-25T22:12", phone: "9988776655", tower: "BBS-301", city: "Bhubaneswar", dur: 91, dir: "out" },
  { id: "CDR-A12", network: "NET-A", caseId: "CR-006", ts: "2026-06-28T14:36", phone: "9988776655", tower: "MAA-017", city: "Chennai", dur: 377, dir: "out" },
  // NET-B
  { id: "CDR-B1", network: "NET-B", caseId: "CR-007", ts: "2026-06-09T10:22", phone: "9810000042", tower: "DEL-009", city: "Delhi", dur: 45, dir: "out" },
  { id: "CDR-B2", network: "NET-B", caseId: "CR-007", ts: "2026-06-10T19:15", phone: "9810000042", tower: "DEL-009", city: "Delhi", dur: 88, dir: "in" },
  { id: "CDR-B3", network: "NET-B", caseId: "CR-008", ts: "2026-06-11T12:44", phone: "9810000042", tower: "SRT-145", city: "Surat", dur: 133, dir: "out" },
  { id: "CDR-B4", network: "NET-B", caseId: "CR-009", ts: "2026-06-12T09:31", phone: "9810000042", tower: "NOI-203", city: "Noida", dur: 61, dir: "in" },
  { id: "CDR-B5", network: "NET-B", caseId: "CR-007", ts: "2026-06-13T21:03", phone: "9810000042", tower: "DEL-009", city: "Delhi", dur: 204, dir: "out" },
  { id: "CDR-B6", network: "NET-B", caseId: "CR-008", ts: "2026-06-14T15:19", phone: "9810000042", tower: "SRT-145", city: "Surat", dur: 72, dir: "out" },
  { id: "CDR-B7", network: "NET-B", caseId: "CR-009", ts: "2026-06-15T11:57", phone: "9810000042", tower: "NOI-203", city: "Noida", dur: 168, dir: "in" },
  { id: "CDR-B8", network: "NET-B", caseId: "CR-007", ts: "2026-06-16T18:40", phone: "9810000042", tower: "DEL-009", city: "Delhi", dur: 54, dir: "out" },
  { id: "CDR-B9", network: "NET-B", caseId: "CR-008", ts: "2026-06-17T13:26", phone: "9810000042", tower: "SRT-145", city: "Surat", dur: 297, dir: "in" },
  { id: "CDR-B10", network: "NET-B", caseId: "CR-009", ts: "2026-06-19T20:08", phone: "9810000042", tower: "NOI-203", city: "Noida", dur: 119, dir: "out" },
  { id: "CDR-B11", network: "NET-B", caseId: "CR-009", ts: "2026-06-21T09:45", phone: "9810000042", tower: "DEL-009", city: "Delhi", dur: 83, dir: "in" },
  { id: "CDR-B12", network: "NET-B", caseId: "CR-008", ts: "2026-06-24T17:52", phone: "9810000042", tower: "SRT-145", city: "Surat", dur: 142, dir: "out" },
];

/* ============================== Transactions ============================== */

export const TRANSACTIONS: Txn[] = [
  { id: "TXN-01", date: "2026-06-12", caseId: "CR-007", from: "5 complainant accounts", to: "fastcash@upi", amount: 94995, kind: "collection" },
  { id: "TXN-02", date: "2026-06-14", caseId: "CR-008", from: "18 complainant accounts", to: "fastcash@upi", amount: 110000, kind: "collection" },
  { id: "TXN-03", date: "2026-06-16", caseId: "CR-009", from: "9 complainant accounts", to: "fastcash@upi", amount: 78500, kind: "collection" },
  { id: "TXN-04", date: "2026-06-17", caseId: "CR-008", from: "fastcash@upi", to: "XXXX3310", amount: 45000, kind: "transfer" },
  { id: "TXN-05", date: "2026-06-18", caseId: "CR-003", from: "cash deposit (3 branches)", to: "XXXX8842", amount: 85000, kind: "credit" },
  { id: "TXN-06", date: "2026-06-19", caseId: "CR-009", from: "11 complainant accounts", to: "fastcash@upi", amount: 205000, kind: "collection" },
  { id: "TXN-07", date: "2026-06-22", caseId: "CR-004", from: "cash deposit", to: "XXXX8842", amount: 62000, kind: "credit" },
  { id: "TXN-08", date: "2026-06-24", caseId: "CR-008", from: "XXXX3310", to: "ATM withdrawal ×6", amount: 45000, kind: "withdrawal" },
  { id: "TXN-09", date: "2026-06-26", caseId: "CR-006", from: "XXXX8842", to: "XXXX3310", amount: 120000, kind: "transfer" },
  { id: "TXN-10", date: "2026-06-27", caseId: "CR-006", from: "unknown origin", to: "XXXX8842", amount: 120000, kind: "credit" },
  { id: "TXN-11", date: "2026-06-20", caseId: "CR-011", from: "employer", to: "XXXX7781", amount: 14200, kind: "credit" },
  { id: "TXN-12", date: "2026-06-23", caseId: "CR-012", from: "bank maturity", to: "XXXX5527", amount: 310000, kind: "credit" },
];

/* ============================== Timeline ============================== */

export function timelineForCase(caseId: string): TimelineEvent[] {
  const c = CASE_BY_ID[caseId];
  if (!c) return [];
  const ev = evidenceForCase(caseId);
  const events: TimelineEvent[] = ev.map(e => ({
    ts: e.timestamp,
    label: `${e.type} secured — ${e.title}`,
    source:
      e.type === "FIR" ? "fir" : e.type === "CDR" ? "cdr" : e.type === "BANK" ? "financial" : "osint",
  }));
  if (["CR-004", "CR-006"].includes(caseId)) {
    events.push({
      ts: `${shiftDate(c.date, 4)}T11:00`,
      label: "Cross-state link added to live graph",
      source: "osint",
    });
  }
  events.sort((a, b) => a.ts.localeCompare(b.ts));
  return events;
}

/** The full network timeline: one row per case in date order. */
export function networkTimeline(cases: CaseDef[] = CASES): { date: string; caseId: string; state: string; network: NetworkId }[] {
  return [...cases]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(c => ({ date: c.date, caseId: c.id, state: c.state, network: c.network }));
}

/* ============================== Kill chain ============================== */

export interface KillTechnique {
  id: string;
  name: string;
  networks: NetworkId[];
  evidence: string[];
  note?: string;
  gap?: boolean;
}

export interface KillStage {
  stage: string;
  techniques: KillTechnique[];
}

export const KILL_CHAIN: KillStage[] = [
  {
    stage: "Recruitment",
    techniques: [
      { id: "K01", name: "Social-media luring", networks: ["NET-A"], evidence: ["EV-001-OSINT", "EV-002-OSINT"] },
      { id: "K02", name: "Fake job advertisements", networks: ["NET-B"], evidence: ["EV-007-FIR", "EV-009-OSINT"] },
      { id: "K03", name: "Advance-fee deposits", networks: ["NET-B"], evidence: ["EV-007-BANK"], note: "₹2,999–₹9,999 first bite" },
    ],
  },
  {
    stage: "Transport",
    techniques: [
      { id: "K04", name: "Inter-state movement", networks: ["NET-A"], evidence: ["EV-001-CDR", "EV-004-CDR"] },
      { id: "K05", name: "Ticket booked by third party", networks: ["NET-A"], evidence: [], gap: true, note: "No ticketing record seized yet — ghost lead GHOST-1" },
    ],
  },
  {
    stage: "Control",
    techniques: [
      { id: "K06", name: "Phone seized from victim", networks: ["NET-A"], evidence: ["EV-004-CDR"] },
      { id: "K07", name: "Threat scripts on victims", networks: ["NET-A"], evidence: ["EV-002-OSINT"] },
      { id: "K08", name: "Revocation threats on borrowers", networks: ["NET-B"], evidence: ["EV-008-FIR"] },
    ],
  },
  {
    stage: "Exploitation",
    techniques: [
      { id: "K09", name: "Forced labour placement", networks: ["NET-A"], evidence: ["EV-001-FIR", "EV-003-FIR"] },
      { id: "K10", name: "Placement broker network", networks: ["NET-A"], evidence: [], gap: true, note: "Receivers unidentified — ghost lead GHOST-3" },
    ],
  },
  {
    stage: "Financial Laundering",
    techniques: [
      { id: "K11", name: "Mule account layering", networks: ["NET-A", "NET-B"], evidence: ["EV-006-BANK", "EV-008-BANK"], note: "XXXX3310 is the hinge" },
      { id: "K12", name: "UPI wallet pooling", networks: ["NET-B"], evidence: ["EV-007-BANK", "EV-009-BANK"] },
      { id: "K13", name: "Cash withdrawal chain", networks: ["NET-A"], evidence: ["EV-003-BANK"] },
    ],
  },
  {
    stage: "Evasion",
    techniques: [
      { id: "K14", name: "Burner SIM rotation", networks: ["NET-A"], evidence: ["EV-005-OSINT"] },
      { id: "K15", name: "Alias rotation (“Ravi”)", networks: ["NET-A"], evidence: ["EV-001-FIR", "EV-005-OSINT"] },
      { id: "K16", name: "Spoofed caller ID", networks: ["NET-B"], evidence: ["EV-007-FIR"] },
      { id: "K17", name: "Public booth phone reuse", networks: ["NOISE"], evidence: ["EV-010-CDR"], note: "False positive — 1800123456 is a shared booth" },
    ],
  },
];

/* ============================== Ghost-node seeds ============================== */

export interface GhostSeed {
  id: string;
  title: string;
  kind: string;
  confidence: number;
  between: [string, string];
  reason: string;
  lead: {
    request: string;
    window: string;
    payoff: string;
  };
  predictedPlace?: string;
}

export const GHOST_SEEDS: GhostSeed[] = [
  {
    id: "GHOST-1",
    title: "Unknown handler phone",
    kind: "Structural hole",
    confidence: 78,
    between: ["p-ravi", "ph-9988776655"],
    reason:
      "Ravi and the Odisha cluster share no direct edge, yet their neighbourhoods overlap on 3 of 4 observed days with the same 3–4 day cadence.",
    lead: {
      request: "CDR for tower BLR-142, 9–11 Jun",
      window: "09 Jun – 11 Jun 2026",
      payoff: "Would place the handler in Bengaluru before CR-001 was filed",
    },
  },
  {
    id: "GHOST-2",
    title: "Probable mule layer",
    kind: "Bridge hypothesis",
    confidence: 84,
    between: ["bk-8842", "bk-3310"],
    reason:
      "Two accounts exchange ₹1.2L within 48h while sitting in two differently-styled networks. Networks A and B may be one operation.",
    lead: {
      request: "Statement for XXXX3310 from 20–30 Jun",
      window: "20 Jun – 30 Jun 2026",
      payoff: "Would confirm merge of NET-A and NET-B",
    },
  },
  {
    id: "GHOST-3",
    title: "Burner SIM rotation",
    kind: "Temporal prediction",
    confidence: 66,
    between: ["ph-9988776655", "ph-9810000042"],
    reason:
      "SIM rotation keeps a near-constant 3–4 day cadence across both networks. Next appearance predicted in Karnataka/Goa corridor.",
    lead: {
      request: "Tower dump — Bengaluru & Goa corridor, 01–04 Jul",
      window: "01 Jul – 04 Jul 2026",
      payoff: "Would catch the next rotation before a new FIR is written",
    },
    predictedPlace: "Karnataka / Goa",
  },
];

/* ============================== India dot-map geometry ============================== */

/** Rough subcontinent outline in [lng, lat]. Good enough for a stylised dot map. */
export const INDIA_OUTLINE: [number, number][] = [
  [68.2, 23.9], [69.0, 22.5], [70.0, 21.0], [71.0, 20.8], [72.0, 21.2], [72.7, 21.4],
  [72.6, 20.0], [72.8, 19.0], [73.0, 17.5], [73.4, 16.0], [73.8, 15.0], [74.3, 13.5],
  [74.8, 12.5], [75.5, 11.5], [76.2, 10.0], [77.0, 8.2], [78.0, 8.7], [79.0, 9.3],
  [79.8, 10.8], [79.9, 12.5], [80.3, 13.5], [80.3, 15.0], [81.2, 16.2], [82.3, 17.0],
  [83.3, 17.8], [84.5, 19.2], [85.5, 19.8], [86.5, 20.3], [87.5, 21.6], [88.5, 21.8],
  [88.9, 22.9], [89.0, 24.0], [88.7, 25.3], [89.5, 26.0], [90.5, 26.5], [92.0, 27.0],
  [94.0, 28.5], [96.0, 29.3], [97.4, 28.0], [96.5, 26.5], [95.0, 25.5], [94.0, 24.0],
  [93.3, 23.0], [92.6, 22.1], [92.3, 23.5], [92.0, 25.0], [91.2, 25.5], [89.5, 26.3],
  [88.2, 26.5], [87.5, 27.0], [86.0, 27.5], [84.5, 27.5], [82.5, 27.9], [81.0, 28.9],
  [80.0, 30.0], [78.5, 31.0], [79.0, 32.5], [78.0, 34.0], [76.5, 35.5], [74.5, 35.0],
  [73.9, 34.0], [74.0, 32.5], [74.6, 31.0], [73.9, 29.9], [73.0, 28.6], [72.3, 27.4],
  [71.0, 26.6], [70.6, 25.7], [70.3, 24.5], [69.0, 24.3],
];

export const SRI_LANKA: [number, number][] = [
  [80.0, 9.5], [80.9, 9.8], [81.9, 8.5], [81.7, 7.0], [81.0, 6.0], [80.2, 6.5], [79.8, 8.3],
];

export interface MapMarker {
  state: string;
  city: string;
  lng: number;
  lat: number;
  caseIds: string[];
  network: NetworkId;
}

export const MAP_MARKERS: MapMarker[] = [
  { state: "Karnataka", city: "Bengaluru", lng: 77.59, lat: 12.97, caseIds: ["CR-001"], network: "NET-A" },
  { state: "Maharashtra", city: "Pune", lng: 73.85, lat: 18.52, caseIds: ["CR-002"], network: "NET-A" },
  { state: "Telangana", city: "Hyderabad", lng: 78.48, lat: 17.38, caseIds: ["CR-003"], network: "NET-A" },
  { state: "Andhra Pradesh", city: "Visakhapatnam", lng: 83.3, lat: 17.69, caseIds: ["CR-004"], network: "NET-A" },
  { state: "Odisha", city: "Bhubaneswar", lng: 85.82, lat: 20.3, caseIds: ["CR-005"], network: "NET-A" },
  { state: "Tamil Nadu", city: "Chennai", lng: 80.27, lat: 13.08, caseIds: ["CR-006"], network: "NET-A" },
  { state: "Delhi", city: "Delhi", lng: 77.21, lat: 28.61, caseIds: ["CR-007"], network: "NET-B" },
  { state: "Gujarat", city: "Surat", lng: 72.83, lat: 21.17, caseIds: ["CR-008"], network: "NET-B" },
  { state: "Uttar Pradesh", city: "Noida", lng: 77.39, lat: 28.54, caseIds: ["CR-009"], network: "NET-B" },
  { state: "Kerala", city: "Thrissur", lng: 76.21, lat: 10.53, caseIds: ["CR-010"], network: "NOISE" },
  { state: "Punjab", city: "Ludhiana", lng: 75.86, lat: 30.9, caseIds: ["CR-011"], network: "NOISE" },
  { state: "West Bengal", city: "Kolkata", lng: 88.36, lat: 22.57, caseIds: ["CR-012"], network: "NOISE" },
];

/* ============================== Helpers ============================== */

export const DAY = 86_400_000;
export const TIMELINE_START = "2026-06-10";
export const TIMELINE_END = "2026-06-28";

export function parseDate(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${String(d.getUTCDate()).padStart(2, "0")} ${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}

export function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return `${String(d.getUTCDate()).padStart(2, "0")} Jun`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b) - parseDate(a)) / DAY);
}

export function casesByNetwork(net: NetworkId, cases: CaseDef[] = CASES): CaseDef[] {
  return cases.filter(c => c.network === net);
}

export function getCase(id: string, cases: CaseDef[] = CASES): CaseDef | undefined {
  return cases.find(c => c.id === id);
}

export function caseIdsForEntity(entityId: string, cases: CaseDef[] = CASES): string[] {
  return cases.filter(c => c.entities.includes(entityId)).map(c => c.id);
}

/** Entities shared by more than one of the given cases. */
export function sharedEntities(caseIds: string[], cases: CaseDef[] = CASES): { id: string; count: number; cases: string[] }[] {
  const picked = cases.filter(c => caseIds.includes(c.id));
  const counts = new Map<string, string[]>();
  for (const c of picked) {
    for (const e of c.entities) counts.set(e, [...(counts.get(e) ?? []), c.id]);
  }
  return [...counts.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([id, ids]) => ({ id, count: ids.length, cases: ids }))
    .sort((a, b) => b.count - a.count);
}

/** Entity ids that appear in cases from more than one state. */
export function crossStateEntities(cases: CaseDef[] = CASES): string[] {
  const map = new Map<string, Set<string>>();
  for (const c of cases) {
    for (const e of c.entities) {
      if (!map.has(e)) map.set(e, new Set());
      map.get(e)!.add(c.state);
    }
  }
  return [...map.entries()].filter(([, states]) => states.size > 1).map(([id]) => id);
}

/** Cases that already carry the given phone number. */
export function casesWithPhone(phone: string, cases: CaseDef[] = CASES): string[] {
  const ent = ENTITIES.find(e => e.type === "phone" && e.label === phone);
  if (ent) return cases.filter(c => c.entities.includes(ent.id)).map(c => c.id);
  return cases.filter(c =>
    c.summary.includes(phone) || c.entities.some(id => ENTITY_BY_ID[id]?.label === phone),
  ).map(c => c.id);
}

export function kpis(cases: CaseDef[] = CASES) {
  const entities = new Set(cases.flatMap(c => c.entities));
  const states = new Set(cases.map(c => c.state));
  return {
    cases: cases.length,
    entities: entities.size,
    crossStateLinks: crossStateEntities(cases).length,
    activeNetworks: new Set(cases.filter(c => c.network !== "NOISE").map(c => c.network)).size,
    states: states.size,
  };
}

export function riskOfNetwork(net: NetworkId): number {
  return NETWORKS.find(n => n.id === net)?.risk ?? 0;
}

export function statesOfNetwork(net: NetworkId, cases: CaseDef[] = CASES): string[] {
  return [...new Set(casesByNetwork(net, cases).map(c => c.state))];
}

export function entityLabel(id: string): string {
  return ENTITY_BY_ID[id]?.label ?? NODE_BY_ID[id]?.label ?? id;
}

export function entityTypeOf(id: string): EntityType {
  return NODE_BY_ID[id]?.type ?? "person";
}

export const CURRENCY = (n: number) =>
  `₹${n.toLocaleString("en-IN")}`;
