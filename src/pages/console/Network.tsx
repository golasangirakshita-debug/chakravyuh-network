import cytoscape from "cytoscape";
import type { Core } from "cytoscape";
import { useVyuh } from "@/store/vyuh";
import { deriveGraph, type GraphNode, type SourceType } from "@/lib/data";
import {
  analyzeSelection,
  breachRanks,
  casesUpToDate,
  componentsFor,
  flagStory,
  FRAGMENT_COLORS,
  LABYRINTH_STEPS,
  spiralLayout,
  timelineDays,
  type BreachRank,
  type SpiralGuide,
} from "@/lib/analysis";
import { AnimatePresence, motion } from "framer-motion";
import {
  Compass,
  Pause,
  Play,
  RotateCcw,
  Search as SearchIcon,
  Snowflake,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import IntelPanel from "./IntelPanel";
import {
  buildElements,
  CY_STYLE,
  LAYER_META,
  netClass,
  NODE_VISUALS,
} from "./networkElements";

const RM = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const HULLS = [
  { key: "neta", label: "NET-A", color: "#22D3EE" },
  { key: "netb", label: "NET-B", color: "#A78BFA" },
  { key: "noise", label: "NOISE", color: "#6B7280" },
] as const;

const TOOLBTN =
  "mono inline-flex items-center gap-2 rounded-full border border-white/12 bg-[#0B0F1A]/85 px-3.5 py-2 text-[10px] font-bold tracking-[0.14em] text-white/70 backdrop-blur transition hover:border-white/30 hover:text-white";

export default function NetworkPage() {
  const { cases, extraEntities, highlightPhones, pushAudit, session } = useVyuh();
  const [params] = useSearchParams();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const ringRef = useRef<SVGGElement | null>(null);
  const hullRefs = {
    neta: useRef<HTMLDivElement | null>(null),
    netb: useRef<HTMLDivElement | null>(null),
    noise: useRef<HTMLDivElement | null>(null),
  };

  const [selection, setSelection] = useState<{ type: "node" | "edge"; id: string } | null>(null);
  const [layers, setLayers] = useState<Record<SourceType, boolean>>({
    fir: true,
    cdr: true,
    financial: true,
    osint: true,
  });
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [spiral, setSpiral] = useState(false);
  const [rings, setRings] = useState<SpiralGuide[]>([]);
  const [breachOpen, setBreachOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const [frozen, setFrozen] = useState<{ id: string; before: number; after: number } | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const [searchQ, setSearchQ] = useState("");

  const graph = useMemo(() => deriveGraph(cases, extraEntities), [cases, extraEntities]);
  const days = useMemo(() => timelineDays(), []);
  const selectedDate = replayIdx === null ? days[days.length - 1] : days[replayIdx];
  const casesAtDate = useMemo(() => casesUpToDate(cases, selectedDate), [cases, selectedDate]);
  const analysis = useMemo(
    () => (selection ? analyzeSelection(selection.id, casesAtDate) : null),
    [selection, casesAtDate],
  );
  const story = useMemo(() => flagStory(cases), [cases]);
  const breaches = useMemo(() => breachRanks(cases), [cases]);

  const audit = useCallback(
    (action: string, result = "OK") =>
      pushAudit({
        ts: new Date().toISOString(),
        actor: session?.badge ?? "INV-2041",
        action,
        result,
      }),
    [pushAudit, session?.badge],
  );

  /* ---------- halo hulls + ring sync (imperative, outside React state) ---------- */

  const updateHulls = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const z = cy.zoom();
    const p = cy.pan();
    for (const hull of HULLS) {
      const el = hullRefs[hull.key].current;
      if (!el) continue;
      const nodes = cy.nodes(`.${hull.key}`);
      const visible = nodes.filter(n => n.style("display") !== "none");
      if (visible.empty()) {
        el.style.opacity = "0";
        continue;
      }
      const bb = visible.boundingBox();
      const x = bb.x1 * z + p.x - 20;
      const y = bb.y1 * z + p.y - 30;
      const w = bb.w * z + 40;
      const h = bb.h * z + 60;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.width = `${Math.max(40, w)}px`;
      el.style.height = `${Math.max(40, h)}px`;
      el.style.opacity = "1";
    }
    if (ringRef.current) {
      ringRef.current.setAttribute("transform", `translate(${p.x} ${p.y}) scale(${z})`);
    }
  }, []);

  /* ---------- init cytoscape once ---------- */

  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: buildElements(graph.nodes, graph.edges),
      style: CY_STYLE,
      layout: {
        name: "cose",
        animate: false,
        padding: 44,
        idealEdgeLength: 92,
        nodeRepulsion: 4600,
        randomize: true,
      },
      minZoom: 0.25,
      maxZoom: 3,
      boxSelectionEnabled: false,
      wheelSensitivity: 0.2,
    });
    cyRef.current = cy;

    cy.on("tap", "node", evt => {
      const id = (evt.target as cytoscape.NodeSingular).id();
      setSelection({ type: "node", id });
    });
    cy.on("tap", "edge", evt => {
      const id = (evt.target as cytoscape.EdgeSingular).id();
      setSelection({ type: "edge", id });
    });
    cy.on("tap", evt => {
      if (evt.target === cy) setSelection(null);
    });
    cy.on("render zoom pan layoutstop", updateHulls);
    // cose can settle outside the visible viewport, which reads as a blank
    // graph. Fit once the layout finishes, and again after the first resize.
    cy.one("layoutstop", () => {
      cy.fit(undefined, 56);
      updateHulls();
    });
    requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const { offsetWidth: w, offsetHeight: h } = containerRef.current;
      if (w > 0 && h > 0) cy.resize();
      cy.fit(undefined, 56);
      updateHulls();
      setReady(true);
    });

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const { offsetWidth: w, offsetHeight: h } = containerRef.current;
      if (w === 0 || h === 0) return;
      cy.resize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- live data sync ---------- */

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const els = buildElements(graph.nodes, graph.edges);
    if (cy.elements().length === els.length) return;
    cy.elements().remove();
    cy.add(els);
    cy.layout({ name: "cose", animate: false, padding: 44 }).run();
    cy.fit(undefined, 56);
    audit("network.reload", `${graph.nodes.length} nodes`);
  }, [graph, audit]);

  /* ---------- layer + time filters ---------- */

  const applyFilters = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.edges().forEach(e => {
        const st = e.data("sourceType") as SourceType;
        const visible = layers[st] !== false && e.data("date") <= selectedDate;
        e.style("display", visible ? "element" : "none");
      });
      cy.nodes().forEach(n => {
        if (n.data("kind") === "case") {
          n.style("display", n.data("date") <= selectedDate ? "element" : "none");
        }
      });
      cy.nodes().forEach(n => {
        if (n.data("kind") !== "entity") return;
        const anyVisible = n
          .connectedEdges()
          .some(e => e.style("display") !== "none" && e.style("opacity") !== "0.06");
        n.style("display", anyVisible ? "element" : "none");
      });
    });
    updateHulls();
  }, [layers, selectedDate, updateHulls]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  /* ---------- highlight from a freshly registered case ---------- */

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("hl");
    const net = params.get("net");
    if (net) {
      const nodes = cy.nodes(`.${netClass(net)}`);
      nodes.addClass("hl");
      if (!nodes.empty()) cy.animate({ fit: { eles: nodes, padding: 80 }, duration: 600 });
      return;
    }
    if (!highlightPhones?.length) return;
    const targets = cy.nodes().filter(n =>
      highlightPhones.some(p => String(n.data("fullLabel") ?? "").includes(p)),
    );
    targets.addClass("hl");
    if (!targets.empty()) {
      cy.animate({ fit: { eles: targets, padding: 70 }, duration: 700 });
      audit("network.highlight", highlightPhones.join(","));
    }
  }, [highlightPhones, cases, params, audit]);

  /* ---------- search dimming ---------- */

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass("dim");
    if (!searchQ.trim()) return;
    const q = searchQ.trim().toLowerCase();
    const matches = cy.nodes().filter(
      n =>
        String(n.data("label") ?? "").toLowerCase().includes(q) ||
        String(n.data("fullLabel") ?? "").toLowerCase().includes(q),
    );
    cy.nodes().not(matches).addClass("dim");
    if (!matches.empty()) cy.animate({ fit: { eles: matches, padding: 80 }, duration: 500 });
  }, [searchQ]);

  /* ---------- replay autoplay ---------- */

  useEffect(() => {
    if (!playing) return;
    if (replayIdx === null) {
      setPlaying(false);
      return;
    }
    if (replayIdx >= days.length - 1) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(
      () => setReplayIdx(i => (i === null ? 0 : i + 1)),
      RM() ? 40 : 620,
    );
    return () => window.clearTimeout(id);
  }, [playing, replayIdx, days.length]);

  /* ---------- spiral layout ---------- */

  const applySpiral = useCallback(
    (on: boolean) => {
      const cy = cyRef.current;
      if (!cy) return;
      if (on) {
        const { positions, guides } = spiralLayout(
          graph.nodes,
          cases,
          cy.width(),
          cy.height(),
        );
        setRings(guides);
        cy.batch(() => {
          cy.nodes().forEach(n => {
            const p = positions.get(n.id());
            if (!p) return;
            n.animate(
              { position: p },
              { duration: RM() ? 0 : 1000, easing: "ease-out-cubic", queue: false },
            );
          });
        });
        setSpiral(true);
        audit("network.spiral", "chakravyuh view");
      } else {
        setRings([]);
        setSpiral(false);
        setStep(null);
        cy.layout({ name: "cose", animate: !RM(), animationDuration: 900, padding: 44 }).run();
        audit("network.layout", "cose");
      }
    },
    [graph.nodes, cases, audit],
  );

  /* ---------- labyrinth walkthrough ---------- */

  const applyStep = useCallback(
    (i: number | null) => {
      const cy = cyRef.current;
      if (!cy) return;
      cy.batch(() => {
        cy.elements().removeClass("step-on step-dim");
        if (i === null) return;
        const s = LABYRINTH_STEPS[i];
        cy.nodes().forEach(n => {
          const stub = {
            id: n.id(),
            network: n.data("network"),
            kind: n.data("kind"),
          } as unknown as GraphNode;
          if (s.match(stub)) n.addClass("step-on");
          else n.addClass("step-dim");
        });
        cy.edges().forEach(e => {
          if (e.source().hasClass("step-on") && e.target().hasClass("step-on")) {
            e.removeClass("step-dim");
            if (i === 2) e.addClass("hl");
          } else {
            e.addClass("step-dim");
          }
        });
      });
      const on = cy.nodes(".step-on");
      if (!on.empty()) {
        cy.animate({ fit: { eles: on, padding: 90 }, duration: RM() ? 0 : 700 });
      }
    },
    [],
  );

  const nextStep = () => {
    if (step === null) return;
    if (step >= LABYRINTH_STEPS.length - 1) {
      setStep(null);
      applyStep(null);
      audit("labyrinth.exit");
      return;
    }
    const n = step + 1;
    setStep(n);
    applyStep(n);
    audit("labyrinth.step", LABYRINTH_STEPS[n].label);
  };

  /* ---------- analyze sequence ---------- */

  const runAnalyze = async () => {
    const cy = cyRef.current;
    if (!cy || analyzing) return;
    setAnalyzing(true);
    setSelection(null);
    setStep(null);
    applyStep(null);
    audit("network.analyze", "reveal started");

    const snapshot = cy.elements().jsons() as cytoscape.ElementDefinition[];
    const nodeDefs = snapshot.filter(el => el.group === "nodes");
    const edgeDefs = snapshot.filter(el => el.group === "edges");

    cy.edges().remove();
    cy.nodes("node.entity").remove();
    cy.layout({ name: "cose", animate: !RM(), animationDuration: 700, padding: 70 }).run();
    await sleep(RM() ? 30 : 650);

    const shared = nodeDefs.filter(
      el => String(el.data.caseIds ?? "").split(",").filter(Boolean).length > 1,
    );
    const rest = nodeDefs.filter(el => !shared.includes(el));

    for (const el of shared) {
      if (RM()) break;
      cy.add(el);
      const node = cy.getElementById(String(el.data.id));
      node.style({
        "underlay-color": "#FF4FA3",
        "underlay-opacity": 0.85,
        "underlay-padding": 14,
      });
      window.setTimeout(() => {
        node.removeStyle("underlay-color");
        node.removeStyle("underlay-opacity");
        node.removeStyle("underlay-padding");
      }, 700);
      await sleep(170);
    }
    for (const el of shared) if (cy.getElementById(String(el.data.id)).empty()) cy.add(el);
    for (const el of rest) cy.add(el);
    for (const el of edgeDefs) {
      if (!cy.getElementById(String(el.data.id)).empty()) continue;
      const src = cy.getElementById(String(el.data.source));
      const tgt = cy.getElementById(String(el.data.target));
      if (!src.empty() && !tgt.empty()) cy.add(el);
    }

    await sleep(RM() ? 30 : 320);
    cy.layout({
      name: "cose",
      animate: !RM(),
      animationDuration: 1100,
      padding: 48,
      nodeRepulsion: 4600,
    }).run();
    applyFilters();
    setAnalyzing(false);
    audit("network.analyze", "clusters formed");
  };

  /* ---------- breach / freeze ---------- */

  const freeze = (rank: BreachRank) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("frozen frozen-edge");
    cy.nodes().forEach(n => {
      if (n.data("kind") === "case") n.removeStyle("background-color");
    });

    const node = cy.getElementById(rank.nodeId);
    if (node.empty()) return;
    node.addClass("frozen");
    node.connectedEdges().addClass("frozen-edge");

    const comps = componentsFor(cases, rank.nodeId);
    const cx = cy.width() / 2;
    const cyMid = cy.height() / 2;

    comps.forEach((comp, ci) => {
      const angle = (ci / Math.max(1, comps.length)) * Math.PI * 2 - Math.PI / 2;
      const ox = cx + Math.cos(angle) * 250;
      const oy = cyMid + Math.sin(angle) * 200;
      comp.forEach((caseId, k) => {
        const n = cy.getElementById(caseId);
        if (n.empty()) return;
        n.style("background-color", FRAGMENT_COLORS[ci % FRAGMENT_COLORS.length]);
        const a = (k / Math.max(1, comp.length)) * Math.PI * 2;
        n.animate(
          { position: { x: ox + Math.cos(a) * 78, y: oy + Math.sin(a) * 64 } },
          { duration: RM() ? 0 : 900, easing: "ease-out-cubic", queue: false },
        );
      });
    });
    node.animate(
      { position: { x: cx, y: cyMid } },
      { duration: RM() ? 0 : 900, easing: "ease-out-cubic", queue: false },
    );

    setFrozen({
      id: rank.nodeId,
      before: 1,
      after: rank.netFragments > 1 ? rank.netFragments : rank.fragments,
    });
    audit("breach.freeze", `${rank.label} → ${comps.length} fragments`);
  };

  const restore = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("frozen frozen-edge");
    cy.nodes().forEach(n => {
      if (n.data("kind") === "case") n.removeStyle("background-color");
    });
    setFrozen(null);
    if (spiral) applySpiral(true);
    else cy.layout({ name: "cose", animate: !RM(), animationDuration: 800, padding: 44 }).run();
    audit("breach.restore");
  };

  const visibleEdges = useMemo(() => {
    return Math.max(0, days.length - 1);
  }, [days.length]);
  void visibleEdges;

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[560px] gap-4">
      {/* ---------------- graph ---------------- */}
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/8 bg-[#070910]/70">
        {/* rings + hulls behind the canvas */}
        <div className="pointer-events-none absolute inset-0 z-0">
          {rings.length > 0 && (
            <svg className="absolute inset-0 h-full w-full">
              <g ref={ringRef}>
                <circle
                  cx={containerRef.current ? 0 : 0}
                  cy={0}
                  r={0}
                  fill="none"
                  stroke="none"
                />
                <SpiralRings rings={rings} />
              </g>
            </svg>
          )}
          {HULLS.map(h => (
            <div
              key={h.key}
              ref={hullRefs[h.key]}
              className="absolute rounded-[46px] border border-dashed opacity-0 transition-opacity duration-500"
              style={{
                borderColor: `${h.color}38`,
                background: `radial-gradient(60% 60% at 50% 50%, ${h.color}14, transparent 70%)`,
              }}
            >
              <span
                className="mono absolute -top-2 left-3 rounded-full px-2 text-[9px] font-bold tracking-[0.22em]"
                style={{ color: h.color, background: "#070910" }}
              >
                {h.label}
              </span>
            </div>
          ))}
        </div>

        <div ref={containerRef} className="absolute inset-0 z-10" />

        {/* graph mount / layout state */}
        {!ready && (
          <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-[#070910]/85">
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-12 w-12">
                <span className="absolute inset-0 rounded-full border border-[#22D3EE]/25" />
                <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#22D3EE]" />
                <span className="absolute inset-2 rounded-full border border-[#A78BFA]/30 animate-pulse" />
              </div>
              <p className="mono text-[11px] tracking-[0.28em] text-[#22D3EE]">
                RESOLVING ENTITIES
              </p>
              <p className="mono text-[9px] tracking-[0.2em] text-white/30">
                COSE LAYOUT · {graph.nodes.length} NODES · {graph.edges.length} EDGES
              </p>
            </div>
          </div>
        )}

        {/* toolbar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start gap-2 p-3">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <button
              onClick={runAnalyze}
              disabled={analyzing}
              className="mono inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#22D3EE] to-[#A78BFA] px-4 py-2 text-[10px] font-bold tracking-[0.14em] text-[#041018] transition hover:opacity-90 disabled:opacity-60"
            >
              {analyzing ? <Sparkles className="h-3.5 w-3.5 animate-pulse" /> : <Waypoints className="h-3.5 w-3.5" />}
              {analyzing ? "ANALYZING…" : "ANALYZE NETWORK"}
            </button>

            <button onClick={() => applySpiral(!spiral)} className={TOOLBTN}>
              <Compass className="h-3.5 w-3.5" />
              {spiral ? "COSE VIEW" : "CHAKRAVYUH VIEW"}
            </button>

            {spiral && (
              <button
                onClick={() => {
                  if (step === null) {
                    setStep(0);
                    applyStep(0);
                    audit("labyrinth.enter");
                  } else {
                    nextStep();
                  }
                }}
                className="mono inline-flex items-center gap-2 rounded-full border border-[#FF4FA3]/50 bg-[#FF4FA3]/10 px-3.5 py-2 text-[10px] font-bold tracking-[0.14em] text-[#FF4FA3] transition hover:bg-[#FF4FA3]/20"
              >
                <Snowflake className="h-3.5 w-3.5" />
                {step === null ? "ENTER THE LABYRINTH" : step >= LABYRINTH_STEPS.length - 1 ? "EXIT" : "DEEPER →"}
              </button>
            )}

            <button
              onClick={() => {
                setBreachOpen(v => !v);
                setFrozen(null);
                audit("breach.scan");
              }}
              className={TOOLBTN}
            >
              <Waypoints className="h-3.5 w-3.5" />
              FIND BREACH POINTS
            </button>

            <div className="pointer-events-auto relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="find node…"
                className="mono h-9 w-40 rounded-full border border-white/12 bg-[#0B0F1A]/85 pl-9 pr-3 text-[11px] text-white/85 placeholder:text-white/30 focus:border-[#22D3EE]/60 focus:outline-none"
              />
            </div>
          </div>

          {/* layer toggles */}
          <div className="pointer-events-auto ml-auto flex items-center gap-1.5 rounded-full border border-white/12 bg-[#0B0F1A]/85 px-3 py-2 backdrop-blur">
            <Sliders className="mr-1 h-3.5 w-3.5 text-white/35" />
            {LAYER_META.map(l => (
              <button
                key={l.key}
                onClick={() => setLayers(prev => ({ ...prev, [l.key]: !prev[l.key] }))}
                className="mono rounded-full border px-2.5 py-1 text-[9px] font-bold tracking-[0.14em] transition"
                style={{
                  borderColor: layers[l.key] ? l.color : "rgba(255,255,255,0.12)",
                  color: layers[l.key] ? l.color : "rgba(255,255,255,0.3)",
                  background: layers[l.key] ? `${l.color}18` : "transparent",
                }}
              >
                {l.label.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* breach panel */}
        <AnimatePresence>
          {breachOpen && (
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              className="absolute left-3 top-20 z-20 w-[300px] rounded-2xl border border-white/10 bg-[#070910]/95 p-4 backdrop-blur-xl"
            >
              <div className="flex items-center justify-between">
                <p className="mono text-[10px] font-bold tracking-[0.2em] text-[#22D3EE]">
                  BREACH POINTS
                </p>
                <span className="mono text-[9px] text-white/30">RANKED</span>
              </div>

              {frozen ? (
                <div className="mt-3">
                  <p className="text-sm font-semibold text-white">
                    {analysis ? "" : ""}
                    <span className="mono text-[11px] text-[#93C5FD]">
                      {frozen.id.toUpperCase()} FROZEN
                    </span>
                  </p>
                  <p className="mono mt-2 text-[10px] leading-5 tracking-wide text-white/50">
                    BEFORE {frozen.before} NETWORK → AFTER {frozen.after} FRAGMENTS
                  </p>
                  <button
                    onClick={restore}
                    className="mono mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 py-2 text-[10px] font-bold tracking-[0.14em] text-white/70 transition hover:border-white/35 hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> RESTORE
                  </button>
                  <p className="mono mt-2 text-[9px] leading-4 text-white/35">
                    PRIORITIES FOR HUMAN REVIEW, NOT TARGETS.
                  </p>
                </div>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {breaches.slice(0, 6).map((b, i) => (
                    <li key={b.nodeId}>
                      <button
                        onClick={() => freeze(b)}
                        className="flex w-full items-center gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-left transition hover:border-[#22D3EE]/40 hover:bg-white/[0.06]"
                      >
                        <span className="mono w-4 text-[10px] text-white/30">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="mono block truncate text-[11px] text-white/85">
                            {b.label}
                          </span>
                          <span className="mono block text-[9px] tracking-wider text-white/35">
                            {b.type.toUpperCase()} · −{b.pairsLost} LINKS
                          </span>
                        </span>
                        <span
                          className={`mono text-[10px] font-bold ${
                            b.fragmentsDelta > 0 ? "text-[#F59E0B]" : "text-white/20"
                          }`}
                          title={`splits the graph into ${b.fragmentsDelta + 1} piece${
                            b.fragmentsDelta === 0 ? "" : "s"
                          }`}
                        >
                          {b.fragmentsDelta > 0 ? `⇩${b.fragmentsDelta + 1}` : "—"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* labyrinth caption */}
        <AnimatePresence>
          {step !== null && step < LABYRINTH_STEPS.length && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
              className="absolute bottom-24 left-3 z-20 w-[330px] rounded-2xl border border-[#FF4FA3]/30 bg-[#070910]/95 p-4 backdrop-blur-xl"
            >
              <p className="mono text-[10px] font-bold tracking-[0.24em] text-[#FF4FA3]">
                LAYER {step + 1} / {LABYRINTH_STEPS.length} · {LABYRINTH_STEPS[step].label.toUpperCase()}
              </p>
              <p className="mt-2 text-[12px] leading-5 text-white/65">
                {LABYRINTH_STEPS[step].caption}
              </p>
              {step === 2 && (
                <p className="mono mt-2 text-[9px] tracking-wide text-[#22D3EE]">
                  EXIT VECTOR: MULE ACCOUNT XXXX3310 IS THE ONE EDGE THAT JOINS BOTH
                  RINGS.
                </p>
              )}
              <button
                onClick={nextStep}
                className="mono mt-3 w-full rounded-full border border-white/15 py-2 text-[10px] font-bold tracking-[0.14em] text-white/75 transition hover:border-white/35 hover:text-white"
              >
                {step >= LABYRINTH_STEPS.length - 1 ? "EXIT THE LABYRINTH" : "GO DEEPER →"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* legend */}
        <div className="absolute bottom-24 right-3 z-20 rounded-2xl border border-white/10 bg-[#070910]/90 p-3 backdrop-blur-xl">
          <p className="mono mb-2 text-[9px] font-bold tracking-[0.22em] text-white/40">LEGEND</p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {Object.entries(NODE_VISUALS).map(([key, v]) => (
              <li key={key} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0"
                  style={{
                    background: v.color,
                    clipPath:
                      v.shape === "diamond"
                        ? "polygon(50% 0,100% 50%,50% 100%,0 50%)"
                        : v.shape === "hexagon"
                          ? "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)"
                          : v.shape === "roundrectangle"
                            ? "inset(0 round 2px)"
                            : v.shape === "vee"
                              ? "polygon(50% 0,100% 100%,50% 78%,0 100%)"
                              : "circle(50%)",
                  }}
                />
                <span className="mono text-[9px] tracking-wider text-white/55">{v.label}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2 border-t border-white/8 pt-2">
            {LAYER_META.map(l => (
              <span key={l.key} className="flex items-center gap-1.5">
                <span className="inline-block h-px w-4" style={{ background: l.color }} />
                <span className="mono text-[9px] tracking-wider text-white/55">{l.label}</span>
              </span>
            ))}
          </div>
          <p className="mono mt-2 max-w-[190px] text-[8px] leading-3 tracking-wide text-white/30">
            EDGE WIDTH = CONFIDENCE · EDGE COLOUR = SOURCE
          </p>
        </div>

        {/* replay bar */}
        <div className="absolute inset-x-3 bottom-3 z-20 rounded-2xl border border-white/10 bg-[#070910]/95 p-3 backdrop-blur-xl">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                if (replayIdx === null) setReplayIdx(0);
                setPlaying(p => !p);
              }}
              className="mono inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#22D3EE]/45 bg-[#22D3EE]/12 text-[#22D3EE] transition hover:bg-[#22D3EE]/25"
              aria-label="Play replay"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>

            <div className="flex min-w-[220px] flex-1 items-center gap-3">
              <span className="mono text-[10px] text-white/45">10 JUN</span>
              <input
                type="range"
                min={0}
                max={days.length - 1}
                value={replayIdx ?? days.length - 1}
                onChange={e => {
                  setReplayIdx(Number(e.target.value));
                  setPlaying(false);
                }}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/12 accent-[#22D3EE]"
              />
              <span className="mono text-[10px] text-white/45">28 JUN</span>
            </div>

            <span className="mono rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[10px] tracking-widest text-white/70">
              AS OF {selectedDate.slice(8, 10)} JUN 2026
            </span>
          </div>

          <p className="mt-2 text-[11px] leading-5 text-white/45">
            <span className="text-white/80">
              CHAKRAVYUH would have flagged this network {story.daysBeforeLast} days
              before the last linked FIR
            </span>{" "}
            ({story.lastFir}), across {story.statesAtFlag} states — on {story.flagDate}.
          </p>
        </div>
      </div>

      {/* ---------------- intelligence panel ---------------- */}
      <AnimatePresence>
        {selection && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 400, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 260 }}
            className="relative hidden shrink-0 overflow-hidden lg:block"
          >
            <IntelPanel
              analysis={analysis}
              onClose={() => setSelection(null)}
              onAudit={action => audit(action, selection.id)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* small-screen panel */}
      {selection && (
        <div className="fixed inset-0 z-40 flex justify-end lg:hidden">
          <button
            className="absolute inset-0 bg-black/60"
            onClick={() => setSelection(null)}
            aria-label="Close panel"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            className="relative h-full w-[min(420px,100%)]"
          >
            <IntelPanel
              analysis={analysis}
              onClose={() => setSelection(null)}
              onAudit={action => audit(action, selection.id)}
            />
          </motion.div>
        </div>
      )}
    </div>
  );
}

/* ---------- small helpers / bits ---------- */

function Sliders({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="9" cy="6" r="2" fill="#0B0F1A" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="15" cy="12" r="2" fill="#0B0F1A" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="18" r="2" fill="#0B0F1A" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function SpiralRings({ rings }: { rings: SpiralGuide[] }) {
  return (
    <>
      {rings.map((r, i) => (
        <circle
          key={i}
          cx={0}
          cy={0}
          r={r.r}
          fill="none"
          stroke="rgba(167,139,250,0.16)"
          strokeWidth={1 / (rings[rings.length - 1]?.r || 1)}
          vectorEffect="non-scaling-stroke"
          strokeDasharray="4 8"
        />
      ))}
    </>
  );
}
