import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Download, FileText, Printer, Scale } from "lucide-react";
import {
  CASES,
  CURRENCY,
  INVESTIGATOR,
  NETWORKS,
  TRANSACTIONS,
  formatDate,
} from "@/lib/data";
import { breachRanks, flagStory, structuralHoles } from "@/lib/analysis";
import { useVyuh } from "@/store/vyuh";
import { PageHeader, Panel, PanelTitle, LevelBadge } from "./ui";

const TEMPLATES = [
  { id: "briefing", label: "Network briefing", desc: "Executive summary of the linked network." },
  { id: "annexure", label: "Evidence annexure", desc: "Chain-of-custody listing for court." },
  { id: "lead", label: "Evidence lead request", desc: "One-page request to a teleoperator or bank." },
] as const;

type TemplateId = (typeof TEMPLATES)[number]["id"];

export default function ReportsPage() {
  const { cases, pushAudit } = useVyuh();
  const [template, setTemplate] = useState<TemplateId>("briefing");
  const story = useMemo(() => flagStory(cases), [cases]);
  const holes = useMemo(() => structuralHoles(cases), [cases]);
  const bridges = useMemo(() => breachRanks(cases).slice(0, 3), [cases]);
  const laundering = TRANSACTIONS.filter(t => t.amount >= 50000);
  const volume = TRANSACTIONS.reduce((n, t) => n + t.amount, 0);

  const lines: { heading: string; body: string }[] =
    template === "briefing"
      ? [
          {
            heading: "Situation",
            body: `${cases.length} FIRs across ${new Set(cases.map(c => c.state)).size} states resolve into ${
              new Set(cases.filter(c => c.network !== "NOISE").map(c => c.network)).size
            } organised networks. The strongest bridge is “${
              bridges[0]?.label ?? "n/a"
            }”, whose removal fragments the graph by ${bridges[0]?.fragments ?? 0} pieces.`,
          },
          {
            heading: "Earliest warning",
            body: `The network became visible on ${formatDate(story.flagDate)} when ${
              story.flaggedCases
            } FIRs spanned ${story.statesAtFlag} states — ${story.daysBeforeLast} day${
              story.daysBeforeLast === 1 ? "" : "s"
            } before the last linked FIR (${story.lastFir}) was filed.`,
          },
          {
            heading: "Financial exposure",
            body: `₹${volume.toLocaleString("en-IN")} moved across ${TRANSACTIONS.length} traced transactions, of which ${
              laundering.length
            } exceed ₹50,000.`,
          },
          {
            heading: "Open leads",
            body: `${holes.length} structural holes remain. Each is an evidence request, not a conclusion.`,
          },
        ]
      : template === "annexure"
        ? [
            { heading: "Scope", body: `Cases in scope: ${cases.map(c => c.id).join(", ")}.` },
            {
              heading: "Custody",
              body: "Every listed item is hashed on entry. Alteration breaks the chain at the first mismatched block and the report is void.",
            },
            {
              heading: "Disclaimer",
              body: "Association in a graph is not proof of criminality. This annexure lists pointers for verification.",
            },
          ]
        : [
            {
              heading: "Request",
              body: "Obtain call detail records for the tower and window identified in the ghost-node hypothesis, under the applicable process.",
            },
            { heading: "Justification", body: "Predicted window derived from the observed 3–4 day cadence in the network." },
            { heading: "Sign-off", body: `${INVESTIGATOR.name} · ${INVESTIGATOR.badge} · ${INVESTIGATOR.station}` },
          ];

  return (
    <div>
      <PageHeader
        eyebrow="OUTPUT · COURT-ADMISSIBLE FORMAT"
        title="Reports"
        description="Drafts generated from the live case corpus. Every draft is hashed and audited the moment it is produced."
        actions={
          <>
            <button
              onClick={() => window.print()}
              className="mono flex items-center gap-2 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-[10px] font-bold tracking-[0.18em] text-white/70 transition hover:border-white/30 hover:text-white"
            >
              <Printer className="h-3.5 w-3.5" /> PRINT
            </button>
            <button
              onClick={() =>
                pushAudit({
                  ts: new Date().toISOString(),
                  actor: INVESTIGATOR.badge,
                  action: `report.generate ${template}`,
                  result: `${cases.length} cases · draft`,
                })
              }
              className="mono flex items-center gap-2 rounded-lg bg-[#22D3EE] px-3 py-2 text-[10px] font-bold tracking-[0.18em] text-black transition hover:brightness-110"
            >
              <Download className="h-3.5 w-3.5" /> GENERATE
            </button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <Panel>
            <PanelTitle>Templates</PanelTitle>
            <div className="divide-y divide-white/6">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`flex w-full items-start gap-3 px-5 py-3.5 text-left transition ${
                    template === t.id ? "bg-[#22D3EE]/8" : "hover:bg-white/4"
                  }`}
                >
                  <FileText
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      template === t.id ? "text-[#22D3EE]" : "text-white/30"
                    }`}
                  />
                  <span>
                    <span className="block text-xs font-semibold text-white">{t.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-white/40">
                      {t.desc}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelTitle>Case register</PanelTitle>
            <div className="max-h-[320px] divide-y divide-white/6 overflow-y-auto">
              {[...cases]
                .sort((a, b) => a.date.localeCompare(b.date))
                .map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="mono truncate text-[11px] text-white/65">
                      {c.id} · {c.city}
                    </span>
                    <LevelBadge score={c.risk} />
                  </div>
                ))}
            </div>
          </Panel>
        </div>

        <motion.div
          key={template}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Panel className="p-8 print:p-0 print:border-0 print:bg-white">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="mono text-[10px] tracking-[0.34em] text-[#22D3EE]">
                  CHAKRAVYUH · {TEMPLATES.find(t => t.id === template)?.label.toUpperCase()}
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold text-white">
                  {NETWORKS[0].label}
                </h2>
                <p className="mono mt-1 text-[11px] text-white/40">
                  {INVESTIGATOR.name} · {INVESTIGATOR.badge} · {INVESTIGATOR.unit}
                </p>
              </div>
              <span className="mono shrink-0 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[10px] tracking-[0.2em] text-white/40">
                DRAFT · {formatDate(new Date().toISOString().slice(0, 10))}
              </span>
            </div>

            <div className="mt-6 space-y-5">
              {lines.map(l => (
                <section key={l.heading}>
                  <h3 className="mono text-[10px] font-bold tracking-[0.28em] text-white/45 uppercase">
                    {l.heading}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-white/75">{l.body}</p>
                </section>
              ))}
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/8 bg-black/25 p-4">
                <p className="mono text-[9px] tracking-[0.24em] text-white/35">VOLUME</p>
                <p className="mono mt-1 text-lg font-bold text-[#22C55E]">
                  {CURRENCY(volume)}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/25 p-4">
                <p className="mono text-[9px] tracking-[0.24em] text-white/35">OPEN LEADS</p>
                <p className="mono mt-1 text-lg font-bold text-[#A78BFA]">{holes.length}</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/25 p-4">
                <p className="mono text-[9px] tracking-[0.24em] text-white/35">CASES</p>
                <p className="mono mt-1 text-lg font-bold text-[#22D3EE]">{cases.length}</p>
              </div>
            </div>

            <div className="mt-8 flex items-start gap-3 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/8 p-4">
              <Scale className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />
              <p className="text-[11px] leading-5 text-white/55">
                This document ranks leads for human review. It does not determine guilt and is
                not a charge sheet. Every link shown must be independently verified before it is
                placed before a magistrate. Base dataset: {CASES.length} synthetic FIRs.
              </p>
            </div>
          </Panel>
        </motion.div>
      </div>
    </div>
  );
}
