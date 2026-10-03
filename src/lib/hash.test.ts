import { describe, expect, test } from "bun:test";
import { computeChain, verifyChain, GENESIS } from "./hash";

const ITEMS = [
  { id: "EV-001-FIR", content: "FIR 42/2026 Bengaluru — missing person" },
  { id: "EV-001-CDR", content: "CDR tower BLR-142 09 Jun" },
  { id: "EV-002-OSINT", content: "social media luring post" },
];

describe("evidence hash chain", () => {
  test("links every block to genesis then to its predecessor", async () => {
    const chain = await computeChain(ITEMS);
    expect(chain).toHaveLength(ITEMS.length);
    expect(chain[0].prevHash).toBe(GENESIS);
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i].prevHash).toBe(chain[i - 1].hash);
    }
  });

  test("produces 64-char hex hashes", async () => {
    const chain = await computeChain(ITEMS);
    for (const b of chain) expect(b.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("verifies an untouched chain", async () => {
    const chain = await computeChain(ITEMS);
    const ver = await verifyChain(ITEMS, chain);
    expect(ver.valid).toBe(true);
    expect(ver.brokenAt).toBeNull();
  });

  test("detects tampering at the edited block", async () => {
    const chain = await computeChain(ITEMS);
    const tampered = ITEMS.map((it, i) =>
      i === 1 ? { ...it, content: `${it.content} (altered)` } : it,
    );
    const ver = await verifyChain(tampered, chain);
    expect(ver.valid).toBe(false);
    expect(ver.brokenAt).toBe(1);
    expect(ver.actual).not.toBe(ver.expected);
  });

  test("detects an inserted record", async () => {
    const chain = await computeChain(ITEMS);
    // Inserted at index 2: blocks 0 and 1 still match, block 2 does not.
    const inserted = [ITEMS[0], ITEMS[1], { id: "EV-X", content: "smuggled in" }, ITEMS[2]];
    const ver = await verifyChain(inserted, chain);
    expect(ver.valid).toBe(false);
    expect(ver.brokenAt).toBe(2);
  });

  test("is order-sensitive", async () => {
    const chain = await computeChain(ITEMS);
    const swapped = [ITEMS[1], ITEMS[0], ITEMS[2]];
    const ver = await verifyChain(swapped, chain);
    expect(ver.valid).toBe(false);
  });

  test("different content yields different hashes", async () => {
    const a = await computeChain([{ id: "A", content: "one" }]);
    const b = await computeChain([{ id: "A", content: "two" }]);
    expect(a[0].hash).not.toBe(b[0].hash);
  });
});