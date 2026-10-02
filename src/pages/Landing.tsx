import ChakraRing from "@/components/ChakraRing";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileCheck2,
  Gauge,
  Inbox,
  Link2,
  Network,
  Radar,
  ScanSearch,
  Share2,
  ShieldCheck,
  Shuffle,
  UserCheck,
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import "./landing.css";

const scrollTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

/* ============================== 1. Floating pill navbar ============================== */

function FloatingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <nav
        className={`glass flex items-center justify-between gap-6 rounded-2xl py-2 pl-5 pr-2 shadow-[0_18px_50px_rgba(0,0,0,0.45)] transition-[max-width,padding] duration-500 ease-in-out ${
          scrolled ? "max-w-3xl px-3" : "max-w-6xl"
        }`}
      >
        <Link to="/" className="flex items-center gap-2.5">
          <ChakraRing className="h-7 w-7" />
          <span className="font-display text-sm font-bold tracking-[0.32em] text-white">
            CHAKRAVYUH
          </span>
        </Link>

        <div className="hidden items-center gap-7 md:flex">
          {(
            [
              ["Platform", "platform"],
              ["Method", "method"],
              ["Trust", "trust"],
            ] as const
          ).map(([label, id]) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className="text-sm font-medium text-white/60 transition hover:text-white"
            >
              {label}
            </button>
          ))}
        </div>

        <Link
          to="/login"
          className="rounded-full bg-gradient-to-r from-[#FF4FA3] to-[#B84DFF] p-px transition hover:opacity-90"
        >
          <span className="block rounded-full bg-[#05060A] px-5 py-2 text-sm font-semibold text-white">
            Login
          </span>
        </Link>
      </nav>
    </header>
  );
}

/* ============================== Hero drifting network ============================== */

const HERO_NODES = [
  { x: 120, y: 140, dx: 16, dy: -12, dur: 9, r: 4, pulse: false },
  { x: 320, y: 80, dx: -14, dy: 14, dur: 11, r: 3.4, pulse: true },
  { x: 540, y: 170, dx: 12, dy: 10, dur: 8.5, r: 5, pulse: false },
  { x: 210, y: 320, dx: -10, dy: -16, dur: 12, r: 3.4, pulse: false },
  { x: 430, y: 360, dx: 14, dy: -12, dur: 10, r: 4.4, pulse: true },
  { x: 760, y: 110, dx: -16, dy: 12, dur: 9.5, r: 3.6, pulse: false },
  { x: 840, y: 300, dx: 12, dy: -14, dur: 11.5, r: 5, pulse: false },
  { x: 660, y: 460, dx: -12, dy: 12, dur: 8, r: 3.4, pulse: true },
  { x: 330, y: 540, dx: 16, dy: -10, dur: 12.5, r: 4.2, pulse: false },
  { x: 130, y: 470, dx: -14, dy: -12, dur: 10.5, r: 3.4, pulse: false },
  { x: 990, y: 440, dx: 12, dy: 14, dur: 9, r: 4, pulse: true },
  { x: 1050, y: 200, dx: -10, dy: 16, dur: 13, r: 3.4, pulse: false },
  { x: 700, y: 620, dx: 14, dy: -12, dur: 10, r: 3.6, pulse: false },
  { x: 460, y: 640, dx: -12, dy: 10, dur: 11, r: 3.4, pulse: false },
];
const HERO_EDGES: [number, number, number][] = [
  [0, 1, 6], [1, 2, 7.5], [0, 3, 8.5], [3, 4, 6.5], [4, 2, 9], [2, 5, 7],
  [5, 6, 8], [6, 4, 10], [4, 7, 6.8], [7, 8, 9.2], [8, 9, 7.6], [9, 0, 8.8],
  [6, 10, 6.2], [10, 11, 8.4], [11, 5, 7.2], [7, 12, 9.6], [12, 13, 6.6],
  [13, 8, 8.2], [2, 6, 10.5],
];

function DriftNetwork() {
  return (
    <svg
      viewBox="0 0 1200 720"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="heroEdge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#A78BFA" />
        </linearGradient>
      </defs>

      {HERO_EDGES.map(([a, b, dur], i) => (
        <line
          key={`e${i}`}
          className="vy-edge"
          x1={HERO_NODES[a].x}
          y1={HERO_NODES[a].y}
          x2={HERO_NODES[b].x}
          y2={HERO_NODES[b].y}
          stroke="url(#heroEdge)"
          strokeWidth="1.1"
          style={
            {
              "--dur": `${dur}s`,
              "--dly": `${(i * 0.45) % 5}s`,
            } as CSSProperties
          }
        />
      ))}

      {HERO_NODES.map((n, i) => (
        <g
          key={`n${i}`}
          className="vy-node"
          style={
            {
              "--dx": `${n.dx}px`,
              "--dy": `${n.dy}px`,
              "--dur": `${n.dur}s`,
              "--dly": `${i * 0.3}s`,
            } as CSSProperties
          }
        >
          {n.pulse && (
            <circle
              className="vy-breathe"
              cx={n.x}
              cy={n.y}
              r={n.r + 5}
              fill="none"
              stroke="#FF4FA3"
              strokeWidth="1"
              opacity="0.6"
              style={{ "--dly": `${i * 0.5}s` } as CSSProperties}
            />
          )}
          <circle
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={i % 3 === 0 ? "#22D3EE" : i % 3 === 1 ? "#A78BFA" : "#E7ECF5"}
            opacity="0.9"
          />
        </g>
      ))}
    </svg>
  );
}

/* ============================== 2. Hero ============================== */

function Hero() {
  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden">
      <div className="absolute inset-0 opacity-[0.55]">
        <DriftNetwork />
      </div>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1000px 520px at 50% 42%, rgba(5,6,10,0.15), rgba(5,6,10,0.82) 78%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24 pt-36">
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-gradient text-xs font-bold uppercase tracking-[0.46em] sm:text-sm"
        >
          Investigator Intelligence Platform
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12 }}
          className="mt-6 max-w-4xl font-display text-5xl font-bold leading-[1.03] tracking-tight text-white sm:text-6xl lg:text-7xl"
        >
          Four FIRs. Four states.
          <br />
          <span className="text-gradient">One hidden network.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.26 }}
          className="mt-7 max-w-2xl text-base leading-7 text-white/60 sm:text-lg"
        >
          Chakravyuh connects scattered records — FIRs, call detail records,
          financial trails, OSINT — to expose the relationships between them.
          It ranks what deserves human review.{" "}
          <span className="text-white/85">It never determines guilt.</span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-10 flex flex-wrap items-center gap-4"
        >
          <Link to="/login">
            <span className="inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-[#22D3EE] to-[#A78BFA] px-7 text-sm font-bold text-[#041018] transition hover:opacity-90">
              Login to Console
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
          <button
            onClick={() => scrollTo("method")}
            className="inline-flex h-12 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-7 text-sm font-semibold text-white/80 transition hover:border-white/30 hover:text-white"
          >
            See How It Works
          </button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mono mt-10 text-[11px] tracking-[0.3em] text-white/35"
        >
          DEMO CORPUS · 12 CASES · 10 STATES · 2 NETWORKS · 1 BRIDGE
        </motion.p>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-b from-transparent to-[#05060A]" />
    </section>
  );
}

/* ============================== 3. Chaos vs control ============================== */

const LEFT_ROWS = [
  "Scattered FIRs across districts",
  "Siloed state databases",
  "Manual cross-checks on paper",
  "Weeks to spot the pattern",
  "Evidence with no provenance",
];
const RIGHT_ROWS = [
  "Shared entities linked automatically",
  "Explainable score, not a verdict",
  "Evidence sealed with a hash chain",
  "Hours to the first cross-state lead",
  "Every claim traceable to a source",
];

const SNAP_NODES = [
  { x: 70, y: 80, sx: -60, sy: -40, d: 0 },
  { x: 145, y: 55, sx: 55, sy: -62, d: 0.3 },
  { x: 205, y: 110, sx: 72, sy: 34, d: 0.6 },
  { x: 85, y: 155, sx: -70, sy: 52, d: 0.15 },
  { x: 160, y: 140, sx: -48, sy: 66, d: 0.45 },
  { x: 118, y: 208, sx: 46, sy: -70, d: 0.75 },
  { x: 212, y: 192, sx: 74, sy: 20, d: 0.9 },
];
const SNAP_EDGES: [number, number, number][] = [
  [0, 1, 0], [1, 2, 0.2], [0, 3, 0.4], [3, 4, 0.1], [4, 1, 0.3],
  [4, 5, 0.5], [5, 3, 0.6], [2, 6, 0.25], [4, 6, 0.35],
];

function SnapGraph() {
  return (
    <div className="relative mx-auto h-[264px] w-[264px] overflow-hidden rounded-full border border-white/12 bg-[radial-gradient(circle_at_30%_25%,rgba(34,211,238,0.14),transparent_60%),radial-gradient(circle_at_75%_80%,rgba(167,139,250,0.16),transparent_60%),#0B0F1A] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <svg viewBox="0 0 264 264" className="relative h-full w-full">
        {SNAP_EDGES.map(([a, b, d], i) => (
          <line
            key={i}
            className="vy-snap-edge"
            x1={SNAP_NODES[a].x}
            y1={SNAP_NODES[a].y}
            x2={SNAP_NODES[b].x}
            y2={SNAP_NODES[b].y}
            stroke="#22D3EE"
            strokeWidth="1.6"
            strokeLinecap="round"
            style={{ "--dly": `${d}s` } as CSSProperties}
          />
        ))}
        {SNAP_NODES.map((n, i) => (
          <circle
            key={i}
            className="vy-dot"
            cx={n.x}
            cy={n.y}
            r={i === 4 ? 7 : 5}
            fill={i === 4 ? "#FF4FA3" : i % 2 ? "#A78BFA" : "#22D3EE"}
            style={
              {
                "--sx": `${n.sx}px`,
                "--sy": `${n.sy}px`,
                "--dly": `${n.d}s`,
              } as CSSProperties
            }
          />
        ))}
      </svg>
      <span className="mono absolute bottom-6 left-0 right-0 text-center text-[9px] tracking-[0.3em] text-white/40">
        SCATTERED → CONNECTED
      </span>
    </div>
  );
}

function IsolationSection() {
  return (
    <section id="method" className="relative scroll-mt-28 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl"
        >
          <p className="mono text-[11px] tracking-[0.4em] text-[#22D3EE]">01 / METHOD</p>
          <h2 className="mt-4 font-display text-4xl font-bold text-white sm:text-5xl">
            Stop investigating in isolation
          </h2>
          <p className="mt-4 text-white/55">
            A ring that moves across states looks like four unrelated cases —
            until the records are forced to talk to each other.
          </p>
        </motion.div>

        <div className="mt-14 grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_auto_1fr]">
          {/* left: today */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6 }}
            className="space-y-3"
          >
            <p className="mono mb-4 text-[10px] tracking-[0.3em] text-white/35">
              TODAY — IN ISOLATION
            </p>
            {LEFT_ROWS.map(row => (
              <div
                key={row}
                className="flex items-center gap-3 rounded-2xl border border-white/6 bg-white/[0.02] px-4 py-3.5 text-sm text-white/45"
              >
                <XCircle className="h-4 w-4 shrink-0 text-white/25" />
                {row}
              </div>
            ))}
          </motion.div>

          {/* center: magnet animation */}
          <motion.div
            initial={{ opacity: 0, scale: 0.86 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7 }}
            className="mx-auto"
          >
            <SnapGraph />
          </motion.div>

          {/* right: with chakravyuh */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6 }}
            className="space-y-3"
          >
            <p className="text-gradient mono mb-4 text-[10px] font-bold tracking-[0.3em]">
              WITH CHAKRAVYUH
            </p>
            {RIGHT_ROWS.map(row => (
              <div
                key={row}
                className="glass flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-medium text-white/90 shadow-[0_12px_34px_rgba(0,0,0,0.35)] transition hover:translate-x-1"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#22C55E]" />
                {row}
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ============================== 4. Pipeline ============================== */

const PIPELINE = [
  { icon: Inbox, title: "Ingest", copy: "FIRs, CDRs, bank rows and OSINT arrive raw." },
  { icon: Shuffle, title: "ETL Normalization", copy: "Messy fields become typed, dated, geocoded records." },
  { icon: Network, title: "Knowledge Graph", copy: "Entities resolve; every edge carries its source." },
  { icon: ScanSearch, title: "AI Detection", copy: "Weighted signals rank networks for human review." },
  { icon: FileCheck2, title: "Blockchain-secured Report", copy: "A hashed chain turns findings into evidence." },
];

function PipelineSection() {
  return (
    <section className="relative py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="flex flex-wrap items-end justify-between gap-6"
        >
          <div>
            <p className="mono text-[11px] tracking-[0.4em] text-[#A78BFA]">02 / PIPELINE</p>
            <h2 className="mt-4 font-display text-4xl font-bold text-white sm:text-5xl">
              From raw FIR to court-ready report
            </h2>
          </div>
          <p className="mono max-w-xs text-[11px] leading-5 tracking-wider text-white/40">
            FIVE STAGES · EVERY TRANSITION LOGGED · EVERY OUTPUT REPRODUCIBLE
          </p>
        </motion.div>

        <div className="mt-14 flex flex-col items-stretch gap-4 lg:flex-row lg:items-center lg:gap-0">
          {PIPELINE.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="flex items-center lg:flex-1">
                <motion.div
                  initial={{ opacity: 0, y: 34 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.55, delay: i * 0.12 }}
                  className="glass group w-full rounded-2xl p-5 transition hover:border-white/20"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#22D3EE] transition group-hover:bg-[#22D3EE] group-hover:text-[#041018]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="mono text-[10px] tracking-[0.25em] text-white/30">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 font-display text-lg font-bold text-white">{step.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-5 text-white/50">{step.copy}</p>
                </motion.div>

                {i < PIPELINE.length - 1 && (
                  <div className="relative mx-2 hidden h-px w-10 shrink-0 bg-white/15 lg:block">
                    <span
                      className="vy-flow-dot"
                      style={{ "--dly": `${i * 0.55}s` } as CSSProperties}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ============================== 5. Capability cards ============================== */

const CAPABILITIES = [
  {
    icon: Share2,
    no: "01",
    title: "Cross-Case Linking",
    copy: "One phone, six FIRs, four states — surfaced before the fourth report is written.",
    more: "Entity resolution runs on every ingest, not on demand.",
  },
  {
    icon: Gauge,
    no: "02",
    title: "Explainable Risk Score",
    copy: "Every point maps to a visible signal and its weight. No black box.",
    more: "Phone +30 · account +30 · alias +15 · geography +10 · timing +15.",
  },
  {
    icon: Link2,
    no: "03",
    title: "Evidence Integrity Chain",
    copy: "SHA-256 over every exhibit. One character changed, the chain says so.",
    more: "Tamper alerts reach every screen the moment a block breaks.",
  },
  {
    icon: Radar,
    no: "04",
    title: "Ghost Node",
    copy: "The missing record, predicted — with the exact request that confirms it.",
    more: "Structural holes, repeating cadence and bridge detection over the graph.",
  },
];

function CapabilitySection() {
  return (
    <section id="platform" className="relative scroll-mt-28 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl"
        >
          <p className="mono text-[11px] tracking-[0.4em] text-[#22D3EE]">03 / PLATFORM</p>
          <h2 className="mt-4 font-display text-4xl font-bold text-white sm:text-5xl">
            Built for the questions that matter
          </h2>
        </motion.div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {CAPABILITIES.map((cap, i) => {
            const Icon = cap.icon;
            return (
              <motion.article
                key={cap.title}
                initial={{ opacity: 0, y: 36 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay: i * 0.1 }}
                className="group relative min-h-[320px] overflow-hidden rounded-[36px] border border-white/8 bg-[#0B0F1A]/70 p-7 backdrop-blur"
              >
                {/* hover: gradient slides in from the top */}
                <span className="absolute inset-x-0 top-0 h-1/2 -translate-y-full bg-gradient-to-b from-[#A78BFA]/45 via-[#22D3EE]/20 to-transparent transition-transform duration-500 ease-out group-hover:translate-y-0" />
                {/* hover: dark gradient rises from the bottom */}
                <span className="absolute inset-x-0 bottom-0 h-1/2 translate-y-full bg-gradient-to-t from-black/80 to-transparent transition-transform duration-500 ease-out group-hover:translate-y-0" />

                <div className="relative flex h-full flex-col">
                  <div className="flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[#A78BFA] transition group-hover:text-white">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="mono text-[10px] tracking-[0.3em] text-white/30">{cap.no}</span>
                  </div>

                  <div className="mt-auto pt-8">
                    <h3 className="font-display text-xl font-bold text-white transition-transform duration-500 group-hover:-translate-y-1.5">
                      {cap.title}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-white/55 transition-transform duration-500 group-hover:-translate-y-1">
                      {cap.copy}
                    </p>

                    <div className="max-h-0 overflow-hidden opacity-0 transition-all duration-500 group-hover:mt-4 group-hover:max-h-24 group-hover:opacity-100">
                      <p className="text-xs leading-5 text-white/45">{cap.more}</p>
                      <Link
                        to="/login"
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-semibold text-white transition hover:border-[#22D3EE] hover:text-[#22D3EE]"
                      >
                        Learn more
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ============================== 6. Structured Trust staircase ============================== */

const PILLARS = [
  {
    icon: Database,
    label: "Collect",
    tint: "#22D3EE",
    items: ["FIR intake", "CDR ingestion", "Financial statements", "OSINT capture"],
  },
  {
    icon: Share2,
    label: "Connect",
    tint: "#A78BFA",
    items: ["Entity resolution", "Alias detection", "Cross-state matching", "Temporal alignment"],
  },
  {
    icon: ShieldCheck,
    label: "Verify",
    tint: "#22C55E",
    items: ["SHA-256 evidence chain", "Custody log", "Tamper alerts", "Source citations"],
  },
  {
    icon: UserCheck,
    label: "Review",
    tint: "#FF4FA3",
    items: ["Human review queue", "Devil's advocate", "Ghost hypotheses", "Sign-off before report"],
  },
];

function TrustSection() {
  return (
    <section id="trust" className="relative scroll-mt-28 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl"
        >
          <p className="mono text-[11px] tracking-[0.4em] text-[#FF4FA3]">04 / TRUST</p>
          <h2 className="mt-4 font-display text-4xl font-bold text-white sm:text-5xl">
            Structured Trust
          </h2>
          <p className="mt-4 text-white/55">
            Each step only exists because the step below it holds. Evidence is
            collected, connected, verified — then handed to a human.
          </p>
        </motion.div>

        <div className="mt-16 flex flex-col gap-12 lg:grid lg:grid-cols-4 lg:items-end lg:gap-6">
          {PILLARS.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.label}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay: i * 0.14 }}
                className={`relative ${i % 2 === 1 ? "self-end lg:self-auto" : ""} ${
                  ["lg:mb-0", "lg:mb-12", "lg:mb-24", "lg:mb-36"][i]
                } ${i % 2 === 1 ? "lg:ml-4" : ""}`}
              >
                <span
                  className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-[#05060A]"
                  style={{ background: `linear-gradient(120deg, ${p.tint}, ${p.tint}aa)` }}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {p.label}
                </span>

                <span
                  className="absolute -left-2 top-11 h-[calc(100%-2rem)] w-px"
                  style={{
                    background: `linear-gradient(180deg, ${p.tint}, transparent)`,
                  }}
                />

                <ul className="mt-5 space-y-3 pl-3">
                  {p.items.map(item => (
                    <li key={item} className="text-sm text-white/65">
                      <span className="mr-2 text-white/25">—</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ============================== Footer ============================== */

function SiteFooter() {
  return (
    <footer className="relative border-t border-white/8 bg-[#05060A]/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-14">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-2.5">
            <ChakraRing className="h-7 w-7" />
            <span className="font-display text-sm font-bold tracking-[0.32em] text-white">
              CHAKRAVYUH
            </span>
          </Link>

          <div className="flex items-center gap-6 text-sm text-white/50">
            <button onClick={() => scrollTo("platform")} className="transition hover:text-white">
              Platform
            </button>
            <button onClick={() => scrollTo("method")} className="transition hover:text-white">
              Method
            </button>
            <button onClick={() => scrollTo("trust")} className="transition hover:text-white">
              Trust
            </button>
            <Link to="/login" className="text-white transition hover:text-[#22D3EE]">
              Login
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/6 pt-6">
          <p className="font-display text-sm font-bold tracking-wide text-white/70">
            Human-in-the-loop by design:{" "}
            <span className="text-gradient">risk is not guilt.</span>
          </p>
          <p className="mono text-[10px] tracking-[0.2em] text-white/30">
            SYNTHETIC DEMO CORPUS · NO REAL PERSONS OR CASES ARE DEPICTED
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ============================== Page ============================== */

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <FloatingNav />
      <Hero />
      <IsolationSection />
      <PipelineSection />
      <CapabilitySection />
      <TrustSection />
      <SiteFooter />
    </div>
  );
}
