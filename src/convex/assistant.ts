"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";

/**
 * MODULE 4 — Investigation Assistant
 * ==================================
 * The retrieval step happens BEFORE this action is called: the client resolves
 * the question against the graph, the case corpus and the approved extraction
 * rows, and passes the resulting records in as `evidence`.
 *
 * That ordering is the safety property. The model is never asked "what do you
 * know about X"; it is asked "phrase an answer using only these rows". If
 * retrieval finds nothing, this action returns a refusal and never contacts
 * the provider at all — so the assistant cannot invent a connection, because
 * it is never given the opportunity to.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-3.5-haiku";

const SYSTEM = `You are the Chakravyuh investigation assistant.

Absolute rules:
1. Use ONLY the records in the EVIDENCE block. You have no other knowledge.
2. Every factual sentence must be traceable to one or more record ids, cited as [R1], [R2].
3. If the evidence does not answer the question, say exactly: "The records I retrieved do not answer that." Then state what record would be needed.
4. Never assert a connection, transaction, call or meeting that is not in the evidence.
5. Never infer guilt, intent or criminality. You rank and describe; investigators decide.
6. Be terse. Three to six sentences unless the question asks for a list.

Output plain text only. No markdown headings.`;

export const ask = action({
  args: {
    question: v.string(),
    evidence: v.array(
      v.object({
        id: v.string(),
        kind: v.string(),
        label: v.string(),
        detail: v.string(),
      }),
    ),
  },
  handler: async (_ctx, { question, evidence }) => {
    const clean = question.trim().slice(0, 800);
    if (!clean) {
      return { answer: "Ask a question about the case records.", usedLlm: false, model: null };
    }

    // No retrieval, no answer. This is the anti-invention guard.
    if (evidence.length === 0) {
      return {
        answer:
          "The records I retrieved do not answer that. I could not find any case, entity, call or transfer matching this question, so I will not guess at a connection. Try naming a specific phone number, account, alias or FIR id.",
        usedLlm: false,
        model: null,
      };
    }

    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      return { answer: fallbackAnswer(clean, evidence), usedLlm: false, model: null };
    }

    const block = evidence
      .map(
        (e, i) =>
          `[R${i + 1}] id=${e.id} kind=${e.kind}\nlabel: ${e.label}\ndetail: ${e.detail}`,
      )
      .join("\n\n");

    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://chakravyuh.local",
          "X-Title": "Chakravyuh Investigator Console",
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
          temperature: 0.1,
          max_tokens: 700,
          messages: [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content: `QUESTION:\n${clean}\n\nEVIDENCE:\n${block}`,
            },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        return {
          answer: `${fallbackAnswer(clean, evidence)}\n\n(Model call failed with HTTP ${res.status}; this answer came from the retrieved records only.)`,
          usedLlm: false,
          model: null,
          error: body.slice(0, 200),
        };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        model?: string;
      };
      const answer = json.choices?.[0]?.message?.content?.trim();
      if (!answer) {
        return { answer: fallbackAnswer(clean, evidence), usedLlm: false, model: null };
      }
      return { answer, usedLlm: true, model: json.model ?? null };
    } catch (err) {
      return {
        answer: `${fallbackAnswer(clean, evidence)}\n\n(Provider unreachable: ${(err as Error).message.slice(0, 120)}. This answer came from the retrieved records only.)`,
        usedLlm: false,
        model: null,
      };
    }
  },
});

/* ------------------------------------------------------------------ *
 * Module 2 — model-assisted extraction
 * ------------------------------------------------------------------ */

const EXTRACT_SYSTEM = `You extract entities from Indian police and financial records.

Return ONLY a JSON array. Each element:
{"entityType":"person|phone|location|bank|upi|alias","value":"<verbatim substring>","confidence":0.0-1.0,"reason":"<why>"}

Hard rules:
- "value" MUST be copied character-for-character from the source text. Never normalise, translate, expand abbreviations, or invent.
- If a value does not appear literally in the text, omit it.
- confidence describes how certain the pattern is, not how important the entity is.
- No commentary, no markdown fences. JSON only.`;

/**
 * Ask the model for entity candidates.
 *
 * Every returned value is checked against the source text on the way out. A
 * model that paraphrases or hallucinates is filtered here rather than trusted,
 * so the extraction table can never show a value that is not in the document.
 */
export const extract = action({
  args: { text: v.string() },
  handler: async (_ctx, { text }) => {
    const key = process.env.OPENROUTER_API_KEY;
    const body = text.slice(0, 12000);
    if (!key || body.trim().length < 20) return { entities: [], usedLlm: false, rejected: 0 };

    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://chakravyuh.local",
          "X-Title": "Chakravyuh Extraction",
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
          temperature: 0,
          max_tokens: 1500,
          messages: [
            { role: "system", content: EXTRACT_SYSTEM },
            { role: "user", content: body },
          ],
        }),
      });
      if (!res.ok) return { entities: [], usedLlm: false, rejected: 0 };

      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = json.choices?.[0]?.message?.content ?? "[]";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned) as unknown;
      if (!Array.isArray(parsed)) return { entities: [], usedLlm: false, rejected: 0 };

      const ALLOWED = new Set(["person", "phone", "location", "bank", "upi", "alias"]);
      let rejected = 0;
      const entities: {
        entityType: string;
        value: string;
        confidence: number;
        evidence: string;
        method: string;
      }[] = [];

      for (const item of parsed) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const type = String(o.entityType ?? "");
        const value = String(o.value ?? "").trim();
        if (!ALLOWED.has(type) || value.length < 2) continue;
        // The verification step: no literal match, no row.
        if (!body.toLowerCase().includes(value.toLowerCase())) {
          rejected++;
          continue;
        }
        const at = body.toLowerCase().indexOf(value.toLowerCase());
        const conf = Number(o.confidence);
        entities.push({
          entityType: type,
          value,
          confidence: Math.min(0.99, Math.max(0.5, Number.isFinite(conf) ? conf : 0.85)),
          evidence: body.slice(Math.max(0, at - 40), Math.min(body.length, at + value.length + 40)).replace(/\s+/g, " ").trim(),
          method: "model-assisted, verified verbatim against source",
        });
      }
      return { entities, usedLlm: true, rejected };
    } catch {
      return { entities: [], usedLlm: false, rejected: 0 };
    }
  },
});

/**
 * Deterministic answer built from the retrieved rows.
 *
 * This is not a stub. With no API key configured the assistant must still be
 * useful and still be bound by the evidence, so it reports the rows it found
 * and declines to do anything the rows do not support.
 */
function fallbackAnswer(
  question: string,
  evidence: { id: string; kind: string; label: string; detail: string }[],
): string {
  const head = `Retrieved ${evidence.length} record${evidence.length === 1 ? "" : "s"} matching this question.`;
  const lines = evidence
    .slice(0, 8)
    .map((e, i) => `[R${i + 1}] ${e.kind} · ${e.label} — ${e.detail}`);
  const tail =
    "No language model is configured, so this is the retrieval result verbatim. Enable an OpenRouter key to get a written summary; the evidence above is what any summary would be built from. These are records, not findings of guilt.";
  void question;
  return [head, "", ...lines, "", tail].join("\n");
}
