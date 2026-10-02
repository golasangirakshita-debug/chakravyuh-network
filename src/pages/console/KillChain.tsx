import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, FileText, GitBranch, ShieldAlert } from "lucide-react";
import { EVIDENCE_BY_ID, KILL_CHAIN, NETWORKS, type NetworkId } from "@/lib/data";
import { PageHeader, Panel, PanelTitle, EmptyNote } from "./ui";

const NET_COLOR: Record<NetworkId, string> = {
  "NET-A": "#22D3EE",
  "NET-B": "#A78BFA",
  NOISE: "#6B7280",
};

export default function KillChainPage() {
  const [filter, setFilter] = useState<NetworkId | "ALL">("ALL");

  const stages = useMemo(
    () =>
      KILL_CHAIN.map(s => ({
        ...s,
        techniques: s.techniques.filter(t => filter === "ALL" || t.networks.includes(filter)),
      })).filter(s => s.techniques.length > 0),
    [filter],
  );

  const covered = stages.reduce(
    (acc, s) => acc + s.techniques.filter(t => !t.gap && t.evidence.length).length,
    0,
  );
  const gaps = stages.reduce((acc, s) => acc + s.techniques.filter(t => t.gap).length, 0);

  return (
    <div>
      <PageHeader
        eyebrow="MODELLING · ATTACK CHAIN"
        title="Kill Chain"
        description="Observed behaviour mapped to stages. Gaps are as valuable as hits — they are the next evidence requests."
        actions={
          <div className="mono flex flex-wrap items-center gap-2">
            {(["ALL", "NET-A", "NET-B", "NOISE"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg border px-3 py-1.5 text-[10px] font-bold tracking-[0.18em] transition ${
                  filter === f
                    ? "border-[#22D3EE]/50 bg-[#22D3EE]/12 text-[#22D3EE]"
                    : "border-white/12 bg-white/4 text-white/50 hover:text-white"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[
          { k: "Stages mapped", v: stages.length, c: "#22D3EE" },
          { k: "Techniques evidenced", v: covered, c: "#22C55E" },
          { k: "Open gaps", v: gaps, c: "#EF4444" },
        ].map(s => (
          <div
            key={s.k}
            className="rounded-2xl border border-white/8 bg-[#0B0F1A]/75 p-5"
          >
            <p className="mono text-[10px] tracking-[0.28em] text-white/35">{s.k}</p>
            <p
              className="mono mt-2 text-3xl font-bold"
              style={{ color: s.c }}
            >
              {String(s.v).padStart(2, "0")}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {stages.map((stage, si) => (
          <motion.div
            key={stage.stage}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: si * 0.05 }}
          >
            <Panel>
              <PanelTitle
                hint={
                  <span className="flex items-center gap-2">
                    <span className="mono text-white/50">STAGE {si + 1}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="mono text-white/70">STAGE {si + 2}</span>
                  </span>
                }
              >
                <span className="flex items-center gap-2">
                  <GitBranch className="h-3.5 w-3.5 text-[#22D3EE]" />
                  {stage.stage}
                </span>
              </PanelTitle>

              <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
                {stage.techniques.map(t => (
                  <div
                    key={t.id}
                    className={`rounded-xl border p-4 transition ${
                      t.gap
                        ? "border-dashed border-[#EF4444]/45 bg-[#EF4444]/6"
                        : "border-white/8 bg-black/25 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="mono text-[10px] tracking-[0.22em] text-white/35">{t.id}</p>
                      <div className="flex gap-1">
                        {t.networks.map(n => (
                          <span
                            key={n}
                            className="mono rounded px-1.5 py-0.5 text-[9px] font-bold"
                            style={{
                              color: NET_COLOR[n],
                              background: `${NET_COLOR[n]}1A`,
                              border: `1px solid ${NET_COLOR[n]}55`,
                            }}
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>

                    <h3 className="mt-2 font-display text-[15px] font-bold text-white">
                      {t.name}
                    </h3>

                    {t.gap && (
                      <p className="mono mt-2 flex items-start gap-1.5 text-[10px] leading-5 text-[#EF4444]">
                        <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
                        No evidence on file — lead requested
                      </p>
                    )}

                    {t.note && (
                      <p className="mt-2 text-[11px] leading-5 text-white/45">{t.note}</p>
                    )}

                    {t.evidence.length > 0 && (
                      <ul className="mono mt-3 space-y-1">
                        {t.evidence.map(ev => (
                          <li
                            key={ev}
                            className="flex items-center gap-1.5 truncate text-[10px] text-[#22C55E]"
                          >
                            <FileText className="h-3 w-3 shrink-0" />
                            {ev}
                            {EVIDENCE_BY_ID[ev] && (
                              <span className="truncate text-white/30">
                                · {EVIDENCE_BY_ID[ev].title}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          </motion.div>
        ))}

        {stages.length === 0 && <EmptyNote>No techniques for this network filter.</EmptyNote>}
      </div>

      <Panel className="mt-5 flex items-start gap-3 p-5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#F59E0B]" />
        <p className="text-xs leading-5 text-white/50">
          Techniques describe <span className="text-white/70">observed behaviour</span>, not intent.
          Attribution and charge decisions remain with the investigator and the court.
          {NETWORKS.length > 0 && (
            <span className="mono ml-1 text-white/30">
              ({NETWORKS.filter(n => n.id !== "NOISE").length} active networks in scope)
            </span>
          )}
        </p>
      </Panel>
    </div>
  );
}
