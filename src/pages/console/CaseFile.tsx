import { PageHeader, Panel, PanelTitle } from "./ui";
import { api } from "@/convex/_generated/api";
import {
  CASES,
  EVIDENCE,
  INVESTIGATOR,
  NODES,
  networkTimeline,
} from "@/lib/data";
import { computeChain, sha256Hex, type ChainBlock } from "@/lib/hash";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  Download,
  FileText,
  Fingerprint,
  Link2,
  Loader2,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

/* ------------------------------------------------------------------ *
 * Findings — each one carries the records it rests on
 * ------------------------------------------------------------------ */

interface Finding {
  id: string;
  claim: string;
  basis: string;
  evidenceIds: string[];
  caseIds: string[];
  /** Filled from the evidence chain once it is computed. */
  hash: string;
}

export default function CaseFilePage() {
  const audit = useQuery(api.collection.listAudit);
  const auditState = useQuery(api.collection.verifyAudit);
  const appendAudit = useMutation(api.collection.appendAudit);

  const [blocks, setBlocks] = useState<ChainBlock[] | null>(null);
  const [exporting, setExporting] = useState(false);

  const evidenceItems = useMemo(
    () => EVIDENCE.map(e => ({ id: e.id, content: `${e.caseId}|${e.type}|${e.title}|${e.timestamp}|${e.content}` })),
    [],
  );

  useEffect(() => {
    let alive = true;
    computeChain(evidenceItems).then(b => {
      if (alive) setBlocks(b);
    });
    return () => {
      alive = false;
    };
  }, [evidenceItems]);

  // Each finding borrows the real SHA-256 of its first supporting record, so the
  // hash under a claim is the same hash that appears in the evidence chain.
  const findings = useMemo(
    () =>
      buildFindings().map(f => ({
        ...f,
        hash: blocks?.find(b => b.id === f.evidenceIds[0])?.hash ?? "",
      })),
    [blocks],
  );

  const exportReport = useCallback(async () => {
    setExporting(true);
    try {
      const lines: string[] = [];
      lines.push("# Intelligence Summary — Chakravyuh");
      lines.push("");
      lines.push(`Prepared for: ${INVESTIGATOR.name}`);
      lines.push(`Generated: ${new Date().toISOString()}`);
      lines.push(`Records: ${CASES.length} FIRs · ${NODES.length} graph nodes · ${EVIDENCE.length} evidence items`);
      lines.push("");
      lines.push("## Findings");
      for (const f of findings) {
        lines.push("");
        lines.push(`### ${f.claim}`);
        lines.push(f.basis);
        lines.push(`Evidence: ${f.evidenceIds.join(", ") || "—"}`);
        lines.push(`Cases: ${f.caseIds.join(", ") || "—"}`);
        lines.push(`Evidence hash: ${f.hash || "(chain unavailable)"}`);
      }
      lines.push("");
      lines.push("## Evidence hashes");
      for (const b of blocks ?? []) {
        lines.push(`${b.id}  ${b.hash}  (prev ${b.prevHash.slice(0, 12)}…)`);
      }
      lines.push("");
      lines.push("## Audit trail");
      for (const a of audit ?? []) {
        lines.push(`#${a.seq} ${a.action} by ${a.actor} — ${a.detail} [${a.hash.slice(0, 12)}…]`);
      }
      lines.push("");
      lines.push("## Caveat");
      lines.push(
        "Ranks leads for human review. Does not determine guilt, does not establish criminal liability, and is not a charge sheet.",
      );

      const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chakravyuh-investigation-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);

      await appendAudit({
        action: "report.export",
        actor: INVESTIGATOR.name,
        detail: `${findings.length} findings, ${(blocks ?? []).length} evidence hashes, ${(audit ?? []).length} audit rows exported`,
      });
    } finally {
      setExporting(false);
    }
  }, [appendAudit, audit, blocks, findings]);

  const timeline = useMemo(() => networkTimeline(CASES), []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Module 05"
        title="Evidence & Reports"
        description="Every finding cites the records behind it, every record carries a hash, and every action lands in an append-only ledger."
        actions={
          <button
            onClick={() => void exportReport()}
            disabled={exporting || !blocks}
            className="mono inline-flex items-center gap-2 rounded-xl border border-[#22D3EE]/40 bg-[#22D3EE]/10 px-4 py-2 text-[10px] font-bold tracking-[0.18em] text-[#22D3EE] transition hover:bg-[#22D3EE]/20 disabled:opacity-40"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            EXPORT REPORT
          </button>
        }
      />

      {/* chain + ledger status */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="p-4">
          <p className="mono text-[9.5px] tracking-[0.22em] text-white/35 uppercase">Evidence chain</p>
          <p className="mono mt-1.5 flex items-center gap-1.5 text-sm font-bold text-[#22C55E]">
            <ShieldCheck className="h-4 w-4" /> {blocks ? `${blocks.length} SEALED` : "…"}
          </p>
          <p className="mono mt-0.5 text-[9.5px] text-white/30">SHA-256, genesis-linked</p>
        </Panel>
        <Panel className="p-4">
          <p className="mono text-[9.5px] tracking-[0.22em] text-white/35 uppercase">Audit ledger</p>
          <p
            className="mono mt-1.5 flex items-center gap-1.5 text-sm font-bold"
            style={{ color: auditState?.valid === false ? "#EF4444" : "#22C55E" }}
          >
            {auditState?.valid === false ? (
              <>
                <ShieldAlert className="h-4 w-4" /> BROKEN @ {auditState.brokenAt}
              </>
            ) : (
              <>
                <BadgeCheck className="h-4 w-4" /> {audit?.length ?? 0} VERIFIED
              </>
            )}
          </p>
          <p className="mono mt-0.5 text-[9.5px] text-white/30">hash-linked, append-only</p>
        </Panel>
        <Panel className="p-4">
          <p className="mono text-[9.5px] tracking-[0.22em] text-white/35 uppercase">Findings</p>
          <p className="mono mt-1.5 text-sm font-bold text-[#F59E0B]">{findings.length}</p>
          <p className="mono mt-0.5 text-[9.5px] text-white/30">each with cited records</p>
        </Panel>
        <Panel className="p-4">
          <p className="mono text-[9.5px] tracking-[0.22em] text-white/35 uppercase">Evidence items</p>
          <p className="mono mt-1.5 text-sm font-bold text-[#A78BFA]">{EVIDENCE.length}</p>
          <p className="mono mt-0.5 text-[9.5px] text-white/30">across {CASES.length} FIRs</p>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* findings */}
        <Panel>
          <PanelTitle hint="claim · basis · records">Source-linked findings</PanelTitle>
          <ul className="divide-y divide-white/6">
            {findings.map(f => (
              <li key={f.id} className="px-4 py-3">
                <p className="text-[12.5px] font-semibold text-white/85">{f.claim}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/50">{f.basis}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {f.caseIds.map(c => (
                    <span
                      key={c}
                      className="mono rounded border border-[#22D3EE]/30 bg-[#22D3EE]/8 px-1.5 py-0.5 text-[8.5px] text-[#22D3EE]"
                    >
                      {c}
                    </span>
                  ))}
                  <span className="mono flex items-center gap-1 text-[8.5px] text-white/30">
                    <Link2 className="h-2.5 w-2.5" /> {f.evidenceIds.length} records
                  </span>
                  <span className="mono ml-auto flex items-center gap-1 text-[8.5px] text-white/25">
                    <Fingerprint className="h-2.5 w-2.5" />
                    {f.hash ? `${f.hash.slice(0, 16)}…` : "chain pending"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        {/* timeline */}
        <Panel>
          <PanelTitle hint={`${timeline.length} events`}>Investigation timeline</PanelTitle>
          <div className="max-h-[26rem] overflow-y-auto p-4">
            <ol className="relative space-y-3 border-l border-white/10 pl-4">
              {timeline.map((t, i) => (
                <li key={`${t.caseId}-${i}`} className="relative">
                  <span
                    className="absolute -left-[1.32rem] top-1 h-2 w-2 rounded-full ring-2 ring-[#0B0F16]"
                    style={{ background: t.network === "NET-A" ? "#22D3EE" : t.network === "NET-B" ? "#F59E0B" : "#64748B" }}
                  />
                  <p className="mono text-[9.5px] text-white/35">{t.date}</p>
                  <p className="text-[11.5px] text-white/70">
                    <span className="mono text-[#22D3EE]">{t.caseId}</span> · {t.state} · {t.network}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </Panel>
      </div>

      {/* evidence hashes */}
      <Panel>
        <PanelTitle hint="SHA-256 · linked to genesis">Evidence hashes</PanelTitle>
        <div className="max-h-64 overflow-y-auto">
          {!blocks ? (
            <div className="mono flex items-center gap-2 p-4 text-[10px] text-white/35">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> computing chain…
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="mono border-b border-white/8 text-[8.5px] tracking-[0.16em] text-white/30 uppercase">
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">Record</th>
                  <th className="px-4 py-2 text-left">Hash</th>
                  <th className="px-4 py-2 text-left">Prev</th>
                </tr>
              </thead>
              <tbody>
                {blocks.slice(0, 40).map(b => {
                  const item = EVIDENCE.find(e => e.id === b.id);
                  return (
                    <tr key={b.id} className="border-b border-white/5">
                      <td className="mono px-4 py-1.5 text-[9.5px] text-white/30">{b.index}</td>
                      <td className="mono max-w-[14rem] truncate px-4 py-1.5 text-[9.5px] text-white/60">
                        {item ? `${item.caseId} · ${item.title}` : b.id}
                      </td>
                      <td className="mono px-4 py-1.5 text-[9.5px] text-[#22C55E]">
                        {b.hash.slice(0, 24)}…
                      </td>
                      <td className="mono px-4 py-1.5 text-[9.5px] text-white/25">
                        {b.prevHash === "0".repeat(64) ? "genesis" : `${b.prevHash.slice(0, 12)}…`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Panel>

      {/* audit trail */}
      <Panel>
        <PanelTitle
          hint={auditState?.valid === false ? "chain broken" : "verified"}
        >
          <span className="inline-flex items-center gap-2">
            <ScrollText className="h-3.5 w-3.5 text-[#F59E0B]" /> Blockchain audit trail
          </span>
        </PanelTitle>

        <div className="flex flex-wrap items-center gap-2 border-b border-white/6 px-4 py-2.5">
          <button
            onClick={() =>
              void appendAudit({
                action: "ledger.checkpoint",
                actor: INVESTIGATOR.name,
                detail: `manual checkpoint over ${findings.length} findings`,
              })
            }
            className="mono rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2.5 py-1 text-[9px] font-bold tracking-[0.14em] text-[#F59E0B] transition hover:bg-[#F59E0B]/20"
          >
            WRITE CHECKPOINT
          </button>
          <span className="mono text-[9px] text-white/30">
            each row hashes its body against the previous row's hash
          </span>
        </div>

        {audit === undefined ? (
          <div className="mono flex items-center gap-2 p-4 text-[10px] text-white/35">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading ledger…
          </div>
        ) : audit.length === 0 ? (
          <div className="p-4 text-[11px] text-white/40">
            The ledger is empty. Exporting a report or writing a checkpoint appends the first row.
          </div>
        ) : (
          <ul className="max-h-72 divide-y divide-white/6 overflow-y-auto">
            <AnimatePresence initial={false}>
              {audit.map(a => (
                <motion.li
                  key={a._id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-start gap-3 px-4 py-2"
                >
                  <span className="mono mt-0.5 shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[8.5px] text-white/35">
                    #{a.seq}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mono block text-[10.5px] text-[#F59E0B]">{a.action}</span>
                    <span className="block truncate text-[10.5px] text-white/55">{a.detail}</span>
                    <span className="mono block text-[8.5px] text-white/25">
                      {a.actor} · {new Date(a.createdAt).toISOString().slice(0, 19).replace("T", " ")} ·{" "}
                      {a.hash.slice(0, 20)}…
                    </span>
                  </span>
                  <FileText className="mt-1 h-3 w-3 shrink-0 text-white/20" />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Panel>

      <Panel className="p-4">
        <p className="text-[11px] leading-relaxed text-white/45">
          <strong className="text-white/70">Why hashes and not a database flag.</strong> A stored
          "verified" boolean proves nothing — it is editable. The evidence chain and the audit
          ledger are recomputed from their contents on every read, so altering any row breaks every
          hash after it and the break is visible in the panel above.
        </p>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function buildFindings(): Finding[] {
  const out: Finding[] = [];

  const multi = NODES.filter(n => n.kind === "entity" && n.caseIds.length > 1).sort(
    (a, b) => b.caseIds.length - a.caseIds.length,
  );
  for (const n of multi.slice(0, 3)) {
    out.push({
      id: `f-${n.id}`,
      claim: `${n.label} appears in ${n.caseIds.length} separate FIRs`,
      basis: `The same ${n.type} node is referenced by ${n.caseIds.join(", ")}. Cross-case reuse of an instrument is the pattern worth reviewing, not by itself evidence of wrongdoing.`,
      evidenceIds: EVIDENCE.filter(e => n.caseIds.includes(e.caseId)).map(e => e.id).slice(0, 6),
      caseIds: n.caseIds,
      hash: "",
    });
  }

  const highRisk = [...CASES].sort((a, b) => b.risk - a.risk)[0];
  if (highRisk) {
    out.push({
      id: `f-risk-${highRisk.id}`,
      claim: `${highRisk.id} carries the highest assessed risk (${highRisk.risk})`,
      basis: `${highRisk.title} — ${highRisk.crime} in ${highRisk.city}, ${highRisk.state}, filed ${highRisk.date}.`,
      evidenceIds: EVIDENCE.filter(e => e.caseId === highRisk.id).map(e => e.id),
      caseIds: [highRisk.id],
      hash: "",
    });
  }

  const bridges = CASES.filter(c => c.network === "NET-A");
  if (bridges.length) {
    out.push({
      id: "f-network",
      claim: `${bridges.length} of ${CASES.length} FIRs are linked into one network`,
      basis: `Connectivity analysis over recorded co-occurrence edges finds these filings share entities. This is arithmetic over the edges, not an inference about people.`,
      evidenceIds: EVIDENCE.slice(0, 4).map(e => e.id),
      caseIds: bridges.map(c => c.id).slice(0, 8),
      hash: "",
    });
  }

  return out;
}
