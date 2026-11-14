import { EmptyNote, PageHeader, Panel, PanelTitle } from "./ui";
import { api } from "@/convex/_generated/api";
import { ENTITIES } from "@/lib/data";
import { ingestFile, normalizeValue, type SourceKind } from "@/lib/ingest";
import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  CloudUpload,
  FileText,
  Fingerprint,
  Loader2,
  PhoneCall,
  Radar,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

const KINDS: { key: SourceKind; label: string; hint: string; icon: typeof FileText; accept: string; color: string }[] = [
  {
    key: "fir",
    label: "FIR / complaint",
    hint: "PDF or text of a First Information Report",
    icon: FileText,
    accept: ".pdf,.txt",
    color: "#22D3EE",
  },
  {
    key: "cdr",
    label: "Call detail record",
    hint: "CSV export with phone / tower / duration columns",
    icon: PhoneCall,
    accept: ".csv,.txt,.json",
    color: "#F59E0B",
  },
  {
    key: "financial",
    label: "Financial record",
    hint: "Statement or ledger export — amount / from / to",
    icon: Banknote,
    accept: ".csv,.txt,.json",
    color: "#22C55E",
  },
  {
    key: "osint",
    label: "OSINT finding",
    hint: "Authorised open-source notes, JSON or plain text",
    icon: Radar,
    accept: ".txt,.json,.csv",
    color: "#A78BFA",
  },
];

type QueueRow = {
  key: string;
  name: string;
  kind: SourceKind;
  phase: "reading" | "storing" | "done" | "failed";
  entities?: number;
  message?: string;
};

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  received: { color: "#64748B", label: "RECEIVED" },
  parsing: { color: "#F59E0B", label: "PARSING" },
  extracted: { color: "#22C55E", label: "EXTRACTED" },
  failed: { color: "#EF4444", label: "FAILED" },
};

export default function CollectionPage() {
  const sources = useQuery(api.collection.listSources);
  const ingestSource = useMutation(api.collection.ingestSource);
  const removeSource = useMutation(api.collection.removeSource);
  const extractModel = useAction(api.assistant.extract);

  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [activeKind, setActiveKind] = useState<SourceKind | null>(null);
  const [dragging, setDragging] = useState(false);
  const [openSource, setOpenSource] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const known = useMemo(
    () => ENTITIES.map(e => ({ label: e.label, type: e.type as string })),
    [],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[], forcedKind: SourceKind | null) => {
      for (const file of Array.from(files)) {
        const key = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const guess = forcedKind ?? inferKind(file.name);
        setQueue(q => [...q, { key, name: file.name, kind: guess, phase: "reading" }]);

        try {
          const out = await ingestFile(file, known);
          const kind = forcedKind ?? out.kind;

          // Optional model pass. It only ever adds rows whose value appears
          // verbatim in the source, so it cannot introduce an invented entity.
          let entities = out.entities;
          if (out.characters > 40) {
            try {
              const model = await extractModel({ text: out.text });
              entities = mergeEntities(out.entities, model.entities ?? []);
            } catch {
              /* model unavailable — the deterministic rows stand on their own */
            }
          }
          setQueue(q => q.map(r => (r.key === key ? { ...r, kind, phase: "storing" } : r)));

          await ingestSource({
            name: file.name,
            kind,
            bytes: file.size,
            rows: out.rows.length,
            characters: out.characters,
            note: out.note,
            digest: out.digest,
            error: out.characters === 0 && out.entities.length === 0 ? "No readable content recovered" : undefined,
            entities: entities.map(e => ({
              entityType: e.entityType,
              value: e.value,
              normalized: e.normalized,
              confidence: e.confidence,
              evidence: e.evidence,
              method: e.method,
              duplicateOf: e.duplicateOf,
            })),
          });

          setQueue(q =>
            q.map(r => (r.key === key ? { ...r, phase: "done", entities: entities.length } : r)),
          );
        } catch (err) {
          setQueue(q =>
            q.map(r =>
              r.key === key ? { ...r, phase: "failed", message: (err as Error).message.slice(0, 120) } : r,
            ),
          );
        }
      }
    },
    [extractModel, ingestSource, known],
  );

  const detail = useQuery(
    api.collection.sourceDetail,
    openSource ? { sourceId: openSource as never } : "skip",
  );

  const totals = (sources ?? []).reduce(
    (acc, s) => ({
      files: acc.files + 1,
      rows: acc.rows + s.rows,
      extracted: acc.extracted + s.extracted,
      pending: acc.pending + s.pending,
    }),
    { files: 0, rows: 0, extracted: 0, pending: 0 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Module 01"
        title="Intelligence Collection"
        description="Everything that enters the investigation passes through here. Files are parsed in your browser; only the derived text, hashes and extracted entities are stored."
        actions={
          <Link
            to="/console/extraction"
            className="mono inline-flex items-center gap-2 rounded-xl border border-[#22D3EE]/40 bg-[#22D3EE]/10 px-4 py-2 text-[10px] font-bold tracking-[0.18em] text-[#22D3EE] transition hover:bg-[#22D3EE]/20"
          >
            REVIEW EXTRACTIONS <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      {/* stat row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { k: "Sources", v: totals.files, c: "#22D3EE", d: "artefacts ingested" },
          { k: "Data rows", v: totals.rows, c: "#F59E0B", d: "structured records parsed" },
          { k: "Entities", v: totals.extracted, c: "#A78BFA", d: "candidates proposed" },
          { k: "Awaiting review", v: totals.pending, c: "#34D399", d: "need a decision" },
        ].map(m => (
          <Panel key={m.k} className="p-4">
            <p className="mono text-[9.5px] tracking-[0.24em] text-white/35 uppercase">{m.k}</p>
            <p className="mono mt-1.5 text-2xl font-bold" style={{ color: m.c }}>
              {m.v}
            </p>
            <p className="mono mt-0.5 text-[9.5px] text-white/30">{m.d}</p>
          </Panel>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* uploader */}
        <Panel>
          <PanelTitle hint="browser-side parse">Upload</PanelTitle>
          <div className="p-5">
            <div
              onDragOver={e => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files, activeKind);
              }}
              onClick={() => inputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${
                dragging
                  ? "border-[#22D3EE] bg-[#22D3EE]/8"
                  : "border-white/12 bg-black/20 hover:border-white/25"
              }`}
            >
              <CloudUpload className="mx-auto h-8 w-8 text-[#22D3EE]" />
              <p className="mt-3 text-sm font-semibold text-white/85">
                Drop a file, or click to choose
              </p>
              <p className="mono mt-1.5 text-[10px] text-white/35">
                PDF · CSV · JSON · TXT — parsed locally, never uploaded raw
              </p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,.csv,.json,.txt"
                className="hidden"
                onChange={e => {
                  if (e.target.files?.length) void handleFiles(e.target.files, activeKind);
                  e.target.value = "";
                }}
              />
            </div>

            <p className="mono mt-5 text-[9.5px] tracking-[0.24em] text-white/35 uppercase">
              Force a source type (optional)
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {KINDS.map(k => {
                const Icon = k.icon;
                const on = activeKind === k.key;
                return (
                  <button
                    key={k.key}
                    onClick={() => setActiveKind(on ? null : k.key)}
                    className={`flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition ${
                      on
                        ? "border-white/30 bg-white/8"
                        : "border-white/8 bg-black/20 hover:border-white/20"
                    }`}
                  >
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: k.color }} />
                    <span className="min-w-0">
                      <span className="block text-[11.5px] font-semibold text-white/85">{k.label}</span>
                      <span className="mono block text-[9px] leading-tight text-white/35">{k.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence>
              {queue.length > 0 && (
                <motion.ul
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-5 space-y-1.5 overflow-hidden"
                >
                  {queue.map(r => (
                    <li
                      key={r.key}
                      className="mono flex items-center gap-2 rounded-lg border border-white/8 bg-black/25 px-3 py-2 text-[10.5px]"
                    >
                      {r.phase === "done" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#22C55E]" />
                      ) : r.phase === "failed" ? (
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-[#EF4444]" />
                      ) : (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#F59E0B]" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-white/75">{r.name}</span>
                      <span className="text-white/35">
                        {r.phase === "reading" && "parsing…"}
                        {r.phase === "storing" && "storing…"}
                        {r.phase === "done" && `${r.entities ?? 0} entities`}
                        {r.phase === "failed" && (r.message ?? "failed")}
                      </span>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </Panel>

        {/* ingestion status */}
        <Panel>
          <PanelTitle hint={`${sources?.length ?? 0} sources`}>Ingestion status</PanelTitle>
          <div className="max-h-[30rem] overflow-y-auto">
            {sources === undefined ? (
              <div className="flex items-center gap-2 p-5 text-xs text-white/40">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading sources…
              </div>
            ) : sources.length === 0 ? (
              <div className="p-5">
                <EmptyNote>
                  No sources yet. Upload an FIR, CDR export, financial record or OSINT note to
                  begin.
                </EmptyNote>
              </div>
            ) : (
              <ul className="divide-y divide-white/6">
                {sources.map(s => {
                  const st = STATUS_STYLE[s.status] ?? STATUS_STYLE.received;
                  const open = openSource === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => setOpenSource(open ? null : s.id)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-white/4"
                      >
                        <span
                          className="mono mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.1em]"
                          style={{ color: st.color, borderColor: `${st.color}55`, background: `${st.color}18` }}
                        >
                          {st.label}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-semibold text-white/85">
                            {s.name}
                          </span>
                          <span className="mono mt-0.5 block text-[9.5px] text-white/35">
                            {s.kind.toUpperCase()} · {s.rows} rows · {s.extracted} entities ·{" "}
                            {s.pending} pending
                          </span>
                        </span>
                        {s.error && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#EF4444]" />}
                      </button>

                      <AnimatePresence>
                        {open && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden border-t border-white/6 bg-black/25"
                          >
                            <div className="space-y-2 px-4 py-3">
                              <div className="mono flex items-center gap-1.5 text-[9.5px] text-white/40">
                                <Fingerprint className="h-3 w-3" />
                                <span className="truncate">sha256 {s.digest || "unavailable"}</span>
                              </div>
                              <p className="text-[11px] leading-relaxed text-white/55">{s.note}</p>
                              {s.error && (
                                <p className="text-[11px] text-[#EF4444]">{s.error}</p>
                              )}
                              <div className="flex flex-wrap gap-3 pt-1">
                                <Link
                                  to="/console/extraction"
                                  className="mono text-[9.5px] tracking-[0.14em] text-[#22D3EE] hover:underline"
                                >
                                  REVIEW {s.pending} PENDING →
                                </Link>
                                <button
                                  onClick={() => void removeSource({ sourceId: s.id as never })}
                                  className="mono inline-flex items-center gap-1 text-[9.5px] tracking-[0.14em] text-white/30 transition hover:text-[#EF4444]"
                                >
                                  <Trash2 className="h-3 w-3" /> DISCARD
                                </button>
                              </div>
                              {detail && detail.source._id === s.id && (
                                <ul className="mono mt-2 space-y-1 border-t border-white/6 pt-2 text-[9.5px] text-white/45">
                                  {detail.extractions.slice(0, 6).map(e => (
                                    <li key={e._id} className="flex justify-between gap-3">
                                      <span className="truncate">
                                        {e.entityType} · {e.value}
                                      </span>
                                      <span className="shrink-0 text-white/30">
                                        {(e.confidence * 100).toFixed(0)}%
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Panel>
      </div>

      <Panel className="p-4">
        <p className="text-[11px] leading-relaxed text-white/45">
          <strong className="text-white/70">How files are handled.</strong> Parsing happens in this
          browser tab. The original binary is not transmitted — only the recovered text length, a
          SHA-256 digest, and the extracted entity candidates with the substring each came from.
          Extraction confidence describes pattern-match strength only; it is not a judgment about
          any person.
        </p>
      </Panel>
    </div>
  );
}

/**
 * Combine deterministic rows with model proposals.
 * A model row is dropped when the deterministic pass already found the same
 * normalised value, so the table never shows the same entity twice under two
 * different confidences.
 */
function mergeEntities(
  base: Awaited<ReturnType<typeof ingestFile>>["entities"],
  extra: { entityType: string; value: string; confidence: number; evidence: string; method: string }[],
) {
  const seen = new Set(base.map(e => `${e.entityType}::${e.normalized}`));
  const merged = [...base];
  for (const e of extra) {
    const type = e.entityType as (typeof base)[number]["entityType"];
    const normalized = normalizeValue(type, e.value);
    const key = `${type}::${normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      entityType: type,
      value: e.value,
      normalized,
      confidence: e.confidence,
      evidence: e.evidence,
      method: e.method,
    });
  }
  return merged.sort((a, b) => b.confidence - a.confidence);
}

function inferKind(name: string): SourceKind {
  const n = name.toLowerCase();
  if (/cdr|call|tower/.test(n)) return "cdr";
  if (/txn|transaction|ledger|statement|bank/.test(n)) return "financial";
  if (/fir|complaint|case/.test(n)) return "fir";
  return "osint";
}
