import { useVyuh } from "@/store/vyuh";
import { COLORS, evidenceForCase, type EvidenceType } from "@/lib/data";
import {
  computeChain,
  GENESIS,
  verifyChain,
  type ChainBlock,
  type ChainVerification,
} from "@/lib/hash";
import { motion } from "framer-motion";
import {
  Building2,
  FileText,
  Radar as RadarIcon,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader, Panel, PanelTitle } from "./ui";

const EV_STYLE = {
  FIR: { color: COLORS.cyan, icon: FileText },
  CDR: { color: COLORS.amber, icon: Smartphone },
  BANK: { color: COLORS.green, icon: Building2 },
  OSINT: { color: COLORS.violet, icon: RadarIcon },
} as const;

export default function EvidencePage() {
  const { cases, audit, pushAudit, reportIntegrity } = useVyuh();
  const [caseId, setCaseId] = useState("CR-004");
  const items = useMemo(() => evidenceForCase(caseId), [caseId]);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState<ChainBlock[]>([]);
  const [blocks, setBlocks] = useState<ChainBlock[]>([]);
  const [ver, setVer] = useState<ChainVerification>({
    valid: true,
    brokenAt: null,
    expected: null,
    actual: null,
  });
  const alerted = useRef(false);
  const [flash, setFlash] = useState<number | null>(null);

  // seal the chain whenever the selected case changes
  useEffect(() => {
    const map: Record<string, string> = {};
    items.forEach(i => (map[i.id] = i.content));
    setContents(map);
    let alive = true;
    (async () => {
      const chain = await computeChain(items.map(i => ({ id: i.id, content: i.content })));
      if (!alive) return;
      setBaseline(chain);
      setBlocks(chain);
      setVer({ valid: true, brokenAt: null, expected: null, actual: null });
      alerted.current = false;
      reportIntegrity(true, null);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // recompute + verify on every keystroke
  useEffect(() => {
    if (!items.length || !baseline.length) return;
    let alive = true;
    (async () => {
      const payload = items.map(i => ({ id: i.id, content: contents[i.id] ?? i.content }));
      const chain = await computeChain(payload);
      const result = await verifyChain(payload, baseline);
      if (!alive) return;
      setBlocks(chain);
      setVer(result);
      if (!result.valid) {
        setFlash(result.brokenAt);
        reportIntegrity(false, result.brokenAt);
        if (!alerted.current) {
          alerted.current = true;
          const b = result.brokenAt ?? 0;
          toast.error(`INTEGRITY ALERT — BLOCK ${b + 1}`, {
            description: `actor: unknown session · ${items[b]?.id ?? "block"} no longer matches the sealed hash. Every later block is now invalid.`,
            duration: 8000,
          });
          pushAudit({
            ts: new Date().toISOString(),
            actor: "system",
            action: `integrity.chain-broken block ${b + 1}`,
            result: "ALERT",
          });
        }
      } else {
        reportIntegrity(true, null);
        alerted.current = false;
        setFlash(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [contents, items, baseline, reportIntegrity, pushAudit]);

  const tamper = () => {
    if (items.length < 2) return;
    const target = items[1];
    setContents(c => ({ ...c, [target.id]: `${c[target.id] ?? target.content} [ALTERED]` }));
    pushAudit({
      ts: new Date().toISOString(),
      actor: "system",
      action: "evidence.simulate-tamper",
      result: `block 2 · ${target.id}`,
    });
  };

  const restore = () => {
    const map: Record<string, string> = {};
    items.forEach(i => (map[i.id] = i.content));
    setContents(map);
    setFlash(null);
    alerted.current = false;
    pushAudit({
      ts: new Date().toISOString(),
      actor: "INV-2041",
      action: "evidence.restore-chain",
      result: "VERIFIED",
    });
  };

  const custody = useMemo(() => {
    const sealed = items.map((ev, i) => ({
      ts: ev.timestamp,
      actor: i % 2 === 0 ? "INV-2041" : "INV-1188",
      action: `${ev.type} secured, hashed and sealed`,
      target: ev.id,
    }));
    const live = audit.slice(0, 6).map(a => ({
      ts: a.ts,
      actor: a.actor,
      action: a.action,
      target: a.result,
    }));
    return [...sealed, ...live].sort((a, b) => b.ts.localeCompare(a.ts));
  }, [items, audit]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CONSOLE / EVIDENCE"
        title="Evidence Integrity Chain"
        description="A real SHA-256 chain over every exhibit of the selected case. Change one character and every later block says so."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={caseId}
              onChange={e => setCaseId(e.target.value)}
              className="mono h-10 rounded-lg border border-white/10 bg-[#0B0F1A] px-3 text-xs text-white/85 focus:border-[#22D3EE]/60 focus:outline-none"
            >
              {cases.map(c => (
                <option key={c.id} value={c.id}>
                  {c.id} · {c.city}
                </option>
              ))}
            </select>
            <button
              onClick={tamper}
              className="mono inline-flex items-center gap-2 rounded-full border border-[#EF4444]/45 bg-[#EF4444]/10 px-4 py-2.5 text-[11px] font-bold tracking-[0.14em] text-[#EF4444] transition hover:bg-[#EF4444]/20"
            >
              <Zap className="h-3.5 w-3.5" />
              SIMULATE TAMPERING
            </button>
            <button
              onClick={restore}
              className="mono inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-[11px] font-bold tracking-[0.14em] text-white/70 transition hover:border-white/35 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              RESTORE
            </button>
          </div>
        }
      />

      {/* status */}
      <Panel
        className={`flex items-center gap-4 p-5 ${ver.valid ? "" : "alert-pulse border-[#EF4444]/50"}`}
      >
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
            ver.valid
              ? "border-[#22C55E]/40 bg-[#22C55E]/10 text-[#22C55E]"
              : "border-[#EF4444]/50 bg-[#EF4444]/12 text-[#EF4444]"
          }`}
        >
          {ver.valid ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
        </span>
        <div>
          <p
            className={`font-display text-lg font-bold ${ver.valid ? "text-[#22C55E]" : "text-[#EF4444]"}`}
          >
            {ver.valid ? "CHAIN VERIFIED" : "CHAIN INVALID"}
          </p>
          <p className="mono mt-0.5 text-[10px] tracking-wider text-white/45">
            {ver.valid
              ? `${blocks.length} BLOCKS · GENESIS ${GENESIS.slice(0, 12)}… · LAST SEAL VERIFIED`
              : ver.brokenAt !== null
                ? `FIRST DIVERGENCE AT BLOCK ${ver.brokenAt + 1} — ${items[ver.brokenAt]?.id}`
                : "HASH MISMATCH"}
          </p>
        </div>
      </Panel>

      {/* chain */}
      <Panel>
        <PanelTitle hint="HASH = SHA256(index | id | previous hash | content)">
          Chain for {caseId}
        </PanelTitle>
        <div className="flex items-stretch gap-0 overflow-x-auto p-5">
          {blocks.map((b, i) => {
            const ev = items[i];
            const style = EV_STYLE[(ev?.type ?? "FIR") as EvidenceType];
            const Icon = style.icon;
            const broken = ver.brokenAt !== null && i >= ver.brokenAt;
            const firstBroken = ver.brokenAt === i;
            return (
              <div key={b.id} className="flex items-center">
                <motion.div
                  animate={
                    flash === i
                      ? { x: [0, -5, 5, -3, 0], backgroundColor: ["rgba(239,68,68,0.25)", "rgba(239,68,68,0.08)"] }
                      : {}
                  }
                  transition={{ duration: 0.5 }}
                  className={`w-[240px] shrink-0 rounded-2xl border p-4 ${
                    broken
                      ? "border-[#EF4444]/50 bg-[#EF4444]/8"
                      : "border-white/8 bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="mono flex items-center gap-1.5 text-[10px] font-bold tracking-[0.16em]"
                      style={{ color: style.color }}
                    >
                      <Icon className="h-3.5 w-3.5" /> BLOCK {i + 1}
                    </span>
                    <span className="mono text-[9px] text-white/30">{b.id}</span>
                  </div>

                  <p className="mono mt-2 break-all text-[9px] leading-3 text-white/45">
                    PREV {b.prevHash === GENESIS ? "GENESIS" : `${b.prevHash.slice(0, 18)}…`}
                  </p>
                  <p className="mono mt-1 break-all text-[9px] leading-3 text-[#22C55E]">
                    HASH {b.hash.slice(0, 18)}…
                  </p>

                  {ev && (
                    <textarea
                      value={contents[ev.id] ?? ev.content}
                      onChange={e =>
                        setContents(c => ({ ...c, [ev.id]: e.target.value }))
                      }
                      rows={4}
                      className="mono mt-3 w-full resize-none rounded-lg border border-white/10 bg-black/40 p-2 text-[10px] leading-4 text-white/70 focus:border-[#22D3EE]/60 focus:outline-none"
                    />
                  )}

                  {firstBroken && ver.expected && ver.actual && (
                    <p className="mono mt-2 rounded-md border border-[#EF4444]/40 bg-black/40 p-2 text-[9px] leading-3 text-[#EF4444]">
                      HASH MISMATCH
                      <br />
                      EXPECTED {ver.expected.slice(0, 14)}…
                      <br />
                      CURRENT&nbsp; {ver.actual.slice(0, 14)}…
                    </p>
                  )}
                </motion.div>

                {i < blocks.length - 1 && (
                  <div className="relative h-px w-12 shrink-0 self-center bg-white/12">
                    <span
                      className={`absolute -top-[3px] h-1.5 w-1.5 rounded-full ${
                        broken ? "bg-[#EF4444]" : "animate-pulse bg-[#22C55E]"
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* custody */}
      <Panel>
        <PanelTitle hint="WHO TOUCHED WHAT, AND WHEN">Chain of custody</PanelTitle>
        <ul className="divide-y divide-white/6">
          {custody.map((c, i) => (
            <li key={`${c.ts}-${i}`} className="flex items-center gap-3 px-5 py-3">
              <span className="mono w-[132px] shrink-0 text-[10px] text-white/35">
                {c.ts.replace("T", " ")}
              </span>
              <span className="mono w-[86px] shrink-0 text-[10px] text-[#A78BFA]">{c.actor}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-white/70">{c.action}</span>
              <span className="mono shrink-0 text-[10px] text-[#22C55E]">{c.target}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}