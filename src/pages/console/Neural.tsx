import { motion } from "framer-motion";
import {
  BrainCircuit,
  Cpu,
  FileText,
  Loader2,
  Play,
  Radar,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AI_TASKS,
  createAiContext,
  draftIntelligenceReport,
  type AiTaskResult,
  type IntelligenceReport,
} from "@/lib/ai";
import { deriveGraph, EDGES } from "@/lib/data";
import {
  clusterEmbeddings,
  crossValidate,
  describeGnn,
  detectAnomalies,
  predictLinks,
  type CrossValidation,
} from "@/lib/gnn";
import { useVyuh } from "@/store/vyuh";
import { CountUp, EmptyNote, LevelBadge, Panel, PanelTitle, RiskBar } from "./ui";

const GROUPS = [
  { id: "graph", label: "Graph intelligence" },
  { id: "temporal", label: "Temporal" },
  { id: "intel", label: "Intelligence" },
  { id: "integrity", label: "Integrity" },
] as const;

function LossCurve({ curve }: { curve: number[] }) {
  if (curve.length < 2) return null;
  const w = 320;
  const h = 56;
  const max = Math.max(...curve, 1e-6);
  const min = Math.min(...curve);
  const span = max - min || 1;
  const pts = curve
    .map((v, i) => `${(i / (curve.length - 1)) * w},${h - ((v - min) / span) * (h - 6) - 3}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full" role="img" aria-label="Training loss curve">
      <polyline points={pts} fill="none" stroke="#22D3EE" strokeWidth="1.5" />
      <polyline
        points={`0,${h} ${pts} ${w},${h}`}
        fill="#22D3EE"
        fillOpacity="0.08"
        stroke="none"
      />
    </svg>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "#22D3EE",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#0B0F1A]/60 p-4">
      <p className="mono text-[10px] tracking-[0.22em] text-white/40 uppercase">{label}</p>
      <p className="mono mt-2 text-2xl font-bold" style={{ color: tone }}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-white/45">{sub}</p>}
    </div>
  );
}

export default function Neural() {
  const { cases, extraEntities, pushAudit } = useVyuh();
  const [running, setRunning] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("graph.reconstruct");
  const [result, setResult] = useState<AiTaskResult | null>(null);
  const [cv, setCv] = useState<CrossValidation | null>(null);
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [reportBusy, setReportBusy] = useState(false);

  const graph = useMemo(() => deriveGraph(cases, extraEntities), [cases, extraEntities]);
  const ctx = useMemo(
    () => createAiContext(graph.nodes, graph.edges.length ? graph.edges : EDGES, cases),
    [graph, cases],
  );
  const meta = useMemo(() => describeGnn(ctx.gnn), [ctx]);
  const clusters = useMemo(() => clusterEmbeddings(ctx.gnn, 4), [ctx]);
  const anomalies = useMemo(() => detectAnomalies(ctx.gnn, 5), [ctx]);
  const links = useMemo(() => predictLinks(ctx.gnn, { limit: 4, minScore: 0.5 }), [ctx]);

  const runTask = useCallback(
    async (id: string) => {
      const task = AI_TASKS.find(t => t.id === id);
      if (!task) return;
      setSelected(id);
      setRunning(id);
      try {
        setResult(await task.run(ctx));
      } finally {
        setRunning(null);
      }
    },
    [ctx],
  );

  const runValidation = useCallback(async () => {
    setRunning("graph.generalise");
    try {
      setCv(crossValidate(ctx.nodes, ctx.edges, ctx.cases, 5, { epochs: 160 }));
      setSelected("graph.generalise");
    } finally {
      setRunning(null);
    }
  }, [ctx]);

  const runReport = useCallback(async () => {
    setReportBusy(true);
    try {
      const draft = draftIntelligenceReport(ctx);
      setReport(draft);
      pushAudit({
        ts: new Date().toISOString(),
        actor: "system",
        action: "ai.report draft intelligence summary",
        result: `${ctx.gnn.dims.nodes} entities`,
      });
    } finally {
      setReportBusy(false);
    }
  }, [ctx, pushAudit]);

  useEffect(() => {
    if (!result) void runTask("graph.reconstruct");
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = running !== null;

  return (
    <div className="p-5 sm:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono text-[10px] tracking-[0.4em] text-[#22D3EE]">NEURAL ENGINE</p>
          <h1 className="font-display mt-2 text-3xl font-bold text-white sm:text-4xl">
            Graph intelligence
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/50">
            A graph convolutional network fitted to this corpus in your browser — ranking leads,
            proposing unrecorded relationships and drafting reports from its own outputs. Every
            number below is reproducible from the seed shown.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={runValidation}
            disabled={busy}
            className="mono inline-flex items-center gap-2 rounded-lg border border-white/12 bg-white/5 px-4 py-2 text-[11px] tracking-[0.18em] text-white/80 transition hover:border-[#A78BFA]/50 hover:text-white disabled:opacity-50"
          >
            {running === "graph.generalise" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-[#A78BFA]" />
            )}
            HELD-OUT VALIDATION
          </button>
          <button
            onClick={runReport}
            disabled={busy || reportBusy}
            className="mono inline-flex items-center gap-2 rounded-lg bg-[#22D3EE] px-4 py-2 text-[11px] font-bold tracking-[0.18em] text-[#04121a] transition hover:bg-[#67E8F9] disabled:opacity-50"
          >
            {reportBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            DRAFT REPORT
          </button>
        </div>
      </div>

      {/* Model card */}
      <Panel className="mb-6">
        <PanelTitle hint={`${meta.params} parameters · seed ${meta.seed}`}>
          Model
        </PanelTitle>
        <div className="grid gap-6 p-5 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="flex items-center gap-2 text-[#22D3EE]">
              <Cpu className="h-4 w-4" />
              <span className="mono text-xs tracking-[0.2em]">{meta.architecture}</span>
            </div>
            <p className="mono mt-2 text-[11px] text-white/45">{meta.aggregator}</p>
            <div className="mt-4">
              <p className="mono text-[10px] tracking-[0.22em] text-white/35 uppercase">
                Loss · {meta.finalLoss.toFixed(4)}
              </p>
              <LossCurve curve={ctx.gnn.lossCurve} />
            </div>
            <dl className="mono mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
              <dt className="text-white/40">Fit time</dt>
              <dd className="text-white/80">{meta.trainMs.toFixed(0)} ms</dd>
              <dt className="text-white/40">Nodes</dt>
              <dd className="text-white/80">{ctx.gnn.dims.nodes}</dd>
              <dt className="text-white/40">Features</dt>
              <dd className="text-white/80">{ctx.gnn.dims.features}</dd>
              <dt className="text-white/40">Heads</dt>
              <dd className="text-white/80">{ctx.gnn.headNames.join(", ")}</dd>
            </dl>
          </div>
          <div className="grid grid-cols-2 gap-3 self-start">
            <Metric
              label="escalation AUC"
              value={ctx.gnn.auc[0].toFixed(3)}
              sub={`${ctx.gnn.positives[0]} positives · in-sample`}
            />
            <Metric
              label="reuse AUC"
              value={ctx.gnn.auc[1].toFixed(3)}
              sub={`${ctx.gnn.positives[1]} positives · in-sample`}
              tone="#A78BFA"
            />
            <Metric
              label="link head AUC"
              value={ctx.gnn.linkAuc.toFixed(3)}
              sub={`held out · n=${ctx.gnn.linkTestSize}`}
              tone="#F59E0B"
            />
            <Metric
              label="communities"
              value={String(clusters.length)}
              sub={
                clusters.every(c => c.purity === 1)
                  ? "each matches one declared network"
                  : "mixed — inspect"
              }
              tone="#22C55E"
            />
          </div>
        </div>
      </Panel>

      {/* Validation banner */}
      <Panel className="mb-6">
        <PanelTitle
          hint={
            cv ? (
              <button
                onClick={() => setCv(null)}
                className="text-white/50 transition hover:text-white"
              >
                clear
              </button>
            ) : (
              "not yet run"
            )
          }
        >
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-[#A78BFA]" /> Held-out validation
          </span>
        </PanelTitle>
        {cv ? (
          <div className="p-5">
            <p className="text-sm text-white/60">
              Five-fold masked-label cross-validation. Each fold refits the network from scratch
              with a fifth of the labels hidden and scores only the hidden labels.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric
                label="pooled escalation AUC"
                value={cv.pooled.auc[0].toFixed(3)}
                sub={`${cv.pooled.labels} held-out labels · ${cv.pooled.positives[0]} positive`}
              />
              <Metric
                label="pooled reuse AUC"
                value={cv.pooled.auc[1].toFixed(3)}
                sub={`${cv.pooled.positives[1]} positive`}
                tone="#A78BFA"
              />
            </div>
            <p className="mono mt-4 text-[11px] leading-relaxed text-white/45">
              The reuse head is thin by construction — few instruments recur across FIRs in this
              corpus — so its score is a shortlist, not a finding. The in-sample numbers above are
              shown only for contrast.
            </p>
          </div>
        ) : (
          <EmptyNote>
            Run held-out validation to see the generalisation numbers, or pick the task below
          </EmptyNote>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        {/* Task runner */}
        <Panel className="h-fit">
          <PanelTitle hint={`${AI_TASKS.length} tasks`}>
            <span className="inline-flex items-center gap-2">
              <Play className="h-3.5 w-3.5 text-[#22D3EE]" /> Tasks
            </span>
          </PanelTitle>
          <div className="p-3">
            {GROUPS.map(g => (
              <div key={g.id} className="mb-3 last:mb-0">
                <p className="mono px-2 py-1.5 text-[10px] tracking-[0.22em] text-white/30 uppercase">
                  {g.label}
                </p>
                {AI_TASKS.filter(t => t.group === g.id).map(task => {
                  const active = selected === task.id;
                  const loading = running === task.id;
                  return (
                    <button
                      key={task.id}
                      onClick={() => void runTask(task.id)}
                      disabled={busy}
                      className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                        active ? "bg-[#22D3EE]/10 ring-1 ring-[#22D3EE]/40" : "hover:bg-white/5"
                      } disabled:opacity-60`}
                    >
                      {loading ? (
                        <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-[#22D3EE]" />
                      ) : (
                        <BrainCircuit
                          className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${active ? "text-[#22D3EE]" : "text-white/35"}`}
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block text-[12px] font-medium text-white/90">
                          {task.label}
                        </span>
                        <span className="mt-0.5 block text-[10.5px] leading-snug text-white/40">
                          {task.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </Panel>

        {/* Result */}
        <div className="space-y-6">
          <Panel>
            <PanelTitle hint={selected}>
              <span className="inline-flex items-center gap-2">
                <Radar className="h-3.5 w-3.5 text-[#A78BFA]" /> Output
              </span>
            </PanelTitle>
            {busy ? (
              <div className="flex flex-col items-center gap-3 px-5 py-14">
                <Loader2 className="h-6 w-6 animate-spin text-[#22D3EE]" />
                <p className="mono text-[11px] tracking-[0.25em] text-white/45">
                  COMPUTING · PROPAGATING OVER THE ENTITY GRAPH
                </p>
              </div>
            ) : !result ? (
              <EmptyNote>Select a task</EmptyNote>
            ) : (
              <motion.div
                key={selected}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="p-5"
              >
                <p className="font-display text-lg font-bold text-white">{result.headline}</p>
                <p className="mt-2 text-sm text-white/55">{result.detail}</p>

                {result.rows.length > 0 && (
                  <ul className="mt-5 space-y-3">
                    {result.rows.map(row => (
                      <li key={row.label} className="rounded-lg border border-white/6 bg-white/[0.02] p-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="mono truncate text-[11.5px] text-white/80">{row.label}</span>
                          <span className="mono shrink-0 text-[11.5px] text-[#22D3EE]">{row.value}</span>
                        </div>
                        {row.score !== undefined && <RiskBar value={row.score} className="mt-2" />}
                        {row.hint && (
                          <p className="mono mt-1.5 text-[10px] leading-relaxed text-white/40">
                            {row.hint}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {result.sections.map(s => (
                  <div key={s.heading} className="mt-5 border-t border-white/8 pt-4">
                    <p className="mono text-[10px] tracking-[0.22em] text-white/35 uppercase">
                      {s.heading}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-white/60">{s.body}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <PanelTitle hint="sorted by priority">
                <span className="inline-flex items-center gap-2">
                  <ScanSearch className="h-3.5 w-3.5 text-[#F59E0B]" /> Anomalies
                </span>
              </PanelTitle>
              <ul className="divide-y divide-white/6">
                {anomalies.map(a => (
                  <li key={a.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="mono truncate text-[11.5px] text-white/85">{a.label}</span>
                      <LevelBadge score={a.priority * 100} />
                    </div>
                    <p className="mono mt-1 text-[10px] text-white/40">{a.note}</p>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel>
              <PanelTitle hint="unrecorded">
                <span className="inline-flex items-center gap-2">
                  <BrainCircuit className="h-3.5 w-3.5 text-[#A78BFA]" /> Predicted edges
                </span>
              </PanelTitle>
              {links.length === 0 ? (
                <EmptyNote>No unrecorded pairs above threshold</EmptyNote>
              ) : (
                <ul className="divide-y divide-white/6">
                  {links.map(l => (
                    <li key={`${l.a}-${l.b}`} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="mono truncate text-[11.5px] text-white/85">
                          {l.aLabel} ↔ {l.bLabel}
                        </span>
                        <span className="mono shrink-0 text-[11px] text-[#A78BFA]">
                          {(l.score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="mono mt-1 text-[10px] text-white/40">request: {l.request}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </div>

      {/* Report */}
      {report && (
        <Panel className="mt-6">
          <PanelTitle
            hint={
              <button onClick={() => window.print()} className="text-white/50 hover:text-white">
                print
              </button>
            }
          >
            {report.title}
          </PanelTitle>
          <div className="space-y-5 p-6 text-sm leading-relaxed text-white/70">
            <p className="mono text-[10px] tracking-[0.2em] text-white/40 uppercase">
              {report.generatedBy} · prepared for {report.preparedFor}
            </p>
            {report.sections.map(s => (
              <section key={s.heading}>
                <h3 className="font-display text-base font-bold text-white">{s.heading}</h3>
                {s.paragraphs.map(p => (
                  <p key={p} className="mt-2">
                    {p}
                  </p>
                ))}
              </section>
            ))}
            <p className="rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/8 p-4 text-[12.5px] text-[#F59E0B]">
              {report.caveat}
            </p>
          </div>
        </Panel>
      )}

      <p className="mono mt-8 text-center text-[10px] tracking-[0.2em] text-white/25 uppercase">
        <CountUp to={ctx.gnn.dims.params + ctx.gnn.linkParams} /> parameters · trained locally ·
        no data leaves this browser
      </p>
    </div>
  );
}