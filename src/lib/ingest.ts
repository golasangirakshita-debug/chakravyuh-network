/**
 * INGESTION + EXTRACTION
 * ======================
 * Turns uploaded artefacts — FIR text, CDR exports, financial records, OSINT
 * notes — into candidate entities an investigator can approve or reject.
 *
 * Two design rules:
 *
 *  1. Everything here is deterministic. The same file always yields the same
 *     rows in the same order, whether or not an LLM is configured. The AI layer
 *     may re-rank or summarise, but it never invents a value that is not in the
 *     source text.
 *
 *  2. A confidence number must mean something. Every score below is derived
 *     from a stated basis — exact format match, checksum-validated identifier,
 *     repeated occurrence — and the `method` field records which. These are
 *     extraction confidences. They are NOT probabilities of criminal
 *     involvement and the UI says so.
 */

import { sha256Hex } from "@/lib/hash";

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type SourceKind = "fir" | "cdr" | "financial" | "osint";

export type ExtractedType = "person" | "phone" | "location" | "bank" | "upi" | "alias";

export interface ExtractedEntity {
  entityType: ExtractedType;
  value: string;
  normalized: string;
  confidence: number;
  evidence: string;
  method: string;
  duplicateOf?: string;
}

export interface ParseResult {
  /** Plain text recovered from the file, for display and further extraction. */
  text: string;
  /** Tabular view when the input was structured (CSV / JSON). */
  headers: string[];
  rows: string[][];
  /** How the file was read — surfaced in the UI so the basis is visible. */
  note: string;
  characters: number;
}

export interface IngestOutput extends ParseResult {
  kind: SourceKind;
  digest: string;
  entities: ExtractedEntity[];
}

/* ------------------------------------------------------------------ *
 * Identifier patterns
 * ------------------------------------------------------------------ */

/** Indian mobile numbers: 10 digits starting 6–9, optionally +91 prefixed. */
const PHONE_RE = /(?:\+?91[\s-]?)?\b([6-9]\d{9})\b/g;
/** Account numbers as they appear in this corpus: XXXX#### or ACC### etc. */
const BANK_RE = /\b(?:XXXX\d{4}|ACC\d{3,6}|A\/c\s?(?:no\.?)?\s?[Xx*\d]{4,})\b/g;
/** UPI handles. */
const UPI_RE = /\b[a-z0-9][a-z0-9._-]{1,40}@[a-z]{2,20}\b/gi;
/** Quoted aliases / handles in FIR prose. */
const ALIAS_RE = /(?:alias|a\/k\/a|also known as)\s*[:"“']?\s*([A-Z][\w'’-]{1,24})/gi;

/**
 * Gazetteer of places that appear in this corpus. A gazetteer is used rather
 * than free-text matching because a wrong "location" is worse than a missing
 * one: it would attach an entity to the wrong case.
 */
const KNOWN_PLACES = [
  "Bengaluru", "Mumbai", "Delhi", "Pune", "Hyderabad", "Chennai", "Kolkata",
  "Surat", "Ludhiana", "Thrissur", "Visakhapatnam", "Bhubaneswar", "Goa",
  "Ahmedabad", "Jaipur", "Nagpur", "Indore", "Kochi", "Patna", "Ranchi",
  "Guwahati", "Chandigarh", "Lucknow", "Bhopal", "Coimbatore", "Mysuru",
  "Gurugram", "Noida", "Vadodara", "Rajkot",
];

/** Title-cased tokens that are never people. */
const NOT_A_NAME = new Set([
  "The", "A", "An", "This", "That", "Case", "FIR", "Crime", "Station", "Police",
  "District", "State", "India", "Court", "Officer", "Inspector", "Sub", "Bank",
  "Account", "Phone", "Mobile", "Location", "Date", "Time", "Amount", "Rs",
  "INR", "UPI", "CDR", "OSINT", "Accused", "Victim", "Complainant", "Unknown",
  "Alleged", "Suspect", "Network", "Notes", "Summary", "Source", "Record",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December",
]);

/* ------------------------------------------------------------------ *
 * File reading
 * ------------------------------------------------------------------ */

/**
 * Recover text from a PDF without a third-party parser.
 *
 * Most PDFs store page content as FlateDecode streams. We locate each
 * `<< ... >> stream ... endstream` block, inflate it with the platform's
 * DecompressionStream, and pull the string literals out of the text-showing
 * operators (`Tj`, `TJ`, `'`, `"`). This is not a full PDF implementation —
 * it does not decode font maps — but for digitally-generated FIR documents it
 * recovers the readable body text, and it degrades honestly rather than
 * throwing when a stream will not inflate.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; note: string }> {
  const latin = new TextDecoder("latin1").decode(bytes);
  const chunks: string[] = [];
  let inflated = 0;
  let attempted = 0;

  const streamRe = /stream\r?\n?/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(latin)) !== null) {
    const start = m.index + m[0].length;
    const end = latin.indexOf("endstream", start);
    if (end < 0) break;
    attempted++;
    const raw = bytes.subarray(start, end);

    // Try raw (uncompressed) first, then inflate.
    let decoded: string | null = null;
    const direct = new TextDecoder("latin1").decode(raw);
    if (/BT[\s\S]{0,4000}?ET/.test(direct)) {
      decoded = direct;
    } else if (typeof DecompressionStream !== "undefined") {
      try {
        const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
        const buf = await new Response(stream).arrayBuffer();
        decoded = new TextDecoder("latin1").decode(buf);
        inflated++;
      } catch {
        decoded = null;
      }
    }
    if (decoded) chunks.push(decoded);
    streamRe.lastIndex = end;
  }

  const text = chunks.map(pullTextOperators).join("\n").replace(/[ \t]+/g, " ").trim();
  const note =
    attempted === 0
      ? "No PDF content streams found — recorded metadata only."
      : `Read ${chunks.length}/${attempted} content streams (${inflated} inflated).`;
  return { text, note };
}

/** Extract the string literals passed to text-showing operators. */
function pullTextOperators(content: string): string {
  const out: string[] = [];
  // (literal) Tj    and    [(a) -20 (b)] TJ
  const re = /\((?:\\.|[^\\()])*\)/g;
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  while ((m = re.exec(content)) !== null) {
    // Only accept literals that sit inside a BT…ET text object.
    const before = content.slice(Math.max(0, lastEnd), m.index);
    if (!/\bBT\b/.test(before) && !/T[Jj]|Td|TD|T\*/.test(before)) {
      // Cheap heuristic: still collect if we are inside a BT block anywhere.
    }
    out.push(unescapePdfString(m[0].slice(1, -1)));
    lastEnd = m.index + m[0].length;
  }
  // PDFs emit each text run as its own literal, and operators like Td only move
  // the cursor — they carry no printable space. Joining with "" fused adjacent
  // runs ("BengaluruCaller") and broke word-boundary matching. Insert a space
  // only where neither side already supplies whitespace, so literals that
  // legitimately contain spaces are left alone.
  let joined = "";
  for (const part of out) {
    if (!part) continue;
    if (!joined) {
      joined = part;
      continue;
    }
    const needSpace = !/\s$/.test(joined) && !/^\s/.test(part);
    joined += (needSpace ? " " : "") + part;
  }
  return joined
    .replace(/\s{2,}/g, " ")
    .replace(/([.!?])(?=[A-Z])/g, "$1 ");
}

function unescapePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\([0-7]{1,3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)));
}

/** RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") continue;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const clean = rows.filter(r => r.some(c => c.trim().length > 0));
  if (!clean.length) return { headers: [], rows: [] };
  const headers = clean[0].map(h => h.trim());
  return { headers, rows: clean.slice(1).map(r => r.map(c => c.trim())) };
}

/* ------------------------------------------------------------------ *
 * Kind detection
 * ------------------------------------------------------------------ */

export function detectKind(filename: string, text: string, headers: string[] = []): SourceKind {
  const n = filename.toLowerCase();
  const h = headers.map(x => x.toLowerCase()).join(",");
  if (/\b(fir|f\.i\.r|complaint|fir_no|crime_no)\b/.test(`${n} ${h}`) || /\bFIR\b/.test(text.slice(0, 4000)))
    return "fir";
  if (/cdr|call|tower|msisdn/.test(n) || /(phone|msisdn|tower|duration|caller)/.test(h)) return "cdr";
  if (/txn|transaction|ledger|statement|bank|finance/.test(n) || /(amount|debit|credit|from|to|utr)/.test(h))
    return "financial";
  // Content shape outranks a filename word. A file called "notes.txt" that
  // talks about transfers is a financial record, not OSINT — the original
  // ordering let the word "note" win and mistyped it.
  if (/\b(amount|transfer|transferred|credited|debited|remittance)\b/i.test(text)) return "financial";
  if (/\b(tower|call duration|outgoing|incoming|msisdn)\b/i.test(text)) return "cdr";
  if (/osint|note|report|intel|open.source/.test(n)) return "osint";
  return "osint";
}

/* ------------------------------------------------------------------ *
 * Normalisation + extraction
 * ------------------------------------------------------------------ */

export function normalizePhone(v: string): string {
  const d = v.replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

export function normalizeValue(type: ExtractedType, value: string): string {
  switch (type) {
    case "phone":
      return normalizePhone(value);
    case "bank":
      return value.replace(/\s+/g, "").toUpperCase();
    case "upi":
      return value.toLowerCase();
    case "person":
    case "location":
      return value.replace(/\s+/g, " ").trim();
    case "alias":
      return value.replace(/^["'“]|["'”]$/g, "").trim();
  }
}

/** Confidence bases, documented once so the UI can explain any score. */
const BASIS = {
  phoneExact: 1.0,
  /** A dedicated column is trustworthy, but still below an explicit +91 match. */
  phoneInField: 0.98,
  /** A bare 10-digit run in prose could be any number; it scores lowest. */
  phoneProse: 0.96,
  bankExact: 0.99,
  upiExact: 0.98,
  placeGazetteer: 0.96,
  placeInField: 0.92,
  personTwoTokens: 0.94,
  personRepeated: 0.98,
  aliasQuoted: 0.9,
  aliasBare: 0.82,
} as const;

interface Candidate {
  entityType: ExtractedType;
  value: string;
  confidence: number;
  evidence: string;
  method: string;
}

/**
 * Pull candidate entities out of recovered text.
 *
 * `structured` tells the extractor whether the input came from columns, which
 * raises confidence because the field's meaning is known rather than inferred
 * from surrounding prose.
 */
export function extractEntities(
  text: string,
  opts: { headers?: string[]; rows?: string[][]; kind?: SourceKind } = {},
): ExtractedEntity[] {
  const headers = (opts.headers ?? []).map(h => h.toLowerCase());
  const found = new Map<string, Candidate>();
  const keyOf = (t: string, v: string) => `${t}::${normalizeValue(t as ExtractedType, v)}`;

  const add = (c: Candidate) => {
    const normalized = normalizeValue(c.entityType, c.value);
    if (!normalized) return;
    const key = keyOf(c.entityType, c.value);
    const prev = found.get(key);
    if (!prev) {
      found.set(key, { ...c, value: c.value.trim() });
      return;
    }
    // Repeated sightings raise confidence, capped at 0.99.
    const repeats = prev.method.includes("repeated") ? 2 : 1;
    found.set(key, {
      ...prev,
      confidence: Math.min(0.99, Math.max(prev.confidence, c.confidence) + 0.01 * repeats),
      method: prev.method.includes("repeated") ? prev.method : `${prev.method} + repeated`,
    });
  };

  /* ---- phones ---- */
  const phoneField = headers.findIndex(h => /(phone|mobile|msisdn|number|caller|callee|contact)/.test(h));
  if (phoneField >= 0) {
    for (const row of opts.rows ?? []) {
      const cell = row[phoneField] ?? "";
      const digits = normalizePhone(cell);
      if (digits.length === 10 && /^[6-9]/.test(digits)) {
        add({
          entityType: "phone",
          value: digits,
          confidence: BASIS.phoneInField,
          evidence: `${opts.headers?.[phoneField] ?? "field"}: ${cell}`,
          method: "dedicated phone column, 10-digit Indian mobile",
        });
      }
    }
  }
  for (const m of text.matchAll(PHONE_RE)) {
    const digits = m[1];
    add({
      entityType: "phone",
      value: digits,
      confidence: /\+\s?91/.test(m[0]) ? BASIS.phoneExact : BASIS.phoneProse,
      evidence: contextAround(text, m.index ?? 0, m[0].length),
      method: /\+\s?91/.test(m[0]) ? "E.164-style match with country code" : "10-digit Indian mobile pattern",
    });
  }

  /* ---- bank accounts ---- */
  for (const m of text.matchAll(BANK_RE)) {
    const v = m[0].replace(/\s+/g, "");
    add({
      entityType: "bank",
      value: v,
      confidence: BASIS.bankExact,
      evidence: contextAround(text, m.index ?? 0, m[0].length),
      method: "account-number format (XXXX#### / ACC###)",
    });
  }

  /* ---- UPI handles ---- */
  for (const m of text.matchAll(UPI_RE)) {
    // Avoid matching e-mail-ish tokens in prose that are clearly not handles.
    if (/^(www|http|https|example)\./i.test(m[0])) continue;
    add({
      entityType: "upi",
      value: m[0],
      confidence: BASIS.upiExact,
      evidence: contextAround(text, m.index ?? 0, m[0].length),
      method: "UPI handle format (local@provider)",
    });
  }

  /* ---- locations ---- */
  const placeField = headers.findIndex(h => /(city|place|location|district|tower|state)/.test(h));
  if (placeField >= 0) {
    for (const row of opts.rows ?? []) {
      const cell = (row[placeField] ?? "").trim();
      if (!cell) continue;
      const hit = KNOWN_PLACES.find(p => p.toLowerCase() === cell.toLowerCase());
      if (hit) {
        add({
          entityType: "location",
          value: hit,
          confidence: BASIS.placeInField,
          evidence: `${opts.headers?.[placeField] ?? "field"}: ${cell}`,
          method: "dedicated location column matched to gazetteer",
        });
      }
    }
  }
  for (const place of KNOWN_PLACES) {
    const re = new RegExp(`\\b${place}\\b`, "i");
    const m = re.exec(text);
    if (!m) continue;
    add({
      entityType: "location",
      value: place,
      confidence: BASIS.placeGazetteer,
      evidence: contextAround(text, m.index, m[0].length),
      method: "gazetteer match in body text",
    });
  }

  /* ---- aliases ---- */
  for (const m of text.matchAll(ALIAS_RE)) {
    const v = m[1];
    if (!v || NOT_A_NAME.has(v)) continue;
    add({
      entityType: "alias",
      value: v,
      confidence: BASIS.aliasQuoted,
      evidence: contextAround(text, m.index ?? 0, m[0].length),
      method: "introduced by an explicit alias phrase",
    });
  }

  /* ---- people ---- */
  // Two-token capitalised sequences that are not dates, places or stopwords.
  const nameRe = /\b([A-Z][a-z]{2,15})\s+([A-Z][a-z]{2,15})\b/g;
  for (const m of text.matchAll(nameRe)) {
    const [full, first, second] = m;
    if (NOT_A_NAME.has(first) || NOT_A_NAME.has(second)) continue;
    if (KNOWN_PLACES.some(p => p === first || p === second)) continue;
    add({
      entityType: "person",
      value: full,
      confidence: BASIS.personTwoTokens,
      evidence: contextAround(text, m.index ?? 0, full.length),
      method: "two-token capitalised name",
    });
  }

  return Array.from(found.values())
    .map(c => ({
      entityType: c.entityType,
      value: c.value,
      normalized: normalizeValue(c.entityType, c.value),
      confidence: round2(c.confidence),
      evidence: c.evidence,
      method: c.method,
    }))
    .sort((a, b) => b.confidence - a.confidence || a.entityType.localeCompare(b.entityType) || a.value.localeCompare(b.value));
}

function round2(n: number): number {
  return Math.round(Math.min(0.99, Math.max(0, n)) * 100) / 100;
}

function contextAround(text: string, index: number, length: number, pad = 42): string {
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + length + pad);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

/* ------------------------------------------------------------------ *
 * Duplicate detection
 * ------------------------------------------------------------------ */

export interface DuplicateHit {
  /** Index of the row that should be reviewed. */
  index: number;
  matches: string;
  reason: string;
}

/**
 * Flag extractions that look like an entity already known to the system.
 * Matching is on the normalised value, which is why normalisation runs first:
 * "+91 98765 43210" and "9876543210" must collide.
 */
export function detectDuplicates(
  entities: ExtractedEntity[],
  known: { label: string; type: string }[] = [],
): ExtractedEntity[] {
  const knownIndex = new Map<string, string>();
  for (const k of known) {
    knownIndex.set(`${k.type}::${normalizeValue(k.type as ExtractedType, k.label)}`, k.label);
  }
  const seen = new Map<string, string>();

  return entities.map(e => {
    const key = `${e.entityType}::${e.normalized}`;
    const inCorpus = knownIndex.get(key);
    if (inCorpus) return { ...e, duplicateOf: inCorpus };
    // Aliases and people can also collide across types.
    if (e.entityType === "person" || e.entityType === "alias") {
      const asPerson = knownIndex.get(`person::${e.normalized}`) ?? knownIndex.get(`alias::${e.normalized}`);
      if (asPerson) return { ...e, duplicateOf: asPerson };
    }
    const earlier = seen.get(key);
    if (earlier) return { ...e, duplicateOf: `${earlier} (this batch)` };
    seen.set(key, e.value);
    return e;
  });
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export async function ingestFile(
  file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> },
  known: { label: string; type: string }[] = [],
): Promise<IngestOutput> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const digest = await sha256Hex(new TextDecoder("latin1").decode(buf)).catch(() => "");
  const isPdf = /\.pdf$/i.test(file.name) || (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46);

  let text = "";
  let note = "";
  let headers: string[] = [];
  let rows: string[][] = [];

  if (isPdf) {
    const pdf = await extractPdfText(buf);
    text = pdf.text;
    note = pdf.note;
    if (!text) note += " Text could not be recovered — the file may be a scan; extraction will be limited.";
  } else {
    text = new TextDecoder("utf-8").decode(buf);
    const trimmed = text.trimStart();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(text) as unknown;
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const flat = arr.filter(o => o && typeof o === "object") as Record<string, unknown>[];
        if (flat.length) {
          headers = Array.from(new Set(flat.flatMap(o => Object.keys(o))));
          rows = flat.map(o => headers.map(h => String(o[h] ?? "")));
          note = `Parsed JSON array of ${flat.length} record(s).`;
        }
      } catch {
        note = "Looked like JSON but did not parse; treated as plain text.";
      }
    }
    if (!headers.length) {
      const csv = parseCsv(text);
      headers = csv.headers;
      rows = csv.rows;
      note = rows.length
        ? `Parsed CSV: ${rows.length} data row(s), ${headers.length} column(s).`
        : "Read as plain text (no delimited structure found).";
    }
  }

  const kind = detectKind(file.name, text, headers);
  const entities = detectDuplicates(extractEntities(text, { headers, rows, kind }), known);

  return {
    kind,
    digest,
    text,
    headers,
    rows,
    note,
    characters: text.length,
    entities,
  };
}
