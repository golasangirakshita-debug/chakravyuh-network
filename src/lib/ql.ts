/**
 * VYUH-QL — a small Splunk-flavoured query language over the synthetic data.
 *
 *   index=cdr phone=9876543210 | stats count by case_id | sort -count
 *
 * Supported: index=, field=value filters, free-text terms,
 * | stats count [by <field>], | sort [-]field, | head N, | fields a,b, | graph
 */

import {
  CDR_ROWS,
  CASES,
  EVIDENCE,
  TRANSACTIONS,
  type CaseDef,
} from "./data";

export interface AuditLine {
  ts: string;
  actor: string;
  action: string;
  result: string;
}

export interface QlEvent {
  [k: string]: string | number | undefined;
  _index: string;
  _time: string;
}

export const INDEX_NAMES = ["fir", "cdr", "financial", "osint", "audit"] as const;

/* ============================== Event building ============================== */

export function buildEvents(cases: CaseDef[], audit: AuditLine[] = []): QlEvent[] {
  const events: QlEvent[] = [];

  for (const c of cases) {
    events.push({
      _index: "fir",
      _time: `${c.date}T10:24`,
      case_id: c.id,
      state: c.state,
      city: c.city,
      crime: c.crime,
      network: c.network,
      status: c.status,
      risk: c.risk,
      summary: c.summary,
    });
  }

  for (const r of CDR_ROWS) {
    events.push({
      _index: "cdr",
      _time: r.ts,
      case_id: r.caseId,
      network: r.network,
      phone: r.phone,
      tower: r.tower,
      city: r.city,
      dur: r.dur,
      dir: r.dir,
    });
  }

  for (const t of TRANSACTIONS) {
    events.push({
      _index: "financial",
      _time: `${t.date}T12:00`,
      case_id: t.caseId,
      from: t.from,
      to: t.to,
      amount: t.amount,
      kind: t.kind,
      txn_id: t.id,
    });
  }

  for (const e of EVIDENCE) {
    if (e.type !== "OSINT") continue;
    const c = cases.find(x => x.id === e.caseId);
    events.push({
      _index: "osint",
      _time: e.timestamp,
      case_id: e.caseId,
      network: c?.network ?? "NOISE",
      handle: c?.entities.includes("a-ravi") ? "ravi.handler.profiles" : "unknown",
      alias: c?.entities.includes("a-ravi") ? "Ravi" : "none",
      confidence: c?.entities.includes("a-ravi") ? 0.86 : 0.31,
      source: e.title,
    });
  }

  for (const a of audit) {
    events.push({
      _index: "audit",
      _time: a.ts,
      actor: a.actor,
      action: a.action,
      result: a.result,
    });
  }

  events.sort((x, y) => y._time.localeCompare(x._time));
  return events;
}

/* ============================== Parser ============================== */

type Op =
  | { type: "stats"; by?: string }
  | { type: "sort"; field: string; desc: boolean }
  | { type: "head"; n: number }
  | { type: "fields"; list: string[] }
  | { type: "graph" };

export interface QlOk {
  ok: true;
  events: QlEvent[];
  rows: Record<string, string | number | undefined>[];
  columns: string[];
  took: string;
  matched: number;
  graph: boolean;
  command: string;
}

export interface QlErr {
  ok: false;
  error: string;
}

export type QlResult = QlOk | QlErr;

const COLUMN_PREF = [
  "_index", "_time", "case_id", "network", "state", "city", "phone", "tower",
  "account", "to", "from", "amount", "actor", "action", "result", "crime",
  "risk", "dur", "dir", "alias", "confidence",
];

function tokenize(stage: string): string[] {
  return stage.match(/"[^"]*"|\S+/g) ?? [];
}

export function runQuery(query: string, events: QlEvent[]): QlResult {
  const started = performance.now();
  const raw = query.trim();
  if (!raw) return { ok: false, error: "Empty query. Try: index=cdr | stats count by case_id" };

  const stages = raw.split("|").map(s => s.trim()).filter(Boolean);
  if (!stages.length) return { ok: false, error: "Nothing to run." };

  // ---- head stage ----
  const head = tokenize(stages[0]);
  let index: string | undefined;
  const filters: [string, string][] = [];
  const terms: string[] = [];

  for (const tok of head) {
    const eq = tok.indexOf("=");
    if (eq > 0) {
      const key = tok.slice(0, eq).toLowerCase();
      let val = tok.slice(eq + 1).replace(/^"|"$/g, "");
      if (key === "index") index = val.toLowerCase();
      else filters.push([key, val]);
    } else {
      terms.push(tok.toLowerCase());
    }
  }

  const ops: Op[] = [];
  for (const stage of stages.slice(1)) {
    const low = stage.toLowerCase();
    if (low.startsWith("stats")) {
      const m = /count\s+by\s+([\w.]+)/i.exec(stage);
      if (m) ops.push({ type: "stats", by: m[1] });
      else if (/count/i.test(stage)) ops.push({ type: "stats" });
      else return { ok: false, error: `Unsupported stats expression: “${stage}”. Try: stats count by <field>` };
    } else if (low.startsWith("sort")) {
      const arg = stage.slice(4).trim();
      if (!arg) return { ok: false, error: "sort needs a field, e.g. | sort -count" };
      const desc = arg.startsWith("-");
      ops.push({ type: "sort", field: desc ? arg.slice(1) : arg, desc });
    } else if (low.startsWith("head")) {
      const n = parseInt(stage.slice(4).trim(), 10);
      if (Number.isNaN(n)) return { ok: false, error: "head needs a number, e.g. | head 20" };
      ops.push({ type: "head", n });
    } else if (low.startsWith("fields")) {
      ops.push({ type: "fields", list: stage.slice(6).split(",").map(s => s.trim()).filter(Boolean) });
    } else if (low === "graph") {
      ops.push({ type: "graph" });
    } else {
      return { ok: false, error: `Unknown command “${stage}”. Supported: stats, sort, head, fields, graph` };
    }
  }

  // ---- filtering ----
  let matched = events.filter(e => {
    if (index && e._index !== index) return false;
    for (const [k, v] of filters) {
      const val = e[k];
      if (val === undefined) return false;
      if (String(val).toLowerCase() !== v.toLowerCase()) return false;
    }
    if (terms.length) {
      const bag = Object.values(e).join(" ").toLowerCase();
      if (!terms.every(t => bag.includes(t))) return false;
    }
    return true;
  });

  const graph = ops.some(o => o.type === "graph");
  let rows: Record<string, string | number | undefined>[];
  let columns: string[];

  const statsOp = ops.find(o => o.type === "stats") as { type: "stats"; by?: string } | undefined;

  if (statsOp) {
    const by = statsOp.by ?? "_index";
    const counts = new Map<string, number>();
    for (const e of matched) {
      const key = String(e[by] ?? "(empty)");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    rows = [...counts.entries()].map(([k, v]) => ({ [by]: k, count: v }));
    columns = [by, "count"];
  } else {
    rows = matched.map(e => ({ ...e }));
    const present = COLUMN_PREF.filter(c => matched.some(e => e[c] !== undefined));
    const extra = matched.length
      ? Object.keys(matched[0]).filter(k => !present.includes(k) && !k.startsWith("_raw"))
      : [];
    columns = [...present, ...extra].slice(0, 9);
  }

  const sortOp = ops.find(o => o.type === "sort") as { type: "sort"; field: string; desc: boolean } | undefined;
  if (sortOp) {
    const { field, desc } = sortOp;
    rows = [...rows].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (av === bv) return 0;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return desc ? -cmp : cmp;
    });
  }

  const headOp = ops.find(o => o.type === "head") as { type: "head"; n: number } | undefined;
  if (headOp) rows = rows.slice(0, headOp.n);

  const fieldsOp = ops.find(o => o.type === "fields") as { type: "fields"; list: string[] } | undefined;
  if (fieldsOp) columns = fieldsOp.list.filter(f => rows.some(r => r[f] !== undefined));

  const tookMs = performance.now() - started;
  const took = `${(0.011 + matched.length * 0.0007 + tookMs / 4000).toFixed(2)}s`;

  return {
    ok: true,
    events: matched,
    rows,
    columns,
    took,
    matched: matched.length,
    graph,
    command: raw,
  };
}

/* ============================== Helpers for the UI ============================== */

export const SAVED_SEARCHES: { label: string; query: string }[] = [
  { label: "Shared phones across states", query: "index=cdr | stats count by phone | sort -count" },
  { label: "Accounts in 2+ cases", query: "index=financial | stats count by to | sort -count" },
  { label: "Same alias, different states", query: "index=osint alias=Ravi | stats count by case_id | sort case_id" },
  { label: "Failed logins", query: "index=audit action=login | stats count by result" },
  { label: "Integrity violations", query: "index=audit result=ALERT | head 20" },
];

export function eventsPerDay(events: QlEvent[]): { day: string; count: number }[] {
  const map = new Map<string, number>();
  for (const e of events) {
    const day = e._time.slice(5, 10);
    map.set(day, (map.get(day) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, count]) => ({
      day: `${day.slice(3, 5)}/${day.slice(0, 2)}`,
      count,
    }));
}

export function interestingFields(events: QlEvent[], fields: string[]) {
  return fields
    .map(field => {
      const counts = new Map<string, number>();
      for (const e of events) {
        const v = e[field];
        if (v === undefined) continue;
        counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
      }
      const values = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));
      return { field, values, total: counts.size };
    })
    .filter(f => f.values.length > 0);
}
