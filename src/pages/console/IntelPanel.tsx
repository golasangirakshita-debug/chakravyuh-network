import {
  analyzeSelection,
  challengeScore,
  CHALLENGE_REASONS,
  levelOf,
  LEVEL_COLOR,
  type SelectionAnalysis,
} from "@/lib/analysis";
import { formatDate } from "@/lib/data";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Scale, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { CountUp, LEVEL_BG } from "./ui";

/* ---------------- animated gauge ---------------- */

function Gauge({ value }: { value: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const color = LEVEL_COLOR[levelOf(value)];
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
        <motion.circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={false}
          animate={{ strokeDashoffset: circ - (circ * value) / 100 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-bold text-white">
          <CountUp to={value} duration={900} />
        </span>
        <span className="mono text-[9px] tracking-[0.24em] text-white/40">RISK</span>
      </div>
    </div>
  );
}

/* ---------------- devil's advocate ---------------- */

function ChallengeDrawer({
  analysis,
  onClose,
}: {
  analysis: SelectionAnalysis;
  onClose: () => void;
}) {
  const [ticked, setTicked] = useState<string[]>([]);
  const base = useMemo(
    () => analysis.signals.filter(s => s.hit).reduce((n, s) => n + s.weight, 0),
    [analysis],
  );
  const challenged = challengeScore(analysis.signals, ticked);
  const collapsed = levelOf(challenged) === "LOW" && levelOf(base) !== "LOW";
  const isBooth = analysis.id.includes("ph-1800123456");

  const toggle = (id: string) =>
    setTicked(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 280 }}
      className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[440px] flex-col border-l border-white/10 bg-[#07090F]/98 backdrop-blur-2xl"
    >
      <div className="flex items-start justify-between border-b border-white/8 p-5">
        <div>
          <p className="mono flex items-center gap-2 text-[10px] tracking-[0.3em] text-[#A78BFA]">
            <Scale className="h-3.5 w-3.5" /> DEVIL'S ADVOCATE
          </p>
          <h3 className="mt-1.5 font-display text-xl font-bold text-white">
            Challenge This Link
          </h3>
          <p className="mt-1 text-xs leading-5 text-white/45">
            The system argues against its own finding. Tick each innocent
            explanation you have actually checked — the score re-weights live.
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/60 transition hover:text-white"
          aria-label="Close challenge"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
        <div className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
          <span className="mono text-[10px] tracking-[0.2em] text-white/45">ORIGINAL</span>
          <span className="mono text-sm font-bold" style={{ color: LEVEL_COLOR[levelOf(base)] }}>
            {base} · {levelOf(base)}
          </span>
        </div>

        {CHALLENGE_REASONS.map(reason => {
          const on = ticked.includes(reason.id);
          return (
            <button
              key={reason.id}
              onClick={() => toggle(reason.id)}
              className={`block w-full rounded-xl border p-4 text-left transition ${
                on
                  ? "border-[#A78BFA]/60 bg-[#A78BFA]/10"
                  : "border-white/8 bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] ${
                    on
                      ? "border-[#A78BFA] bg-[#A78BFA] text-[#05060A]"
                      : "border-white/25 text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className="text-sm font-semibold text-white">{reason.title}</span>
                <span className="mono ml-auto text-[10px] text-[#F59E0B]">
                  −{reason.removes.length} signals
                </span>
              </div>
              <p className="mt-2 pl-8 text-[12px] leading-5 text-white/55">{reason.why}</p>
              <p className="mono mt-2 pl-8 text-[10px] leading-4 tracking-wide text-[#22D3EE]">
                HOW TO CHECK: {reason.check}
              </p>
            </button>
          );
        })}

        {isBooth && (
          <p className="mono rounded-lg border border-dashed border-[#F59E0B]/40 bg-[#F59E0B]/8 px-3 py-2 text-[10px] leading-4 tracking-wide text-[#F59E0B]">
            HINT: THIS EDGE IS THE PUBLIC-BOOTH LINE 1800123456 — TICK “PUBLIC
            BOOTH” TO SEE IT COLLAPSE.
          </p>
        )}
      </div>

      <div className="border-t border-white/8 p-5">
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/40 px-4 py-3">
          <span className="mono text-[10px] tracking-[0.2em] text-white/45">
            RE-WEIGHTED
          </span>
          <span className="flex items-center gap-3">
            <span className="mono text-xs text-white/40 line-through">{base}</span>
            <ChevronRight className="h-3.5 w-3.5 text-white/35" />
            <span
              className={`mono rounded-full border px-2.5 py-1 text-xs font-bold ${LEVEL_BG[levelOf(challenged)]}`}
            >
              {challenged} · {levelOf(challenged)}
            </span>
          </span>
        </div>

        <AnimatePresence>
          {collapsed && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mono mt-3 rounded-lg border border-[#22C55E]/40 bg-[#22C55E]/10 px-3 py-2 text-center text-[10px] tracking-[0.16em] text-[#22C55E]"
            >
              LINK COLLAPSED TO LOW — PRESERVE AS CONTEXT, DROP AS EVIDENCE
            </motion.p>
          )}
        </AnimatePresence>

        <p className="mono mt-3 text-center text-[9px] leading-4 tracking-[0.14em] text-white/35">
          EVERY TICK IS LOGGED TO THE AUDIT TRAIL. ASSUMPTIONS ARE NOT EVIDENCE.
        </p>
      </div>
    </motion.div>
  );
}

/* ---------------- panel ---------------- */

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="mono shrink-0 text-[10px] tracking-[0.18em] text-white/35">
        {label}
      </span>
      <span className="text-right text-xs text-white/80">{children}</span>
    </div>
  );
}

export default function IntelPanel({
  analysis,
  onClose,
  onAudit,
}: {
  analysis: SelectionAnalysis | null;
  onClose: () => void;
  onAudit?: (action: string) => void;
}) {
  const [challenge, setChallenge] = useState(false);

  return (
    <div className="relative h-full">
      <div className="flex h-full flex-col border-l border-white/10 bg-[#07090F]/92 backdrop-blur-2xl">
        <div className="flex items-start justify-between border-b border-white/8 p-5">
          <div>
            <p className="mono text-[10px] tracking-[0.3em] text-[#22D3EE]">
              NETWORK INTELLIGENCE
            </p>
            <h3 className="mt-1.5 font-display text-lg font-bold leading-6 text-white">
              {analysis ? analysis.title : "Nothing selected"}
            </h3>
            {analysis && (
              <p className="mono mt-1 text-[10px] leading-4 tracking-wider text-white/45">
                {analysis.subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/60 transition hover:text-white"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!analysis ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-white/15 text-white/30">
              <ChevronRight className="h-6 w-6" />
            </span>
            <p className="mono text-[11px] leading-5 tracking-wider text-white/40">
              CLICK A NODE OR AN EDGE
              <br />
              TO SEE WHY IT WAS FLAGGED
            </p>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="flex items-center gap-5">
                <Gauge value={analysis.score} />
                <div className="min-w-0">
                  <span
                    className={`mono rounded-full border px-3 py-1.5 text-[11px] font-bold tracking-[0.16em] ${LEVEL_BG[analysis.level]}`}
                  >
                    {analysis.level}
                  </span>
                  <p className="mono mt-3 text-[10px] leading-4 tracking-wider text-white/45">
                    FIRST OBSERVED
                    <br />
                    <span className="text-white/80">
                      {analysis.firstSeen ? formatDate(analysis.firstSeen) : "—"}
                    </span>
                  </p>
                  <p className="mono mt-2 text-[10px] leading-4 tracking-wider text-white/45">
                    LAST OBSERVED
                    <br />
                    <span className="text-white/80">
                      {analysis.lastSeen ? formatDate(analysis.lastSeen) : "—"}
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-white/8 bg-white/[0.03] p-4">
                <p className="mono text-[10px] font-bold tracking-[0.24em] text-white/55">
                  WHY WAS THIS FLAGGED?
                </p>
                <ul className="mt-3 space-y-3">
                  {analysis.signals.map(s => (
                    <li key={s.key}>
                      <div className="flex items-center justify-between text-xs">
                        <span className={s.hit ? "text-white/90" : "text-white/35"}>
                          {s.hit ? "✓" : "○"} {s.label}
                        </span>
                        <span
                          className={`mono text-[10px] ${s.hit ? "text-[#22D3EE]" : "text-white/25"}`}
                        >
                          +{s.weight}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/6">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-[#22D3EE] to-[#A78BFA]"
                          initial={false}
                          animate={{ width: s.hit ? `${s.weight}%` : "0%" }}
                          transition={{ duration: 0.6 }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-white/40">{s.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 divide-y divide-white/6 rounded-xl border border-white/8 bg-white/[0.03] px-4">
                <Row label="SIGNAL TOTAL">{analysis.score} / 100</Row>
                <Row label="LINKED CASES">{analysis.caseIds.join(", ") || "—"}</Row>
                <Row label="SOURCE EVIDENCE">
                  <span className="mono flex flex-wrap justify-end gap-1">
                    {analysis.evidenceIds.slice(0, 6).map(id => (
                      <span
                        key={id}
                        className="rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[9px] text-[#22C55E]"
                      >
                        {id}
                      </span>
                    ))}
                  </span>
                </Row>
              </div>

              <button
                onClick={() => {
                  setChallenge(true);
                  onAudit?.("devils-advocate.open");
                }}
                className="mono mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-[#A78BFA]/50 bg-[#A78BFA]/10 py-2.5 text-[11px] font-bold tracking-[0.16em] text-[#A78BFA] transition hover:bg-[#A78BFA]/20"
              >
                <Scale className="h-3.5 w-3.5" />
                CHALLENGE THIS LINK
              </button>
            </div>

            <div className="border-t border-white/8 p-4">
              <p className="mono text-center text-[9px] leading-4 tracking-[0.14em] text-white/40">
                INVESTIGATIVE SCORE FOR HUMAN REVIEW.
                <br />
                NOT A FINDING OF GUILT.
              </p>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {challenge && analysis && (
          <ChallengeDrawer
            analysis={analysis}
            onClose={() => {
              setChallenge(false);
              onAudit?.("devils-advocate.close");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export { analyzeSelection };
