import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // ------------------------------------------------ Module 1: collection
    // One row per uploaded artefact. Status is advanced by the ingest action
    // and never set optimistically by the client.
    sources: defineTable({
      ownerId: v.optional(v.string()),
      name: v.string(),
      kind: v.union(
        v.literal("fir"),
        v.literal("cdr"),
        v.literal("financial"),
        v.literal("osint"),
      ),
      status: v.union(
        v.literal("received"),
        v.literal("parsing"),
        v.literal("extracted"),
        v.literal("failed"),
      ),
      bytes: v.number(),
      rows: v.number(),
      characters: v.number(),
      /** Short human-readable note about how the file was read. */
      note: v.string(),
      error: v.optional(v.string()),
      /** SHA-256 of the raw bytes, so the same file is recognisable later. */
      digest: v.string(),
      createdAt: v.number(),
    })
      .index("by_created", ["createdAt"])
      .index("by_digest", ["digest"]),

    // ------------------------------------------------ Module 2: extraction
    // Candidate entities proposed from a source. Investigators approve or
    // reject; only approved rows become part of the investigative graph.
    extractions: defineTable({
      sourceId: v.id("sources"),
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
      /** 0–1. Extraction confidence only — not a probability of involvement. */
      confidence: v.number(),
      /** The literal substring the value was read from. */
      evidence: v.string(),
      /** How the value was obtained, so a reviewer can judge the basis. */
      method: v.string(),
      /** Set when the value matches an existing entity or another extraction. */
      duplicateOf: v.optional(v.string()),
      status: v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
      ),
      createdAt: v.number(),
    })
      .index("by_source", ["sourceId"])
      .index("by_status", ["status"]),

    // ------------------------------------------------ Module 5: audit trail
    // Append-only. Each row links to the previous by hash, so the trail can be
    // verified rather than trusted.
    auditEvents: defineTable({
      seq: v.number(),
      action: v.string(),
      actor: v.string(),
      detail: v.string(),
      prevHash: v.string(),
      hash: v.string(),
      createdAt: v.number(),
    }).index("by_seq", ["seq"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
