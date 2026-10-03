import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CalendarClock,
  CircleDot,
  Ghost as GhostIcon,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { GHOST_SEEDS, entityLabel } from "@/lib/data";
import { structuralHoles, temporalCadence, levelOf } from "@/lib/analysis";
import { useVyuh } from "@/store/vyuh";
import { PageHeader, Panel, PanelTitle, RiskBar, LevelBadge, EmptyNote } from "./ui";

const NET_IDS = ["NET-A", "NET-B"] as const;

export default function GhostPage() {
  const { cases, pushAudit } = useVyuh();
  const [adopted, setAdopted] = useState<Record<string, boolean>>({});

  const holes = useMemo(() => structuralHoles(cases), [cases]);
  const cadences = useMemo(
    () => NET_IDS.map(id => ({ id, ...temporalCadence(id, cases) })),
    [cases],
  );

  return (
    <div>
      <PageHeader
        eyebrow="AI ANALYSIS · HYPOTHESIS GENERATION"
        title="Ghost Nodes"
        description="Entities the evidence implies but does not yet contain. Every ghost is a request for more evidence — never a conclusion."
      />

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Panel>
            <PanelTitle hint={`${GHOST_SEEDS.length} analyst hypotheses`}>
              Analyst-authored ghosts
            </PanelTitle>
            <div className="divide-y divide-white/6">
              {GHOST_SEEDS.map((g, i) => {
                const on = !!adopted[g.id];
                return (
                  <motion.div
                    key={g.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07 }}
                    className="p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#A78BFA]/35 bg-[#A78BFA]/10 text-[#A78BFA]">
                          <GhostIcon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="mono text-[10px] tracking-[0.28em] text-[#A78BFA]">
                            {g.id} · {g.kind.toUpperCase()}
                          </p>
                          <h3 className="mt-1 font-display text-lg font-bold text-white">
                            {g.title}
                          </h3>
                          <p className="mt-1.5 max-w-xl text-sm leading-6 text-white/55">
                            {g.reason}
                          </p>
                        </div>
                      </div>
                      <LevelBadge score={g.confidence} />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-white/45">
                      <span className="mono rounded-md border border-white/10 bg-black/30 px-2 py-1">
                        {entityLabel(g.between[0])}
                      </span>
                      <ArrowRight className="h-3 w-3 text-[#A78BFA]" />
                      <span className="mono rounded-md border border-dashed border-[#A78BFA]/40 bg-[#A78BFA]/8 px-2 py-1 text-[#A78BFA]">
                        <CircleDot className="mr-1 inline h-3 w-3" />
                        missing node
                      </span>
                      <ArrowRight className="h-3 w-3 text-[#A78BFA]" />
                      <span className="mono rounded-md border border-white/10 bg-black/30 px-2 py-1">
                        {entityLabel(g.between[1])}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                        <p className="mono text-[9px] tracking-[0.24em] text-white/35">REQUEST</p>
                        <p className="mt-1 text-xs leading-5 text-white/70">{g.lead.request}</p>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                        <p className="mono text-[9px] tracking-[0.24em] text-white/35">WINDOW</p>
                        <p className="mt-1 text-xs leading-5 text-white/70">{g.lead.window}</p>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-black/25 p-3">
                        <p className="mono text-[9px] tracking-[0.24em] text-white/35">PAYOFF</p>
                        <p className="mt-1 text-xs leading-5 text-white/70">{g.lead.payoff}</p>
                      </div>
                    </div>

                    {g.predictedPlace && (
                      <p className="mono mt-3 flex items-center gap-2 text-[11px] text-[#F59E0B]">
                        <CalendarClock className="h-3.5 w-3.5" />
                        predicted corridor · {g.predictedPlace}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <RiskBar value={g.confidence} className="max-w-[220px]" />
                      <button
                        onClick={() => {
                          setAdopted(p => ({ ...p, [g.id]: !p[g.id] }));
                          pushAudit({
                            ts: new Date().toISOString(),
                            actor: "INV-2041",
                            action: `ghost.${adopted[g.id] ? "release" : "adopt"} ${g.id}`,
                            result: adopted[g.id] ? "RELEASED" : "REVIEW QUEUED",
                          });
                        }}
                        className={`mono ml-auto rounded-lg border px-3 py-1.5 text-[10px] font-bold tracking-[0.18em] transition ${
                          on
                            ? "border-[#22C55E]/45 bg-[#22C55E]/12 text-[#22C55E]"
                            : "border-white/12 bg-white/5 text-white/60 hover:border-white/25 hover:text-white"
                        }`}
                      >
                        <UserCheck className="mr-1.5 inline h-3 w-3" />
                        {on ? "In review queue" : "Send to human review"}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel>
            <PanelTitle hint="computed from the graph">Structural holes</PanelTitle>
            {holes.length === 0 ? (
              <EmptyNote>No neighbourhood overlap above threshold.</EmptyNote>
            ) : (
              <div className="divide-y divide-white/6">
                {holes.map(h => (
                  <div key={`${h.a}-${h.b}`} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="mono truncate text-[11px] text-white/70">
                        {entityLabel(h.a)} ↔ {entityLabel(h.b)}
                      </p>
                      <span className="mono text-[10px] text-[#F59E0B]">
                        {(h.jaccard * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="mono mt-1 truncate text-[10px] text-white/35">
                      via {h.shared.map(entityLabel).slice(0, 3).join(", ")}
                    </p>
                    <RiskBar value={h.jaccard * 100} className="mt-2" />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelTitle hint="temporal">Recurring cadence</PanelTitle>
            <div className="divide-y divide-white/6">
              {cadences.map(c => (
                <div key={c.id} className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <p className="mono text-[11px] tracking-[0.2em] text-white/70">{c.id}</p>
                    <LevelBadge level={levelOf(c.mode <= 2 ? 70 : 40)} score={c.mode * 10} />
                  </div>
                  <p className="mt-2 text-xs leading-5 text-white/55">
                    Modal gap <span className="mono text-white">{c.mode}d</span> · last seen{" "}
                    <span className="mono text-white">{c.lastDate}</span>
                  </p>
                  <p className="mono mt-1 text-[11px] text-[#22D3EE]">
                    next predicted · {c.nextPredicted}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="p-5">
            <Sparkles className="h-5 w-5 text-[#22D3EE]" />
            <p className="mt-3 text-sm leading-6 text-white/60">
              The platform proposes. An investigator disposes. Nothing here auto-files a
              report, charges a person, or closes a case.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
