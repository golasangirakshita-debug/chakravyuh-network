import { useVyuh } from "@/store/vyuh";
import {
  deriveGraph,
  kpis,
  NETWORKS,
  formatDate,
} from "@/lib/data";
import { flagStory } from "@/lib/analysis";
import { ArrowUpRight, Radio, Waypoints } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import IndiaMap from "./IndiaMap";
import { CountUp, LevelBadge, PageHeader, Panel, PanelTitle, RiskBar } from "./ui";

const AMBIENT_FEED = [
  { actor: "system", action: "entity.resolve batch", result: "3 links confirmed" },
  { actor: "INV-1188", action: "evidence.view EV-008-BANK", result: "OK" },
  { actor: "system", action: "integrity.scan chain", result: "VERIFIED" },
  { actor: "INV-2041", action: "query index=cdr | stats count by tower", result: "12 events" },
  { actor: "system", action: "ingest cdr batch", result: "42 events" },
  { actor: "INV-1188", action: "case.open CR-006", result: "OK" },
  { actor: "system", action: "ghost.refresh structural-holes", result: "3 hypotheses" },
  { actor: "INV-2041", action: "network.replay set 18-Jun", result: "OK" },
];

export default function DashboardPage() {
  const { cases, extraEntities, integrity, audit, pushAudit, session } = useVyuh();
  const [tick, setTick] = useState(0);

  const graph = useMemo(() => deriveGraph(cases, extraEntities), [cases, extraEntities]);
  const stats = useMemo(() => kpis(cases), [cases]);
  const story = useMemo(() => flagStory(cases), [cases]);

  const entityCount = graph.nodes.filter(n => n.kind === "entity").length;

  // live audit feed — a new line every few seconds
  useEffect(() => {
    const id = window.setInterval(() => {
      setTick(t => t + 1);
    }, 4500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (tick === 0) return;
    const line = AMBIENT_FEED[tick % AMBIENT_FEED.length];
    pushAudit({ ts: new Date().toISOString(), ...line });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const kpiCards = [
    { label: "Cases", value: stats.cases, sub: "in corpus" },
    { label: "Entities", value: entityCount, sub: "phones · accounts · people" },
    { label: "Cross-state links", value: stats.crossStateLinks, sub: "shared across borders" },
    { label: "Active networks", value: stats.activeNetworks, sub: "under analysis" },
    { label: "Integrity alerts", value: integrity.valid ? 0 : 1, sub: "chain status", warn: !integrity.valid },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CONSOLE / DASHBOARD"
        title={`Good evening, ${session?.name ?? "Insp. R. Menon"}`}
        description="Live posture of the 12-case corpus. Everything below is computed from /lib/data.ts — scores are investigative signals, not findings of guilt."
        actions={
          <Link
            to="/console/network"
            className="mono inline-flex items-center gap-2 rounded-full border border-[#22D3EE]/40 bg-[#22D3EE]/10 px-4 py-2 text-[11px] font-bold tracking-[0.16em] text-[#22D3EE] transition hover:bg-[#22D3EE]/20"
          >
            OPEN NETWORK GRAPH
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      {/* ---- KPI row ---- */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {kpiCards.map((k, i) => (
          <Panel key={k.label} className="relative overflow-hidden p-5">
            <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#22D3EE]/50 to-transparent" />
            <p className="mono text-[10px] tracking-[0.26em] text-white/40 uppercase">
              {k.label}
            </p>
            <p
              className={`mt-3 font-display text-4xl font-bold ${
                k.warn ? "text-[#EF4444]" : "text-white"
              }`}
            >
              <CountUp to={k.value} duration={1100 + i * 160} />
            </p>
            <p className="mt-1 text-[11px] text-white/35">{k.sub}</p>
          </Panel>
        ))}
      </div>

      {/* ---- flag story ---- */}
      <Panel className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(700px_200px_at_10%_0%,rgba(34,211,238,0.12),transparent_70%)]" />
        <div className="relative flex flex-wrap items-center gap-6 p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#22D3EE]/30 bg-[#22D3EE]/10 text-[#22D3EE]">
            <Waypoints className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="mono text-[10px] tracking-[0.3em] text-[#22D3EE]">
              THE MOMENT IT CLICKS
            </p>
            <p className="mt-2 font-display text-xl font-bold leading-7 text-white sm:text-2xl">
              CHAKRAVYUH would have flagged this network{" "}
              <span className="text-gradient">{story.daysEarly} days before the 4th FIR</span>,
              across {story.statesAtFlag} states — on {formatDate(story.flagDate)}.
            </p>
          </div>
          <Link
            to="/console/network"
            className="mono rounded-full border border-white/15 px-4 py-2 text-[11px] tracking-[0.16em] text-white/70 transition hover:border-white/40 hover:text-white"
          >
            SEE THE REPLAY →
          </Link>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_1fr]">
        {/* ---- map ---- */}
        <Panel>
          <PanelTitle hint="PULSING MARKERS · ANIMATED CROSS-CASE ARCS">
            India — cases & links
          </PanelTitle>
          <div className="p-4">
            <IndiaMap height={520} />
          </div>
        </Panel>

        <div className="space-y-6">
          {/* ---- high-risk networks ---- */}
          <Panel>
            <PanelTitle hint="COMPOSITE RISK">High-Risk Networks</PanelTitle>
            <ul>
              {NETWORKS.filter(n => n.id !== "NOISE").map(n => {
                const netCases = cases.filter(c => c.network === n.id);
                const states = new Set(netCases.map(c => c.state)).size;
                return (
                  <li key={n.id}>
                    <Link
                      to={`/console/network?net=${n.id}`}
                      className="group flex items-center gap-4 border-b border-white/6 px-5 py-4 transition hover:bg-white/[0.03]"
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                        style={{
                          borderColor: `${n.color}55`,
                          background: `${n.color}14`,
                          color: n.color,
                        }}
                      >
                        <Radio className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                          {n.id === "NET-A" ? "NETWORK A — “Ravi” ring" : "NETWORK B — loan-app fraud"}
                        </p>
                        <p className="mono mt-0.5 text-[10px] tracking-widest text-white/40">
                          {netCases.length} CASES · {states} STATES · {n.kind.toUpperCase()}
                        </p>
                        <RiskBar value={n.risk} className="mt-2" />
                      </div>
                      <div className="text-right">
                        <LevelBadge level={n.risk >= 85 ? "CRITICAL" : "HIGH"} />
                        <p className="mono mt-1.5 font-display text-2xl font-bold text-white">
                          {n.risk}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mono px-5 py-3 text-[9px] leading-4 tracking-[0.14em] text-white/30">
              INVESTIGATIVE SCORE FOR HUMAN REVIEW. NOT A FINDING OF GUILT.
            </p>
          </Panel>

          {/* ---- live audit feed ---- */}
          <Panel>
            <PanelTitle hint="LIVE">Audit trail</PanelTitle>
            <ul className="mono max-h-[300px] space-y-2 overflow-y-auto px-5 py-4 text-[11px]">
              {audit.slice(0, 14).map((line, i) => (
                <li key={`${line.ts}-${i}`} className="flex items-start gap-2 leading-5">
                  <span className="shrink-0 text-white/30">
                    {new Date(line.ts).toLocaleTimeString("en-GB", { hour12: false })}
                  </span>
                  <span className="text-[#A78BFA]">{line.actor}</span>
                  <span className="min-w-0 flex-1 truncate text-white/65">{line.action}</span>
                  <span
                    className={`shrink-0 ${
                      /ALERT|SHARED/i.test(line.result)
                        ? "text-[#EF4444]"
                        : /VERIFIED|OK/i.test(line.result)
                          ? "text-[#22C55E]"
                          : "text-white/45"
                    }`}
                  >
                    {line.result}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
