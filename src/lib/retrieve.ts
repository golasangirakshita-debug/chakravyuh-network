/**
 * RETRIEVAL FOR THE INVESTIGATION ASSISTANT
 * =========================================
 * The assistant is only as trustworthy as what it is allowed to see. This
 * module turns a question into a bounded set of records pulled from the graph,
 * the case corpus, CDR rows, transactions and the approved extraction table.
 *
 * Nothing here is generated. If a question matches no record, `resolve` returns
 * an empty list — and the assistant is built to refuse in that case rather than
 * reason from nothing.
 */

import {
  CASE_BY_ID,
  CDR_ROWS,
  EDGES,
  EVIDENCE,
  NODES,
  TRANSACTIONS,
  type GraphNode,
} from "@/lib/data";
import type { GnnResult } from "@/lib/gnn";

export interface RetrievedRow {
  id: string;
  kind: string;
  label: string;
  detail: string;
}

export type Intent =
  | "multi-case-entity"
  | "phone-cases"
  | "financial"
  | "connection"
  | "gnn-explanation"
  | "case-lookup"
  | "general";

export interface Retrieval {
  intent: Intent;
  rows: RetrievedRow[];
  /** Human-readable explanation of what was searched. */
  scope: string;
}

const PHONE_RE = /\b([6-9]\d{9})\b/;
const CASE_RE = /\b(CR-\d{3})\b/gi;

export function resolve(
  question: string,
  opts: { gnn?: GnnResult; approved?: { value: string; entityType: string; sourceId: string }[] } = {},
): Retrieval {
  const q = question.toLowerCase();
  const rows: RetrievedRow[] = [];

  const mentionedCases = Array.from(new Set((question.match(CASE_RE) ?? []).map(s => s.toUpperCase())));
  const phone = question.match(PHONE_RE)?.[1];

  /* ---------------- 1. which entities appear in multiple FIRs ---------------- */
  if (/(multiple|more than one|several|across).{0,24}(fir|case)|which entities|linking (the )?cases/i.test(q)) {
    const multi = NODES.filter(n => n.kind === "entity" && n.caseIds.length > 1)
      .sort((a, b) => b.caseIds.length - a.caseIds.length)
      .slice(0, 12);
    for (const n of multi) {
      rows.push({
        id: n.id,
        kind: n.type,
        label: n.label,
        detail: `appears in ${n.caseIds.length} FIRs: ${n.caseIds.join(", ")}`,
      });
    }
    return {
      intent: "multi-case-entity",
      rows,
      scope: `Searched all ${NODES.length} graph nodes for entities referenced by more than one FIR.`,
    };
  }

  /* ---------------- 2. strongest connection between two things ---------------- */
  // This must be decided before the phone branch: "strongest connection between
  // X and 9876543210" is a question about a relationship, and an earlier
  // ordering answered it as a plain phone lookup and dropped the comparison.
  const moneyQuestion = /\b(financial|money|transfer|payment|amount|fund|launder|bank)\b/i.test(q);
  if (!moneyQuestion && (/\bbetween\b/i.test(q) || findNamedEntities(question).length >= 2)) {
    const named = findNamedEntities(question);
    if (named.length >= 2) {
      rows.push(...pathBetween(named[0], named[1]));
      if (rows.length) {
        return {
          intent: "connection",
          rows,
          scope: `Computed the shortest recorded path between ${named[0].label} and ${named[1].label} across ${EDGES.length} edges.`,
        };
      }
    }
    const strong = [...EDGES].sort((a, b) => b.confidence - a.confidence).slice(0, 6);
    for (const e of strong) {
      const a = NODES.find(n => n.id === e.source);
      const b = NODES.find(n => n.id === e.target);
      if (!a || !b) continue;
      rows.push({
        id: e.id,
        kind: "edge",
        label: `${a.label} ↔ ${b.label}`,
        detail: `${e.sourceType} evidence, confidence ${e.confidence.toFixed(2)}, case ${e.caseId}, ${e.date}`,
      });
    }
    if (rows.length) {
      return {
        intent: "connection",
        rows,
        scope:
          named.length >= 2
            ? `No recorded path between ${named[0].label} and ${named[1].label}; returned the strongest recorded relationships instead.`
            : "Returned the highest-confidence recorded relationships in the corpus.",
      };
    }
  }

  /* ---------------- 3. all cases connected to a phone number ---------------- */
  if (phone) {
    const node = NODES.find(n => n.type === "phone" && n.label.replace(/\D/g, "").endsWith(phone));
    if (node) {
      rows.push({
        id: node.id,
        kind: "phone",
        label: node.label,
        detail: `declared ${node.network}, first observed ${node.date}`,
      });
      for (const cid of node.caseIds) {
        const c = CASE_BY_ID[cid];
        if (!c) continue;
        rows.push({
          id: c.id,
          kind: "case",
          label: `${c.id} — ${c.title}`,
          detail: `${c.crime}, ${c.city} (${c.state}), ${c.date}, risk ${c.risk}, status ${c.status}`,
        });
      }
      const calls = CDR_ROWS.filter(r => r.phone === node.label);
      for (const call of calls.slice(0, 10)) {
        rows.push({
          id: call.id,
          kind: "cdr",
          label: `${call.phone} → tower ${call.tower}`,
          detail: `${call.ts} in ${call.city}, ${call.dur}s, ${call.dir}, case ${call.caseId}`,
        });
      }
    }
    if (rows.length) {
      return {
        intent: "phone-cases",
        rows,
        scope: `Matched phone ${phone} to a graph node, its FIRs, and ${rows.filter(r => r.kind === "cdr").length} call records.`,
      };
    }
  }

  /* ---------------- 4. financial relationships between cases ---------------- */
  if (/(financial|money|transfer|payment|amount|fund|launder|bank)/i.test(q)) {
    const scope = mentionedCases.length
      ? TRANSACTIONS.filter(t => mentionedCases.includes(t.caseId))
      : TRANSACTIONS;
    for (const t of scope.slice(0, 12)) {
      rows.push({
        id: t.id,
        kind: "transaction",
        label: `₹${t.amount.toLocaleString("en-IN")} · ${t.from} → ${t.to}`,
        detail: `${t.kind} on ${t.date}, case ${t.caseId}`,
      });
    }
    const accounts = NODES.filter(n => n.type === "bank" || n.type === "upi");
    for (const a of accounts) {
      const inbound = TRANSACTIONS.filter(t => t.to.includes(a.label) || t.to === a.label);
      const outbound = TRANSACTIONS.filter(t => t.from.includes(a.label) || t.from === a.label);
      if (!inbound.length && !outbound.length) continue;
      rows.push({
        id: a.id,
        kind: a.type,
        label: a.label,
        detail: `${inbound.length} inbound and ${outbound.length} outbound entries; ${a.caseIds.length} FIRs`,
      });
    }
    if (rows.length) {
      return {
        intent: "financial",
        rows,
        scope: mentionedCases.length
          ? `Filtered the transaction ledger to ${mentionedCases.join(", ")}.`
          : "Read the full transaction ledger and matched it to graph accounts.",
      };
    }
  }

  /* ---------------- 5. why the GNN flagged something ---------------- */
  if (/(why|explain).{0,30}(gnn|model|flag|flagging|neural|predict)|gnn.{0,20}(flag|explain)/i.test(q)) {
    rows.push({
      id: "model",
      kind: "model",
      label: `GCN(${opts.gnn?.dims.features ?? 16}→${opts.gnn?.dims.hidden ?? 16}→${opts.gnn?.dims.outputs ?? 2})`,
      detail: opts.gnn
        ? `${opts.gnn.dims.params + opts.gnn.linkParams} parameters, pooled held-out AUC ${fmt(opts.gnn.auc[0])}, trained in ${opts.gnn.trainMs.toFixed(0)} ms on ${opts.gnn.dims.nodes} nodes`
        : "model not available in this session",
    });
    if (opts.gnn) {
      const top = [...opts.gnn.embeddings].sort((a, b) => b.probs[0] - a.probs[0]).slice(0, 6);
      for (const e of top) {
        rows.push({
          id: e.id,
          kind: "entity",
          label: e.label,
          detail: `escalation ${(e.probs[0] * 100).toFixed(0)}%, reuse ${(e.probs[1] * 100).toFixed(0)}%, type ${e.type}, network ${e.network}, ${e.caseIds.length} FIRs`,
        });
      }
    }
    return {
      intent: "gnn-explanation",
      rows,
      scope:
        "Read the model card and the highest escalation probabilities. These are ranked signals for review, not findings of guilt.",
    };
  }

  /* ---------------- 6. specific FIR lookup ---------------- */
  if (mentionedCases.length) {
    for (const cid of mentionedCases) {
      const c = CASE_BY_ID[cid];
      if (!c) continue;
      rows.push({
        id: c.id,
        kind: "case",
        label: `${c.id} — ${c.title}`,
        detail: `${c.crime}, ${c.city} (${c.state}), ${c.date}, risk ${c.risk}, status ${c.status}`,
      });
      for (const eid of c.entities) {
        const n = NODES.find(x => x.id === eid);
        if (n) rows.push({ id: n.id, kind: n.type, label: n.label, detail: `entity in ${c.id}` });
      }
      for (const ev of EVIDENCE.filter(e => e.caseId === c.id)) {
        rows.push({ id: ev.id, kind: ev.type.toLowerCase(), label: ev.title, detail: `${ev.timestamp}` });
      }
    }
  }

  /* ---------------- 7. general named-entity search ---------------- */
  const named = findNamedEntities(question);
  for (const n of named.slice(0, 6)) {
    rows.push({
      id: n.id,
      kind: n.type,
      label: n.label,
      detail: `${n.type} in ${n.caseIds.length} FIR(s): ${n.caseIds.join(", ")}`,
    });
    for (const cid of n.caseIds.slice(0, 3)) {
      const c = CASE_BY_ID[cid];
      if (c) {
        rows.push({
          id: c.id,
          kind: "case",
          label: `${c.id} — ${c.title}`,
          detail: `${c.crime}, ${c.city}, risk ${c.risk}`,
        });
      }
    }
  }

  // Approved extractions from Module 2 can also match by value.
  for (const a of opts.approved ?? []) {
    if (a.value.length > 2 && q.includes(a.value.toLowerCase())) {
      rows.push({
        id: `ext-${a.value}`,
        kind: a.entityType,
        label: a.value,
        detail: "approved extraction from intelligence collection; not yet linked to a recorded case",
      });
    }
  }

  if (rows.length) {
    return { intent: "general", rows, scope: `Matched ${rows.length} records by name and value.` };
  }

  return {
    intent: "general",
    rows: [],
    scope: "No case, entity, call or transfer in the corpus matched this question.",
  };
}

/* ------------------------------------------------------------------ */

function fmt(n: number): string {
  return Number.isNaN(n) ? "n/a" : n.toFixed(3);
}

/** Match a question against entity labels, longest label first. */
function findNamedEntities(question: string): GraphNode[] {
  const q = question.toLowerCase();
  const pool = NODES.filter(n => n.kind === "entity")
    .sort((a, b) => b.label.length - a.label.length);
  const hits: GraphNode[] = [];
  const claimed: [number, number][] = [];
  for (const n of pool) {
    const needle = n.label.toLowerCase();
    if (needle.length < 3) continue;
    let from = 0;
    while (true) {
      const at = q.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      const overlaps = claimed.some(([s, e]) => at < e && end > s);
      if (!overlaps) {
        claimed.push([at, end]);
        if (!hits.some(h => h.id === n.id)) hits.push(n);
        break;
      }
      from = at + 1;
    }
  }
  return hits;
}

/** Breadth-first shortest path over recorded edges only. */
function pathBetween(a: GraphNode, b: GraphNode): RetrievedRow[] {
  const adj = new Map<string, { to: string; edge: string }[]>();
  for (const e of EDGES) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push({ to: e.target, edge: e.id });
    adj.get(e.target)!.push({ to: e.source, edge: e.id });
  }
  const prev = new Map<string, { from: string; edge: string }>();
  const seen = new Set([a.id]);
  const queue = [a.id];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === b.id) break;
    for (const next of adj.get(cur) ?? []) {
      if (seen.has(next.to)) continue;
      seen.add(next.to);
      prev.set(next.to, { from: cur, edge: next.edge });
      queue.push(next.to);
    }
  }
  if (!prev.has(b.id)) return [];

  const chain: string[] = [];
  let cur = b.id;
  while (cur !== a.id) {
    const step = prev.get(cur);
    if (!step) break;
    chain.unshift(step.edge);
    cur = step.from;
  }
  const out: RetrievedRow[] = [];
  for (const edgeId of chain) {
    const e = EDGES.find(x => x.id === edgeId);
    if (!e) continue;
    const from = NODES.find(n => n.id === e.source);
    const to = NODES.find(n => n.id === e.target);
    out.push({
      id: e.id,
      kind: "edge",
      label: `${from?.label ?? e.source} ↔ ${to?.label ?? e.target}`,
      detail: `${e.sourceType} evidence, confidence ${e.confidence.toFixed(2)}, case ${e.caseId}, ${e.date}`,
    });
  }
  return out;
}

/** Prompt suggestions shown in the assistant UI. */
export const SUGGESTED_QUESTIONS = [
  "Which entities appear in multiple FIRs?",
  "Show all cases connected to 9876543210",
  "Identify financial relationships between these cases",
  "What is the strongest connection between alias Ravi and Aman Verma?",
  "Explain why the GNN flagged this network",
  "Summarise CR-006",
] as const;

