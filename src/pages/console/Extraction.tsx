import { EmptyNote, PageHeader, Panel, PanelTitle } from "./ui";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Check,
  Copy,
  Info,
  Loader2,
  ScanText,
  X,
} from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";

const TYPE_META: Record<string, { label: string; color: string }> = {
  person: { label: "Person", color: "#F5F7FB" },
  phone: { label: "Phone", color: "#F59E0B" },
  location: { label: "Location", color: "#94A3B8" },
  bank: { label: "Bank account", color: "#22C55E" },
  upi: { label: "UPI", color: "#A3E635" },
  alias: { label: "Alias", color: "#A78BFA" },
};

export default function ExtractionPage() {
  const rows = useQuery(api.collection.pendingExtractions);
  const stats = useQuery(api.collection.extractionStats);
  const sources = useQuery(api.collection.listSources);
  const decide = useMutation(api.collection.decideExtraction);
  const decideMany = useMutation(api.collection.decideMany);

  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sourceName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sources ?? []) m.set(s.id as string, s.name);
    return m;
  }, [sources]);

  const visible = useMemo(() => {
    const list = rows ?? [];
    return typeFilter ? list.filter(r => r.entityType === typeFilter) : list;
  }, [rows, typeFilter]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulk = async (status: "approved" | "rejected") => {
    if (!selected.size) return;
    setBusy(true);
    try {
      await decideMany({ ids: Array.from(selected) as never[], status });
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  const dupCount = (rows ?? []).filter(r => r.duplicateOf).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Module 02"
        title="AI Data Processing"
        description="Candidate entities pulled from ingested sources. A reviewer approves or rejects each one — nothing enters the graph until a human decides."
        actions={
          <Link
            to="/console/network"
            className="mono inline-flex items-center gap-2 rounded-xl border border-white/12 px-4 py-2 text-[10px] font-bold tracking-[0.18em] text-white/60 transition hover:text-white"
          >
            OPEN GRAPH <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      {/* calibration notice — this must be impossible to miss */}
      <div className="flex items-start gap-3 rounded-2xl border border-[#F59E0B]/30 bg-[#F59E0B]/8 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />
        <p className="text-[11.5px] leading-relaxed text-white/65">
          <strong className="text-[#F59E0B]">What these percentages mean.</strong> A confidence
          score describes how strongly the source text matched a pattern — an exact 10-digit mobile
          format scores higher than a capitalised name pair. It is{" "}
          <strong className="text-white/85">not</strong> a probability of criminal involvement, and
          it is not a risk ranking. Approving a row adds the entity to the graph; it says nothing
          about the entity's conduct.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { k: "Pending", v: stats?.pending ?? 0, c: "#F59E0B" },
          { k: "Approved", v: stats?.approved ?? 0, c: "#22C55E" },
          { k: "Rejected", v: stats?.rejected ?? 0, c: "#EF4444" },
          { k: "Duplicates", v: stats?.duplicates ?? 0, c: "#A78BFA" },
          { k: "Total", v: stats?.total ?? 0, c: "#22D3EE" },
        ].map(m => (
          <Panel key={m.k} className="p-4">
            <p className="mono text-[9.5px] tracking-[0.22em] text-white/35 uppercase">{m.k}</p>
            <p className="mono mt-1.5 text-2xl font-bold" style={{ color: m.c }}>
              {m.v}
            </p>
          </Panel>
        ))}
      </div>

      <Panel>
        <PanelTitle hint={`${visible.length} rows`}>
          <span className="inline-flex items-center gap-2">
            <ScanText className="h-3.5 w-3.5 text-[#A78BFA]" /> AI extraction results
          </span>
        </PanelTitle>

        {/* filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/6 px-4 py-3">
          <FilterChip active={typeFilter === null} onClick={() => setTypeFilter(null)}>
            All types
          </FilterChip>
          {Object.entries(TYPE_META).map(([key, meta]) => {
            const n = (rows ?? []).filter(r => r.entityType === key).length;
            if (!n) return null;
            return (
              <FilterChip
                key={key}
                active={typeFilter === key}
                onClick={() => setTypeFilter(typeFilter === key ? null : key)}
                color={meta.color}
              >
                {meta.label} <span className="text-white/30">{n}</span>
              </FilterChip>
            );
          })}
          {selected.size > 0 && (
            <div className="mono ml-auto flex items-center gap-2 text-[9.5px]">
              <span className="text-white/40">{selected.size} selected</span>
              <button
                disabled={busy}
                onClick={() => void bulk("approved")}
                className="rounded-lg border border-[#22C55E]/40 bg-[#22C55E]/12 px-2.5 py-1 font-bold tracking-[0.1em] text-[#22C55E] transition hover:bg-[#22C55E]/22 disabled:opacity-40"
              >
                APPROVE
              </button>
              <button
                disabled={busy}
                onClick={() => void bulk("rejected")}
                className="rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/12 px-2.5 py-1 font-bold tracking-[0.1em] text-[#EF4444] transition hover:bg-[#EF4444]/22 disabled:opacity-40"
              >
                REJECT
              </button>
            </div>
          )}
        </div>

        {rows === undefined ? (
          <div className="flex items-center gap-2 p-6 text-xs text-white/40">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading extractions…
          </div>
        ) : visible.length === 0 ? (
          <div className="p-6">
            <EmptyNote>
              {(rows ?? []).length === 0
                ? "Nothing to review. Upload a source in Intelligence Collection and its extracted entities will appear here."
                : "Every extraction of this type has been decided. Nothing is waiting on you."}
            </EmptyNote>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem]">
              <thead>
                <tr className="mono border-b border-white/8 text-[9px] tracking-[0.18em] text-white/35 uppercase">
                  <th className="w-8 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.size === visible.length && visible.length > 0}
                      onChange={() =>
                        setSelected(
                          selected.size === visible.length
                            ? new Set()
                            : new Set(visible.map(v => v._id as string)),
                        )
                      }
                      className="h-3 w-3 accent-[#22D3EE]"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left">Entity</th>
                  <th className="px-3 py-2.5 text-left">Extracted value</th>
                  <th className="px-3 py-2.5 text-left">Confidence</th>
                  <th className="px-3 py-2.5 text-left">Source</th>
                  <th className="px-3 py-2.5 text-right">Decision</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(r => {
                  const meta = TYPE_META[r.entityType] ?? { label: r.entityType, color: "#94A3B8" };
                  const pct = Math.round(r.confidence * 100);
                  const open = expanded === r._id;
                  return (
                    <Fragment key={r._id}>
                      <tr className="border-b border-white/5 transition hover:bg-white/3">
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={selected.has(r._id as string)}
                            onChange={() => toggle(r._id as string)}
                            className="h-3 w-3 accent-[#22D3EE]"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="mono inline-flex items-center gap-1.5 text-[11px]">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: meta.color }}
                            />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => setExpanded(open ? null : (r._id as string))}
                            className="mono text-left text-[12px] text-white/85 hover:text-[#22D3EE]"
                          >
                            {r.value}
                          </button>
                          {r.duplicateOf && (
                            <span className="mono ml-2 inline-flex items-center gap-1 rounded border border-[#A78BFA]/40 bg-[#A78BFA]/10 px-1.5 py-0.5 text-[8.5px] text-[#A78BFA]">
                              <Copy className="h-2.5 w-2.5" /> DUPLICATE
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${pct}%`,
                                  background: pct >= 95 ? "#22C55E" : pct >= 85 ? "#F59E0B" : "#EF4444",
                                }}
                              />
                            </div>
                            <span className="mono text-[11px] text-white/65">{pct}%</span>
                          </div>
                        </td>
                        <td className="max-w-[12rem] px-3 py-2.5">
                          <span className="mono block truncate text-[10px] text-white/40">
                            {sourceName.get(r.sourceId as string) ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => void decide({ id: r._id as never, status: "approved" })}
                              className="rounded-md border border-[#22C55E]/35 bg-[#22C55E]/10 p-1.5 text-[#22C55E] transition hover:bg-[#22C55E]/25"
                              aria-label={`Approve ${r.value}`}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => void decide({ id: r._id as never, status: "rejected" })}
                              className="rounded-md border border-[#EF4444]/35 bg-[#EF4444]/10 p-1.5 text-[#EF4444] transition hover:bg-[#EF4444]/25"
                              aria-label={`Reject ${r.value}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      <AnimatePresence>
                        {open && (
                          <tr>
                            <td colSpan={6} className="border-b border-white/5 bg-black/30 px-3 py-0">
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="space-y-2 py-3">
                                  <p className="mono text-[9.5px] tracking-[0.18em] text-white/30 uppercase">
                                    Basis
                                  </p>
                                  <p className="text-[11px] text-white/60">{r.method}</p>
                                  <p className="mono rounded-lg border border-white/8 bg-black/40 p-2.5 text-[10.5px] leading-relaxed text-white/55">
                                    {r.evidence}
                                  </p>
                                  {r.duplicateOf && (
                                    <p className="flex items-center gap-1.5 text-[10.5px] text-[#A78BFA]">
                                      <AlertTriangle className="h-3 w-3" />
                                      Matches existing entity “{r.duplicateOf}” — approving may
                                      create a second node for the same thing.
                                    </p>
                                  )}
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {(stats?.approved ?? 0) > 0 && (
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="flex items-center gap-2 text-[11.5px] text-white/55">
            <BadgeCheck className="h-4 w-4 text-[#22C55E]" />
            {stats?.approved} approved entities are now available to the graph and the assistant.
          </p>
          <Link
            to="/console/network"
            className="mono inline-flex items-center gap-2 rounded-lg border border-[#22C55E]/40 bg-[#22C55E]/10 px-3 py-1.5 text-[9.5px] font-bold tracking-[0.16em] text-[#22C55E] transition hover:bg-[#22C55E]/20"
          >
            VIEW IN GRAPH <ArrowRight className="h-3 w-3" />
          </Link>
        </Panel>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  color,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`mono rounded-full border px-2.5 py-1 text-[9.5px] tracking-[0.12em] transition ${
        active
          ? "border-white/30 bg-white/10 text-white"
          : "border-white/8 text-white/45 hover:border-white/20 hover:text-white/70"
      }`}
      style={active && color ? { borderColor: `${color}66`, color } : undefined}
    >
      {children}
    </button>
  );
}
