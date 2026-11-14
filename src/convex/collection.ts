import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { sha256Sync } from "../lib/sha256";
import { mutation, query } from "./_generated/server";

/* ------------------------------------------------------------------ *
 * Module 1 — Intelligence Collection
 * ------------------------------------------------------------------ */

const sourceKind = v.union(
  v.literal("fir"),
  v.literal("cdr"),
  v.literal("financial"),
  v.literal("osint"),
);

/**
 * Record an ingested artefact and the entities extracted from it in one
 * transaction, so a source is never visible without its rows (or vice versa).
 *
 * The client does the parsing because the file never leaves the browser unless
 * it is sent here — we store the derived text and entities, not the original
 * binary, and say so in the UI.
 */
export const ingestSource = mutation({
  args: {
    name: v.string(),
    kind: sourceKind,
    bytes: v.number(),
    rows: v.number(),
    characters: v.number(),
    note: v.string(),
    digest: v.string(),
    error: v.optional(v.string()),
    entities: v.array(
      v.object({
        entityType: v.union(
          v.literal("person"),
          v.literal("phone"),
          v.literal("location"),
          v.literal("bank"),
          v.literal("upi"),
          v.literal("alias"),
        ),
        value: v.string(),
        normalized: v.string(),
        confidence: v.number(),
        evidence: v.string(),
        method: v.string(),
        duplicateOf: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const now = Date.now();

    const sourceId = await ctx.db.insert("sources", {
      ownerId: userId ?? undefined,
      name: args.name,
      kind: args.kind,
      status: args.error ? "failed" : "extracted",
      bytes: args.bytes,
      rows: args.rows,
      characters: args.characters,
      note: args.note,
      error: args.error,
      digest: args.digest,
      createdAt: now,
    });

    for (const e of args.entities) {
      await ctx.db.insert("extractions", {
        sourceId,
        entityType: e.entityType,
        value: e.value,
        normalized: e.normalized,
        confidence: e.confidence,
        evidence: e.evidence,
        method: e.method,
        duplicateOf: e.duplicateOf,
        status: "pending",
        createdAt: now,
      });
    }

    return { sourceId, extractions: args.entities.length };
  },
});

export const listSources = query({
  args: {},
  handler: async ctx => {
    const rows = await ctx.db.query("sources").withIndex("by_created").order("desc").take(100);
    return Promise.all(
      rows.map(async s => {
        const all = await ctx.db
          .query("extractions")
          .withIndex("by_source", q => q.eq("sourceId", s._id))
          .collect();
        return {
          id: s._id,
          name: s.name,
          kind: s.kind,
          status: s.status,
          bytes: s.bytes,
          rows: s.rows,
          characters: s.characters,
          note: s.note,
          error: s.error ?? null,
          digest: s.digest,
          createdAt: s.createdAt,
          extracted: all.length,
          pending: all.filter(e => e.status === "pending").length,
          approved: all.filter(e => e.status === "approved").length,
          rejected: all.filter(e => e.status === "rejected").length,
        };
      }),
    );
  },
});

export const sourceDetail = query({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, { sourceId }) => {
    const source = await ctx.db.get(sourceId);
    if (!source) return null;
    const rows = await ctx.db
      .query("extractions")
      .withIndex("by_source", q => q.eq("sourceId", sourceId))
      .collect();
    return { source, extractions: rows };
  },
});

export const removeSource = mutation({
  args: { sourceId: v.id("sources") },
  handler: async (ctx, { sourceId }) => {
    const rows = await ctx.db
      .query("extractions")
      .withIndex("by_source", q => q.eq("sourceId", sourceId))
      .collect();
    for (const r of rows) await ctx.db.delete(r._id);
    await ctx.db.delete(sourceId);
  },
});

/* ------------------------------------------------------------------ *
 * Module 2 — extraction review
 * ------------------------------------------------------------------ */

export const pendingExtractions = query({
  args: {},
  handler: async ctx => {
    const rows = await ctx.db.query("extractions").withIndex("by_status").take(400);
    return rows
      .filter(r => r.status === "pending")
      .sort((a, b) => a.confidence - b.confidence || a._creationTime - b._creationTime);
  },
});

export const decideExtraction = mutation({
  args: {
    id: v.id("extractions"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
  },
  handler: async (ctx, { id, status }) => {
    await ctx.db.patch(id, { status });
    return status;
  },
});

export const decideMany = mutation({
  args: {
    ids: v.array(v.id("extractions")),
    status: v.union(v.literal("approved"), v.literal("rejected")),
  },
  handler: async (ctx, { ids, status }) => {
    let n = 0;
    for (const id of ids) {
      const row = await ctx.db.get(id);
      if (row && row.status === "pending") {
        await ctx.db.patch(id, { status });
        n++;
      }
    }
    return n;
  },
});

/** Approved entities only — this is what feeds the investigative graph. */
export const approvedEntities = query({
  args: {},
  handler: async ctx => {
    const rows = await ctx.db.query("extractions").withIndex("by_status").take(1000);
    return rows
      .filter(r => r.status === "approved")
      .map(r => ({
        id: r._id,
        entityType: r.entityType,
        value: r.value,
        normalized: r.normalized,
        confidence: r.confidence,
        sourceId: r.sourceId,
        method: r.method,
      }));
  },
});

export const extractionStats = query({
  args: {},
  handler: async ctx => {
    const rows = await ctx.db.query("extractions").take(2000);
    const byType: Record<string, number> = {};
    for (const r of rows) byType[r.entityType] = (byType[r.entityType] ?? 0) + 1;
    return {
      total: rows.length,
      pending: rows.filter(r => r.status === "pending").length,
      approved: rows.filter(r => r.status === "approved").length,
      rejected: rows.filter(r => r.status === "rejected").length,
      duplicates: rows.filter(r => r.duplicateOf).length,
      byType,
    };
  },
});

/* ------------------------------------------------------------------ *
 * Module 5 — append-only audit chain
 * ------------------------------------------------------------------ */

/** Hash over the event body and its predecessor, so edits break the chain. */
export function auditHash(
  seq: number,
  action: string,
  actor: string,
  detail: string,
  prevHash: string,
  createdAt: number,
): string {
  return sha256Sync(`${seq}|${action}|${actor}|${detail}|${prevHash}|${createdAt}`);
}

export const appendAudit = mutation({
  args: {
    action: v.string(),
    actor: v.string(),
    detail: v.string(),
  },
  handler: async (ctx, args) => {
    const last = await ctx.db.query("auditEvents").withIndex("by_seq").order("desc").take(1);
    const prev = last[0];
    const seq = (prev?.seq ?? 0) + 1;
    const prevHash = prev?.hash ?? "0".repeat(64);
    const createdAt = Date.now();
    const hash = auditHash(seq, args.action, args.actor, args.detail, prevHash, createdAt);
    await ctx.db.insert("auditEvents", {
      seq,
      action: args.action,
      actor: args.actor,
      detail: args.detail,
      prevHash,
      hash,
      createdAt,
    });
    return { seq, hash };
  },
});

export const listAudit = query({
  args: {},
  handler: async ctx => {
    return await ctx.db.query("auditEvents").withIndex("by_seq").order("desc").take(200);
  },
});

/**
 * Recompute the chain. Returns the first sequence number where the stored hash
 * disagrees with a fresh computation, or null when every link verifies.
 */
export const verifyAudit = query({
  args: {},
  handler: async ctx => {
    const rows = await ctx.db.query("auditEvents").withIndex("by_seq").order("asc").take(5000);
    let prevHash = "0".repeat(64);
    for (const r of rows) {
      if (r.prevHash !== prevHash) return { valid: false, brokenAt: r.seq, checked: rows.length };
      const expect = auditHash(r.seq, r.action, r.actor, r.detail, r.prevHash, r.createdAt);
      if (expect !== r.hash) return { valid: false, brokenAt: r.seq, checked: rows.length };
      prevHash = r.hash;
    }
    return { valid: true, brokenAt: null, checked: rows.length };
  },
});
