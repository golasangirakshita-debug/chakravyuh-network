import { describe, expect, test } from "bun:test";
import {
  detectDuplicates,
  detectKind,
  extractEntities,
  extractPdfText,
  normalizePhone,
  normalizeValue,
  parseCsv,
} from "@/lib/ingest";
import { sha256Sync } from "@/lib/sha256";

describe("sync SHA-256", () => {
  test("matches the platform implementation on varied inputs", async () => {
    const inputs = [
      "",
      "a",
      "abc",
      "The quick brown fox jumps over the lazy dog",
      "x".repeat(55),
      "x".repeat(56),
      "x".repeat(64),
      "x".repeat(1000),
      "₹1,20,000 — Bengaluru · alias “Ravi”",
      "🙂 unicode after emoji 🙂",
    ];
    for (const s of inputs) {
      const mine = sha256Sync(s);
      const ref = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))).toString("hex");
      expect(mine).toBe(ref);
    }
  });

  test("produces 64 lowercase hex characters", () => {
    expect(sha256Sync("chakravyuh")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("PDF text recovery", () => {
  /** Minimal uncompressed PDF whose text is split across two Tj operators. */
  function miniPdf(): Uint8Array {
    const a = "FIR No. CR-001 dated 10/06/2026 Bengaluru";
    const b = "Caller used +91 9876543210 and transferred to account XXXX8842";
    const content = `BT /F1 12 Tf 72 720 Td (${a}) Tj 0 -20 Td (${b}) Tj ET`;
    const body = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n2 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`;
    return new TextEncoder().encode(body);
  }

  test("recovers text from an uncompressed content stream", async () => {
    const { text, note } = await extractPdfText(miniPdf());
    expect(text).toContain("FIR No. CR-001");
    expect(text).toContain("9876543210");
    expect(note).toContain("content streams");
  });

  test("keeps separate text runs from fusing into one word", async () => {
    // Regression: joining literals with "" produced "BengaluruCaller", which
    // broke word-boundary matching and silently dropped the location.
    const { text } = await extractPdfText(miniPdf());
    expect(text).not.toContain("BengaluruCaller");
    expect(text).toContain("Bengaluru Caller");
  });

  test("extracted text still yields the phone, account and place", async () => {
    const { text } = await extractPdfText(miniPdf());
    const kinds = extractEntities(text).map(e => e.entityType);
    expect(kinds).toContain("phone");
    expect(kinds).toContain("bank");
    expect(kinds).toContain("location");
  });
});

describe("CSV parsing", () => {
  test("handles quoted fields with commas and escaped quotes", () => {
    const csv = 'phone,city,note\n9876543210,Bengaluru,"lives near ""the temple"", north"\n';
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(["phone", "city", "note"]);
    expect(rows).toHaveLength(1);
    expect(rows[0][2]).toBe('lives near "the temple", north');
  });

  test("handles CRLF and blank lines", () => {
    const { headers, rows } = parseCsv("a,b\r\n1,2\r\n\r\n3,4\r\n");
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  test("returns empty structure for empty input", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("normalisation", () => {
  test("strips country code and separators from phone numbers", () => {
    expect(normalizePhone("+91 98765 43210")).toBe("9876543210");
    expect(normalizePhone("098765-43210")).toBe("9876543210");
  });

  test("normalises per entity type", () => {
    expect(normalizeValue("upi", "FastCash@UPI")).toBe("fastcash@upi");
    expect(normalizeValue("bank", "xxxx 8842")).toBe("XXXX8842");
  });
});

describe("entity extraction", () => {
  const text = [
    "FIR No. CR-001 dated 10/06/2026, Bengaluru.",
    "Complainant states she received a call from +91 9876543210.",
    "Amount transferred to account XXXX8842 and UPI fastcash@upi.",
    "The caller used alias “Ravi” and met Priya Sharma in Bengaluru.",
  ].join(" ");

  const entities = extractEntities(text, { kind: "fir" });
  const byType = (t: string) => entities.filter(e => e.entityType === t);

  test("finds phones, accounts, UPI handles, places and people", () => {
    expect(byType("phone").map(e => e.normalized)).toContain("9876543210");
    expect(byType("bank").map(e => e.normalized)).toContain("XXXX8842");
    expect(byType("upi").map(e => e.normalized)).toContain("fastcash@upi");
    expect(byType("location").map(e => e.value)).toContain("Bengaluru");
    expect(byType("person").map(e => e.value)).toContain("Priya Sharma");
  });

  test("records the literal evidence substring and the basis for every row", () => {
    for (const e of entities) {
      expect(e.evidence.length).toBeGreaterThan(0);
      expect(e.method.length).toBeGreaterThan(5);
      expect(e.confidence).toBeGreaterThan(0);
      expect(e.confidence).toBeLessThanOrEqual(0.99);
    }
  });

  test("an explicit country code scores above a bare 10-digit match", () => {
    const withCode = extractEntities("called +91 9988776655 today").find(e => e.entityType === "phone")!;
    expect(withCode.confidence).toBeGreaterThanOrEqual(0.99);
  });

  test("dedicated columns score higher than prose for the same value", () => {
    const fromColumn = extractEntities("", {
      headers: ["phone", "city"],
      rows: [["9876543210", "Pune"]],
    });
    const fromProse = extractEntities("reach 9876543210 immediately");
    const a = fromColumn.find(e => e.entityType === "phone")!;
    const b = fromProse.find(e => e.entityType === "phone")!;
    expect(a.confidence).toBeGreaterThanOrEqual(b.confidence);
  });

  test("never proposes stopwords or dates as people", () => {
    const names = byType("person").map(e => e.value);
    for (const bad of ["FIR No", "Case No", "The Caller", "June Bengaluru"]) {
      expect(names).not.toContain(bad);
    }
  });

  test("is deterministic", () => {
    const again = extractEntities(text, { kind: "fir" });
    expect(again).toEqual(entities);
  });
});

describe("duplicate detection", () => {
  const entities = extractEntities("call 9876543210 or +91 98765 43210 from Bengaluru");

  test("flags a value already known to the corpus", () => {
    const out = detectDuplicates(entities, [{ label: "9876543210", type: "phone" }]);
    const phone = out.find(e => e.entityType === "phone")!;
    expect(phone.duplicateOf).toBe("9876543210");
  });

  test("treats differently formatted copy of the same number as the same entity", () => {
    const out = detectDuplicates(entities, []);
    const phones = out.filter(e => e.entityType === "phone");
    expect(phones).toHaveLength(1);
  });

  test("leaves genuinely new values unflagged", () => {
    const out = detectDuplicates(extractEntities("new city Kochi mentioned"), []);
    expect(out.every(e => e.duplicateOf === undefined)).toBe(true);
  });
});

describe("source kind detection", () => {
  test("recognises structured headers", () => {
    expect(detectKind("export.csv", "", ["phone", "tower", "duration"])).toBe("cdr");
    expect(detectKind("export.csv", "", ["amount", "from", "to"])).toBe("financial");
  });

  test("falls back to content shape", () => {
    expect(detectKind("notes.txt", "Amount transferred to account")).toBe("financial");
    expect(detectKind("notes.txt", "Call duration 240s tower BLR-142")).toBe("cdr");
  });
});
