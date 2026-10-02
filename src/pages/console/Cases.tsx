import { useVyuh } from "@/store/vyuh";
import { analyzeSelection, sharedEntities } from "@/lib/analysis";
import {
  CASE_BY_ID,
  COLORS,
  ENTITY_BY_ID,
  evidenceForCase,
  formatDate,
  timelineForCase,
  type CaseDef,
  type CaseStatus,
} from "@/lib/data";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Clock,
  Fingerprint,
  FileText,
  Filter,
  GitFork,
  MapPin,
  Plus,
  Radar as RadarIcon,
  Smartphone,
  User,
  X,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import HashBadge from "./HashBadge";
import { LevelBadge, PageHeader, Panel, RiskBar } from "./ui";

/* ============================== shared bits ============================== */

const STATUS_STYLE: Record<CaseStatus, string> = {
  Open: "border-[#22D3EE]/40 bg-[#22D3EE]/10 text-[#22D3EE]",
  "Under Review": "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]",
  Escalated: "border-[#EF4444]/45 bg-[#EF4444]/10 text-[#EF4444]",
  Closed: "border-white/15 bg-white/5 text-white/50",
};

const NET_CHIP: Record<string, string> = {
  "NET-A": "border-[#22D3EE]/40 text-[#22D3EE]",
  "NET-B": "border-[#A78BFA]/40 text-[#A78BFA]",
  NOISE: "border-white/15 text-white/45",
};

const EVIDENCE_STYLE = {
  FIR: { color: COLORS.cyan, icon: FileText },
  CDR: { color: COLORS.amber, icon: Smartphone },
  BANK: { color: COLORS.green, icon: Building2 },
  OSINT: { color: COLORS.violet, icon: RadarIcon },
} as const;

function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`mono inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] tracking-[0.14em] ${className}`}
    >
      {children}
    </span>
  );
}

/* ============================== filters ============================== */

function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="mono text-[10px] tracking-[0.2em] text-white/35">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="mono h-9 rounded-lg border border-white/10 bg-[#0B0F1A] px-3 text-xs text-white/85 focus:border-[#22D3EE]/60 focus:outline-none"
      >
        {options.map(o => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ============================== card ============================== */

function CaseCard({ c, onOpen }: { c: CaseDef; onOpen: () => void }) {
  const shared = c.entities.filter(
    e => ENTITY_BY_ID[e]?.type !== "location",
  );
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.28 }}
      onClick={onOpen}
      className="group relative w-full overflow-hidden rounded-2xl border border-white/8 bg-[#0B0F1A]/80 p-5 text-left transition hover:border-white/20 hover:shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
    >
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#22D3EE]/40 to-transparent opacity-0 transition group-hover:opacity-100" />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="mono font-display text-lg font-bold text-white">{c.id}</span>
            <span
              className={`mono rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-[0.14em] ${STATUS_STYLE[c.status]}`}
            >
              {c.status.toUpperCase()}
            </span>
          </div>
          <p className="mt-1.5 text-sm font-semibold leading-5 text-white/90">{c.title}</p>
        </div>
        <Chip className={NET_CHIP[c.network]}>{c.network}</Chip>
      </div>

      <div className="mono mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] tracking-wider text-white/40">
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {c.city}, {c.state}
        </span>
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3 w-3" />
          {formatDate(c.date)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {shared.slice(0, 4).map(e => (
          <Chip key={e} className="border-white/10 text-white/55">
            {ENTITY_BY_ID[e]?.label ?? e}
          </Chip>
        ))}
        {shared.length > 4 && (
          <Chip className="border-white/10 text-white/35">+{shared.length - 4}</Chip>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <RiskBar value={c.risk} />
        <LevelBadge score={c.risk} />
      </div>
    </motion.button>
  );
}

/* ============================== drawer ============================== */

type DrawerTab = "Overview" | "Entities" | "Evidence" | "Connected Cases" | "Timeline";
const TABS: DrawerTab[] = ["Overview", "Entities", "Evidence", "Connected Cases", "Timeline"];

function MiniGraph({ caseId }: { caseId: string }) {
  const { cases } = useVyuh();
  const shared = sharedEntities([caseId], cases);
  const others = [...new Set(shared.flatMap(s => s.cases))].filter(id => id !== caseId);

  if (!others.length) {
    return (
      <p className="mono py-8 text-center text-[11px] tracking-widest text-white/35">
        ISOLATED CASE — NO SHARED ENTITIES YET
      </p>
    );
  }

  const rows = Math.max(shared.length, others.length, 3);
  const H = 40 + rows * 54;
  const entY = (i: number) => 34 + i * ((H - 60) / Math.max(1, shared.length - 1 || 1));
  const caseY = (i: number) => 34 + i * ((H - 60) / Math.max(1, others.length - 1 || 1));

  return (
    <svg viewBox={`0 0 420 ${H}`} className="w-full">
      {shared.map((s, i) => (
        <line
          key={`a${s.id}`}
          x1={78}
          y1={H / 2}
          x2={190}
          y2={entY(i)}
          stroke={COLORS.cyan}
          strokeWidth="1.4"
          opacity="0.8"
        />
      ))}
      {shared.map((s, i) =>
        s.cases
          .filter(id => id !== caseId)
          .map(id => {
            const j = others.indexOf(id);
            if (j < 0) return null;
            return (
              <line
                key={`b${s.id}-${id}`}
                x1={230}
                y1={entY(i)}
                x2={344}
                y2={caseY(j)}
                stroke={COLORS.violet}
                strokeWidth="1.4"
                strokeDasharray="5 6"
                opacity="0.85"
              />
            );
          }),
      )}

      <g>
        <rect x="8" y={H / 2 - 20} width="70" height="40" rx="10" fill="#22D3EE22" stroke="#22D3EE" />
        <text x="43" y={H / 2 + 4} textAnchor="middle" fill="#E7ECF5" fontSize="12" fontFamily="JetBrains Mono">
          {caseId}
        </text>
      </g>

      {shared.map((s, i) => (
        <g key={`n${s.id}`}>
          <circle cx={210} cy={entY(i)} r={16} fill="#0B0F1A" stroke={COLORS.amber} />
          <text x={210} y={entY(i) + 4} textAnchor="middle" fill={COLORS.amber} fontSize="9" fontFamily="JetBrains Mono">
            {s.count}×
          </text>
          <text x={210} y={entY(i) + 30} textAnchor="middle" fill="rgba(231,236,245,0.6)" fontSize="9.5" fontFamily="JetBrains Mono">
            {(ENTITY_BY_ID[s.id]?.label ?? s.id).slice(0, 14)}
          </text>
        </g>
      ))}

      {others.map((id, i) => (
        <g key={id}>
          <rect x={344} y={caseY(i) - 15} width="68" height="30" rx="8" fill="#A78BFA22" stroke="#A78BFA" />
          <text x={378} y={caseY(i) + 4} textAnchor="middle" fill="#E7ECF5" fontSize="11" fontFamily="JetBrains Mono">
            {id}
          </text>
        </g>
      ))}
    </svg>
  );
}

function CaseDrawer({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const { cases, extraEntities } = useVyuh();
  const [tab, setTab] = useState<DrawerTab>("Overview");
  const c = cases.find(x => x.id === caseId) ?? CASE_BY_ID[caseId];
  const analysis = useMemo(
    () => analyzeSelection(caseId, cases),
    [caseId, cases],
  );

  if (!c) return null;

  const evidence = evidenceForCase(caseId);
  const timeline = timelineForCase(caseId);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]"
      />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 260 }}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[540px] flex-col border-l border-white/10 bg-[#080B13]/97 backdrop-blur-2xl"
      >
        {/* header */}
        <div className="border-b border-white/8 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="mono font-display text-2xl font-bold text-white">{c.id}</span>
                <span
                  className={`mono rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-[0.14em] ${STATUS_STYLE[c.status]}`}
                >
                  {c.status.toUpperCase()}
                </span>
                <Chip className={NET_CHIP[c.network]}>{c.network}</Chip>
              </div>
              <p className="mt-1 text-sm text-white/70">{c.title}</p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/60 transition hover:text-white"
              aria-label="Close case"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <RiskBar value={c.risk} className="flex-1" />
            <LevelBadge score={c.risk} />
          </div>

          <div className="mt-4 flex gap-1 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`mono whitespace-nowrap rounded-lg px-3 py-1.5 text-[10px] font-bold tracking-[0.14em] transition ${
                  tab === t
                    ? "bg-[#22D3EE]/15 text-[#22D3EE] border border-[#22D3EE]/40"
                    : "border border-transparent text-white/45 hover:text-white"
                }`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === "Overview" && (
            <div className="space-y-5">
              <p className="text-sm leading-6 text-white/70">{c.summary}</p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  ["State", c.state, MapPin],
                  ["Filed", formatDate(c.date), CalendarDays],
                  ["Crime", c.crime, AlertTriangle],
                  ["Status", c.status, Clock],
                ].map(([label, value, Icon]) => {
                  const I = Icon as typeof MapPin;
                  return (
                    <div key={String(label)} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                      <p className="mono text-[9px] tracking-[0.22em] text-white/35">
                        {String(label).toUpperCase()}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-white/85">
                        <I className="h-3.5 w-3.5 text-[#22D3EE]" />
                        {String(value)}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <p className="mono text-[10px] font-bold tracking-[0.24em] text-white/55">
                  WHY WAS THIS FLAGGED?
                </p>
                <ul className="mt-3 space-y-2.5">
                  {analysis?.signals.map(s => (
                    <li key={s.key}>
                      <div className="flex items-center justify-between text-xs">
                        <span className={s.hit ? "text-white/90" : "text-white/35"}>
                          {s.hit ? "✓" : "—"} {s.label}
                        </span>
                        <span
                          className={`mono text-[10px] ${s.hit ? "text-[#22D3EE]" : "text-white/25"}`}
                        >
                          +{s.weight}
                        </span>
                      </div>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/6">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#22D3EE] to-[#A78BFA] transition-all duration-700"
                          style={{ width: s.hit ? `${s.weight}%` : "0%" }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-white/40">{s.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tab === "Entities" && (
            <ul className="space-y-2.5">
              {c.entities.map(eid => {
                const ent = extraEntities.find(e => e.id === eid) ?? ENTITY_BY_ID[eid];
                const holders = cases.filter(x => x.entities.includes(eid));
                const isShared = holders.length > 1;
                const icon =
                  ent?.type === "phone"
                    ? Smartphone
                    : ent?.type === "bank" || ent?.type === "upi"
                      ? Building2
                      : ent?.type === "location"
                        ? MapPin
                        : ent?.type === "alias"
                          ? Fingerprint
                          : User;
                const Icon = icon;
                return (
                  <li
                    key={eid}
                    className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#A78BFA]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white/90">
                        {ent?.label ?? eid}
                      </p>
                      <p className="mono text-[10px] tracking-wider text-white/40">
                        {(ent?.type ?? "entity").toUpperCase()}
                        {ent?.meta ? ` · ${ent.meta}` : ""}
                      </p>
                    </div>
                    {isShared && (
                      <Chip className="border-[#F59E0B]/40 text-[#F59E0B]">
                        SHARED ×{holders.length}
                      </Chip>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {tab === "Evidence" && (
            <ul className="space-y-3">
              {evidence.length === 0 && (
                <li className="mono rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-[11px] tracking-widest text-white/35">
                  NO SEALED EXHIBITS YET — EVIDENCE PENDING FIRST PULL
                </li>
              )}
              {evidence.map(ev => {
                const style = EVIDENCE_STYLE[ev.type];
                const Icon = style.icon;
                return (
                  <li
                    key={ev.id}
                    className="rounded-xl border border-white/8 bg-white/[0.03] p-4"
                    style={{ borderLeft: `2px solid ${style.color}` }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono flex items-center gap-2 text-[10px] font-bold tracking-[0.18em]" style={{ color: style.color }}>
                        <Icon className="h-3.5 w-3.5" />
                        {ev.id}
                      </span>
                      <HashBadge text={`${ev.id}|${ev.content}`} />
                    </div>
                    <p className="mt-2 text-sm font-medium text-white/90">{ev.title}</p>
                    <p className="mono mt-1 text-[10px] tracking-wider text-white/35">
                      {ev.timestamp.replace("T", " ")}
                    </p>
                    <p className="mt-2 text-[12px] leading-5 text-white/55">{ev.content}</p>
                  </li>
                );
              })}
            </ul>
          )}

          {tab === "Connected Cases" && (
            <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
              <MiniGraph caseId={caseId} />
              <p className="mono mt-2 text-center text-[9px] tracking-[0.16em] text-white/35">
                SOLID = SOURCE EDGE · DASHED = INFERRED VIA SHARED ENTITY
              </p>
            </div>
          )}

          {tab === "Timeline" && (
            <ol className="relative space-y-5 pl-5">
              <span className="absolute bottom-2 left-[5px] top-2 w-px bg-gradient-to-b from-[#22D3EE] via-[#A78BFA] to-transparent" />
              {timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span
                    className="absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#080B13]"
                    style={{ background: COLORS[ t.source === "fir" ? "cyan" : t.source === "cdr" ? "amber" : t.source === "financial" ? "green" : "violet" ] }}
                  />
                  <p className="mono text-[10px] tracking-wider text-white/40">
                    {t.ts.replace("T", " ")}
                  </p>
                  <p className="text-sm text-white/85">{t.label}</p>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* footer */}
        <div className="border-t border-white/8 p-4">
          <p className="mono text-center text-[9px] leading-4 tracking-[0.16em] text-white/35">
            INVESTIGATIVE SCORE FOR HUMAN REVIEW. NOT A FINDING OF GUILT.
          </p>
        </div>
      </motion.aside>
    </>
  );
}

/* ============================== register dialog ============================== */

function RegisterDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { cases, registerCase } = useVyuh();
  const navigate = useNavigate();
  const nextId = `CR-${String(cases.length + 1).padStart(3, "0")}`;
  const [form, setForm] = useState({
    id: nextId,
    state: "",
    city: "",
    date: "2026-06-30",
    crime: "Human trafficking",
    phone: "",
    bank: "",
    alias: "",
  });

  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.state.trim() || !form.city.trim()) {
      toast.error("State and city are required.");
      return;
    }
    const { caseDef, shared } = registerCase({
      id: form.id.trim() || nextId,
      state: form.state.trim(),
      city: form.city.trim(),
      date: form.date,
      crime: form.crime.trim() || "Unspecified",
      phone: form.phone.trim() || undefined,
      bank: form.bank.trim() || undefined,
      alias: form.alias.trim() || undefined,
    });

    const phoneHits = shared.filter(s => s.kind === "phone");
    if (phoneHits.length) {
      const casesHit = [...new Set(phoneHits.flatMap(s => s.cases))].join(", ");
      toast.warning(`Shared phone detected with ${casesHit}`, {
        description: `${phoneHits.map(h => h.label).join(", ")} now lights up the network graph.`,
        duration: 7000,
        action: {
          label: "View graph",
          onClick: () => navigate("/console/network"),
        },
      });
    } else {
      toast.success(`${caseDef.id} registered`, {
        description: shared.length
          ? `Overlap found: ${shared.map(s => s.label).join(", ")}`
          : "No shared instruments detected — appears isolated.",
      });
    }
    onClose();
  };

  const field = (
    label: string,
    key: keyof typeof form,
    placeholder: string,
    hint?: string,
  ) => (
    <label className="block">
      <span className="mono text-[10px] tracking-[0.2em] text-white/40">
        {label.toUpperCase()}
        {hint && <span className="ml-2 text-white/25">{hint}</span>}
      </span>
      <input
        value={form[key]}
        onChange={e => set(key)(e.target.value)}
        placeholder={placeholder}
        className="mono mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white/90 placeholder:text-white/25 focus:border-[#22D3EE]/60 focus:outline-none"
      />
    </label>
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-white/10 bg-[#080B13] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.7)]"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="mono text-[10px] tracking-[0.3em] text-[#22D3EE]">
                  LIVE INTAKE
                </p>
                <h3 className="mt-1 font-display text-2xl font-bold text-white">
                  Register New Case
                </h3>
                <p className="mt-1 text-xs text-white/45">
                  Enter a phone that already exists and the graph lights up instantly.
                </p>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/60 transition hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field("Case ID", "id", "CR-013")}
              {field("Filed date", "date", "2026-06-30")}
              {field("State", "state", "Karnataka")}
              {field("City", "city", "Mysuru")}
              <label className="block sm:col-span-2">
                <span className="mono text-[10px] tracking-[0.2em] text-white/40">CRIME</span>
                <select
                  value={form.crime}
                  onChange={e => set("crime")(e.target.value)}
                  className="mono mt-1.5 h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white/90 focus:border-[#22D3EE]/60 focus:outline-none"
                >
                  {[
                    "Human trafficking",
                    "Loan-app cyber fraud",
                    "Money laundering — mule handoff",
                    "Cheating — unrelated",
                  ].map(o => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              {field("Phone", "phone", "9876543210", "try a shared one")}
              {field("Bank / UPI", "bank", "XXXX8842")}
              {field("Alias", "alias", "Ravi")}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="mono rounded-full border border-white/12 px-4 py-2 text-[11px] tracking-[0.16em] text-white/55 transition hover:text-white"
              >
                CANCEL
              </button>
              <button
                onClick={submit}
                className="mono inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#22D3EE] to-[#A78BFA] px-5 py-2 text-[11px] font-bold tracking-[0.16em] text-[#041018] transition hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                REGISTER
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ============================== page ============================== */

export default function CasesPage() {
  const { cases, highlightPhones, clearHighlight } = useVyuh();
  const [state, setState] = useState("All");
  const [crime, setCrime] = useState("All");
  const [network, setNetwork] = useState("All");
  const [minRisk, setMinRisk] = useState(0);
  const [q, setQ] = useState("");
  const [openCase, setOpenCase] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  const states = ["All", ...new Set(cases.map(c => c.state))];
  const crimes = ["All", ...new Set(cases.map(c => c.crime))];

  const filtered = cases.filter(c => {
    if (state !== "All" && c.state !== state) return false;
    if (crime !== "All" && c.crime !== crime) return false;
    if (network !== "All" && c.network !== network) return false;
    if (c.risk < minRisk) return false;
    if (q) {
      const hay = `${c.id} ${c.title} ${c.city} ${c.state} ${c.summary}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div>
      <PageHeader
        eyebrow="CONSOLE / CASES"
        title="Case Board"
        description="Filter the corpus, open a case, register a new one — the dashboard and the graph update live."
        actions={
          <button
            onClick={() => setRegisterOpen(true)}
            className="mono inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#22D3EE] to-[#A78BFA] px-4 py-2.5 text-[11px] font-bold tracking-[0.16em] text-[#041018] transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            REGISTER NEW CASE
          </button>
        }
      />

      {/* highlight banner */}
      <AnimatePresence>
        {highlightPhones && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 flex items-center gap-3 rounded-xl border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-4 py-3"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-[#F59E0B]" />
            <p className="mono flex-1 text-[11px] tracking-wider text-[#F59E0B]">
              SHARED INSTRUMENT DETECTED: {highlightPhones.join(", ")} — GRAPH HIGHLIGHTED
            </p>
            <button
              onClick={clearHighlight}
              className="mono text-[10px] tracking-widest text-white/50 hover:text-white"
            >
              DISMISS
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* filters */}
      <Panel className="mb-6 flex flex-wrap items-end gap-4 p-4">
        <Select label="STATE" value={state} onChange={setState} options={states} />
        <Select label="CRIME" value={crime} onChange={setCrime} options={crimes} />
        <Select label="NETWORK" value={network} onChange={setNetwork} options={["All", "NET-A", "NET-B", "NOISE"]} />
        <label className="flex items-center gap-2">
          <span className="mono text-[10px] tracking-[0.2em] text-white/35">MIN RISK</span>
          <input
            type="range"
            min={0}
            max={100}
            value={minRisk}
            onChange={e => setMinRisk(Number(e.target.value))}
            className="h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-white/10 accent-[#22D3EE]"
          />
          <span className="mono w-7 text-xs text-[#22D3EE]">{minRisk}</span>
        </label>
        <div className="relative">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="text search…"
            className="mono h-9 w-44 rounded-lg border border-white/10 bg-[#0B0F1A] pl-9 pr-3 text-xs text-white/85 placeholder:text-white/30 focus:border-[#22D3EE]/60 focus:outline-none"
          />
        </div>
        <span className="mono ml-auto text-[10px] tracking-[0.2em] text-white/35">
          {filtered.length} / {cases.length} CASES
        </span>
      </Panel>

      {/* grid */}
      <motion.div layout className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {filtered.map(c => (
            <CaseCard key={c.id} c={c} onOpen={() => setOpenCase(c.id)} />
          ))}
        </AnimatePresence>
      </motion.div>

      {filtered.length === 0 && (
        <Panel className="p-10 text-center">
          <GitFork className="mx-auto h-6 w-6 text-white/25" />
          <p className="mono mt-3 text-[11px] tracking-[0.2em] text-white/40">
            NO CASES MATCH THESE FILTERS
          </p>
        </Panel>
      )}

      <AnimatePresence>{openCase && <CaseDrawer caseId={openCase} onClose={() => setOpenCase(null)} />}</AnimatePresence}

      <RegisterDialog open={registerOpen} onClose={() => setRegisterOpen(false)} />
    </div>
  );
}
