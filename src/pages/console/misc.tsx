import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Bell,
  Fingerprint,
  LogOut,
  MapPin,
  Radio,
  ShieldCheck,
  Sliders,
} from "lucide-react";
import {
  CASE_BY_ID,
  CURRENCY,
  INVESTIGATOR,
  NETWORKS,
  TRANSACTIONS,
  entityLabel,
  kpis,
  type NetworkId,
} from "@/lib/data";
import { breachRanks, flagStory, signalsFor, scoreSignals } from "@/lib/analysis";
import { useVyuh } from "@/store/vyuh";
import IndiaMap from "./IndiaMap";
import { EmptyNote, LevelBadge, PageHeader, Panel, PanelTitle, RiskBar } from "./ui";

const NET_COLOR: Record<NetworkId, string> = {
  "NET-A": "#22D3EE",
  "NET-B": "#A78BFA",
  NOISE: "#6B7280",
};

/* ============================== Analytics ============================== */

export function AnalyticsPage() {
  const { cases } = useVyuh();
  const ranks = useMemo(() => breachRanks(cases).slice(0, 6), [cases]);
  const story = useMemo(() => flagStory(cases), [cases]);
  const byState = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cases) m.set(c.state, (m.get(c.state) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [cases]);
  const maxState = Math.max(1, ...byState.map(s => s[1]));
  const k = kpis(cases);

  return (
    <div>
      <PageHeader
        eyebrow="INTELLIGENCE · PATTERN LIBRARY"
        title="Analytics"
        description="Structural measures of the corpus — which nodes carry the case, and how early the pattern could have been seen."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { k: "Cases", v: k.cases, c: "#22D3EE" },
          { k: "Entities", v: k.entities, c: "#A78BFA" },
          { k: "Cross-state links", v: k.crossStateLinks, c: "#F59E0B" },
          { k: "Active networks", v: k.activeNetworks, c: "#22C55E" },
        ].map(s => (
          <div key={s.k} className="rounded-2xl border border-white/8 bg-[#0B0F1A]/75 p-5">
            <p className="mono text-[10px] tracking-[0.28em] text-white/35">{s.k}</p>
            <p className="mono mt-2 text-3xl font-bold" style={{ color: s.c }}>
              {String(s.v).padStart(2, "0")}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel>
          <PanelTitle hint="removal test">Structural bridges</PanelTitle>
          <div className="divide-y divide-white/6">
            {ranks.map(r => (
              <div key={r.nodeId} className="px-5 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="mono truncate text-[11px] text-white/70">{r.label}</p>
                  <span className="mono text-[10px] text-[#EF4444]">
                    {r.pairsLost} pairs lost
                  </span>
                </div>
                <p className="mono mt-1 text-[10px] text-white/35">
                  {r.type} · splits into {r.fragmentsDelta + 1} piece
                  {r.fragmentsDelta === 0 ? "" : "s"} · {r.cases.join(", ")}
                </p>
                <RiskBar value={Math.min(100, r.pairsLost * 4)} className="mt-2" />
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelTitle hint="case load">Cases by state</PanelTitle>
          <div className="space-y-2.5 p-5">
            {byState.map(([state, n]) => (
              <div key={state} className="flex items-center gap-3">
                <span className="mono w-32 shrink-0 truncate text-[11px] text-white/55">
                  {state}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#22D3EE]/50 to-[#22D3EE]"
                    style={{ width: `${(n / maxState) * 100}%` }}
                  />
                </div>
                <span className="mono w-5 text-right text-[11px] text-white/45">{n}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-white/8 p-5">
            <p className="mono text-[10px] tracking-[0.28em] text-white/35">EARLIEST FLAG</p>
            <p className="mt-2 text-sm leading-6 text-white/65">
              {story.flagDate} · {story.flaggedCases} FIRs across {story.statesAtFlag} states —{" "}
              <span className="text-[#22D3EE]">{story.daysBeforeLast} days</span> before the last
              linked FIR ({story.lastFir}).
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ============================== Crime Map ============================== */

export function CrimeMapPage() {
  const [picked, setPicked] = useState<string | null>(null);
  const detail = picked ? CASES_MARKERS.find(m => m.caseIds.includes(picked)) : undefined;

  return (
    <div>
      <PageHeader
        eyebrow="GEOSPATIAL · CASE DENSITY"
        title="Crime Map"
        description="Where the FIRs sit, and which cities carry more than one network."
      />
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Panel>
          <PanelTitle hint="dot density by FIR count">India</PanelTitle>
          <div className="p-4">
            <IndiaMap height={520} onMarkerClick={caseId => setPicked(caseId)} />
          </div>
        </Panel>
        <Panel>
          <PanelTitle hint={picked ? `selected · ${picked}` : "all markers"}>Markers</PanelTitle>
          {detail ? (
            <div className="p-5">
              <p className="font-display text-lg font-bold text-white">{detail.city}</p>
              <p className="mono mt-1 text-[11px] text-white/40">
                {detail.state} · {detail.network}
              </p>
              <div className="mt-4 space-y-2">
                {detail.caseIds.map(id => {
                  const c = CASE_BY_ID[id];
                  if (!c) return null;
                  return (
                    <div key={id} className="rounded-xl border border-white/8 bg-black/25 p-3">
                      <div className="flex items-center justify-between">
                        <span className="mono text-[11px] text-white/70">{c.id}</span>
                        <LevelBadge score={c.risk} />
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-white/45">{c.crime}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/6">
              {CASES_MARKERS.map(m => (
                <button
                  key={m.city}
                  onClick={() => setPicked(m.caseIds[0])}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-white/4"
                >
                  <span className="flex items-center gap-2 text-xs text-white/70">
                    <MapPin className="h-3.5 w-3.5 text-[#22D3EE]" />
                    {m.city}
                  </span>
                  <span className="mono text-[10px]" style={{ color: NET_COLOR[m.network] }}>
                    {m.caseIds.length} FIR · {m.network}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

const CASES_MARKERS = [
  { city: "Bengaluru", state: "Karnataka", network: "NET-A" as NetworkId, caseIds: ["CR-001"] },
  { city: "Pune", state: "Maharashtra", network: "NET-A" as NetworkId, caseIds: ["CR-002"] },
  { city: "Hyderabad", state: "Telangana", network: "NET-A" as NetworkId, caseIds: ["CR-003"] },
  { city: "Visakhapatnam", state: "Andhra Pradesh", network: "NET-A" as NetworkId, caseIds: ["CR-004"] },
  { city: "Bhubaneswar", state: "Odisha", network: "NET-A" as NetworkId, caseIds: ["CR-005"] },
  { city: "Chennai", state: "Tamil Nadu", network: "NET-A" as NetworkId, caseIds: ["CR-006"] },
  { city: "Delhi", state: "Delhi", network: "NET-B" as NetworkId, caseIds: ["CR-007"] },
  { city: "Surat", state: "Gujarat", network: "NET-B" as NetworkId, caseIds: ["CR-008"] },
  { city: "Noida", state: "Uttar Pradesh", network: "NET-B" as NetworkId, caseIds: ["CR-009"] },
  { city: "Thrissur", state: "Kerala", network: "NOISE" as NetworkId, caseIds: ["CR-010"] },
  { city: "Ludhiana", state: "Punjab", network: "NOISE" as NetworkId, caseIds: ["CR-011"] },
  { city: "Kolkata", state: "West Bengal", network: "NOISE" as NetworkId, caseIds: ["CR-012"] },
];

/* ============================== Suspects ============================== */

export function SuspectsPage() {
  const { cases } = useVyuh();
  const people = useMemo(() => {
    const ids = [...new Set(cases.flatMap(c => c.entities))].filter(
      id => CASE_BY_ID && entityLabel(id) !== id,
    );
    return ids
      .map(id => {
        const linked = cases.filter(c => c.entities.includes(id));
        const signals = signalsFor([id], cases);
        return {
          id,
          label: entityLabel(id),
          caseCount: linked.length,
          states: [...new Set(linked.map(c => c.state))],
          score: scoreSignals(signals),
          hits: signals.filter(s => s.hit).length,
        };
      })
      .filter(p => p.caseCount > 1)
      .sort((a, b) => b.score - a.score || b.caseCount - a.caseCount)
      .slice(0, 14);
  }, [cases]);

  return (
    <div>
      <PageHeader
        eyebrow="PERSONS OF INTEREST · UNVERIFIED"
        title="Suspects"
        description="Ranked by co-occurrence across cases. Inclusion is not an accusation — a person may appear here only as a victim or a witness."
      />
      <Panel>
        <PanelTitle hint={`${people.length} entities in 2+ cases`}>Co-occurrence register</PanelTitle>
        {people.length === 0 ? (
          <EmptyNote>No entity appears in more than one case.</EmptyNote>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/8">
                  {["Entity", "Cases", "States", "Signals", "Score"].map(h => (
                    <th
                      key={h}
                      className="mono px-5 py-2.5 text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map(p => (
                  <tr key={p.id} className="border-b border-white/4 transition hover:bg-white/4">
                    <td className="px-5 py-3 text-xs text-white/75">
                      {p.label}
                      <span className="mono ml-2 text-[10px] text-white/30">{p.id}</span>
                    </td>
                    <td className="mono px-5 py-3 text-[11px] text-white/60">{p.caseCount}</td>
                    <td className="mono px-5 py-3 text-[11px] text-white/60">
                      {p.states.join(", ")}
                    </td>
                    <td className="px-5 py-3">
                      <RiskBar value={p.score} className="w-24" />
                    </td>
                    <td className="px-5 py-3">
                      <LevelBadge score={p.score} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ============================== Alerts ============================== */

export function AlertsPage() {
  const { cases, audit, integrity } = useVyuh();
  const [ack, setAck] = useState<Record<string, boolean>>({});

  const alerts = useMemo(() => {
    const list: { id: string; kind: string; text: string; level: number; tone: string }[] = [];
    const seen = new Set<string>();
    for (const c of cases) {
      for (const id of c.entities) {
        if (seen.has(id)) continue;
        const linked = cases.filter(x => x.entities.includes(id));
        if (linked.length >= 3) {
          seen.add(id);
          list.push({
            id: `AL-${id}`,
            kind: "Co-occurrence",
            text: `${entityLabel(id)} recurs in ${linked.length} cases across ${new Set(
              linked.map(x => x.state),
            ).size} states.`,
            level: Math.min(95, linked.length * 18),
            tone: "#F59E0B",
          });
        }
      }
    }
    for (const t of TRANSACTIONS.filter(t => t.amount >= 100000).slice(0, 4)) {
      list.push({
        id: `AL-${t.id}`,
        kind: "Financial threshold",
        text: `${CURRENCY(t.amount)} moved via ${t.to} on ${t.date} (${t.caseId}).`,
        level: 78,
        tone: "#EF4444",
      });
    }
    if (!integrity.valid) {
      list.unshift({
        id: "AL-CHAIN",
        kind: "Integrity",
        text: `Evidence chain broke at block ${integrity.brokenBlock}. Reports are void until re-verified.`,
        level: 100,
        tone: "#EF4444",
      });
    }
    return list.sort((a, b) => b.level - a.level);
  }, [cases, integrity]);

  return (
    <div>
      <PageHeader
        eyebrow="REAL-TIME · RANKED BY URGENCY"
        title="Alerts"
        description="Threshold breaches and integrity events. Acknowledging an alert never dismisses it — it records who looked."
      />
      <div className="space-y-3">
        {alerts.map((a, i) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.4) }}
          >
            <Panel
              className={`flex flex-wrap items-center gap-4 p-4 ${
                ack[a.id] ? "opacity-55" : ""
              }`}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                style={{ background: `${a.tone}1A`, border: `1px solid ${a.tone}55` }}
              >
                <Bell className="h-4 w-4" style={{ color: a.tone }} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="mono text-[10px] tracking-[0.24em]" style={{ color: a.tone }}>
                  {a.kind.toUpperCase()} · {a.id}
                </p>
                <p className="mt-1 text-sm leading-6 text-white/75">{a.text}</p>
              </div>
              <LevelBadge score={a.level} />
              <button
                onClick={() => setAck(p => ({ ...p, [a.id]: !p[a.id] }))}
                className="mono rounded-lg border border-white/12 bg-white/5 px-3 py-1.5 text-[10px] font-bold tracking-[0.18em] text-white/60 transition hover:border-white/30 hover:text-white"
              >
                {ack[a.id] ? "Acknowledged" : "Acknowledge"}
              </button>
            </Panel>
          </motion.div>
        ))}
      </div>

      <Panel className="mt-5">
        <PanelTitle hint={`${audit.length} entries`}>Live audit tail</PanelTitle>
        <div className="mono max-h-64 divide-y divide-white/6 overflow-y-auto">
          {audit.slice(0, 40).map((l, i) => (
            <p key={i} className="px-5 py-2 text-[11px] text-white/45">
              <span className="text-white/30">{l.ts.slice(11, 19)}</span>{" "}
              <span className="text-[#22D3EE]">{l.actor}</span> {l.action}{" "}
              <span className="text-white/30">→ {l.result}</span>
            </p>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ============================== Profile ============================== */

export function ProfilePage() {
  const { session, cases, audit, pushAudit, endSession } = useVyuh();

  return (
    <div>
      <PageHeader
        eyebrow="ACCOUNT · OFFICER"
        title={INVESTIGATOR.name}
        description="Identity, session and activity. Chakravyuh holds no biometric data and no covert-listing capability."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelTitle>Service record</PanelTitle>
          <div className="divide-y divide-white/6">
            {[
              { k: "Badge", v: INVESTIGATOR.badge, icon: Fingerprint },
              { k: "Unit", v: INVESTIGATOR.unit, icon: ShieldCheck },
              { k: "Station", v: INVESTIGATOR.station, icon: MapPin },
              { k: "Session since", v: session?.since.slice(0, 19).replace("T", " ") ?? "—", icon: Activity },
              { k: "Cases in scope", v: String(cases.length), icon: Radio },
            ].map(r => (
              <div key={r.k} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <span className="flex items-center gap-2 text-xs text-white/50">
                  <r.icon className="h-3.5 w-3.5 text-[#22D3EE]" />
                  {r.k}
                </span>
                <span className="mono text-[11px] text-white/75">{r.v}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-white/8 p-5">
            <button
              onClick={() => {
                pushAudit({
                  ts: new Date().toISOString(),
                  actor: session?.badge ?? INVESTIGATOR.badge,
                  action: "session.end",
                  result: "CLOSED",
                });
                endSession();
              }}
              className="mono flex items-center gap-2 rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-[10px] font-bold tracking-[0.18em] text-[#EF4444] transition hover:bg-[#EF4444]/18"
            >
              <LogOut className="h-3.5 w-3.5" /> END SESSION
            </button>
          </div>
        </Panel>

        <Panel>
          <PanelTitle hint={`${audit.length} events`}>Recent activity</PanelTitle>
          <div className="mono max-h-[420px] divide-y divide-white/6 overflow-y-auto">
            {audit.slice(0, 60).map((l, i) => (
              <p key={i} className="px-5 py-2.5 text-[11px] text-white/45">
                <span className="text-white/30">{l.ts.slice(5, 16).replace("T", " ")}</span>{" "}
                <span className="text-[#22D3EE]">{l.actor}</span> {l.action}
              </p>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ============================== Settings ============================== */

export function SettingsPage() {
  const { pixelActive, cases, audit, pushAudit, clearHighlight } = useVyuh();
  const [toggles, setToggles] = useState([
    { id: "pixels", label: "Signal-layer background", on: true, note: "Decorative ambient layer. Disable on low-power devices." },
    { id: "autoNet", label: "Auto-attribute new entries", on: true, note: "Score a console-registered FIR and attach it to a network." },
    { id: "warn", label: "Warn before report generation", on: true, note: "Requires an explicit confirm on every draft." },
  ]);

  const flip = (id: string) =>
    setToggles(ts => {
      const next = ts.map(t => (t.id === id ? { ...t, on: !t.on } : t));
      const t = next.find(x => x.id === id);
      if (t)
        pushAudit({
          ts: new Date().toISOString(),
          actor: "INV-2041",
          action: `settings.${id}`,
          result: t.on ? "ENABLED" : "DISABLED",
        });
      return next;
    });

  return (
    <div>
      <PageHeader
        eyebrow="CONSOLE · PREFERENCES"
        title="Settings"
        description="Local preferences for this console. Nothing here changes how evidence is weighted."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelTitle>Behaviour</PanelTitle>
          <div className="divide-y divide-white/6">
            {toggles.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs font-semibold text-white/80">
                    <Sliders className="h-3.5 w-3.5 text-[#A78BFA]" />
                    {t.label}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-white/40">{t.note}</p>
                </div>
                <button
                  onClick={() => flip(t.id)}
                  aria-pressed={t.on}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                    t.on ? "bg-[#22C55E]/70" : "bg-white/12"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                      t.on ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelTitle>Session data</PanelTitle>
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-3 gap-3">
              {[
                { k: "Cases", v: cases.length },
                { k: "Networks", v: NETWORKS.length },
                { k: "Audit rows", v: audit.length },
              ].map(s => (
                <div key={s.k} className="rounded-xl border border-white/8 bg-black/25 p-3">
                  <p className="mono text-[9px] tracking-[0.24em] text-white/35">{s.k}</p>
                  <p className="mono mt-1 text-lg font-bold text-white">{s.v}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] leading-5 text-white/45">
              Case registrations live in this browser session only. Clearing them removes
              locally-entered FIRs; the seeded corpus is unaffected.
            </p>
            <button
              onClick={() => {
                clearHighlight();
                pushAudit({
                  ts: new Date().toISOString(),
                  actor: "INV-2041",
                  action: "session.clear_highlight",
                  result: "OK",
                });
              }}
              className="mono flex items-center gap-2 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-[10px] font-bold tracking-[0.18em] text-white/60 transition hover:border-white/30 hover:text-white"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> CLEAR ACTIVE HIGHLIGHTS
            </button>
            <p className="mono text-[10px] text-white/30">
              ambient layer: {pixelActive ? "animated" : "static"}
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
