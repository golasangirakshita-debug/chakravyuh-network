import { api } from "@/convex/_generated/api";
import {
  CASES,
  CDR_ROWS,
  EVIDENCE,
  GHOST_SEEDS,
  NODES,
  EDGES,
  SOURCE_COLOR,
  TRANSACTIONS,
  type GraphEdge,
} from "@/lib/data";
import {
  clusterEmbeddings,
  detectAnomalies,
  predictLinks,
  trainGnn,
  type Anomaly,
  type Cluster,
} from "@/lib/gnn";
import { useQuery } from "convex/react";
import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from "cytoscape";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Crosshair,
  Eye,
  EyeOff,
  Ghost,
  Loader2,
  Maximize2,
  Search,
  Waypoints,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/* ==================================================================== *
 * Visual configuration
 * ==================================================================== */

const NET_COLOR: Record<string, string> = {
  "NET-A": "#22D3EE",
  "NET-B": "#F59E0B",
  NOISE: "#8B93A7",
  GHOST: "#EF4444",
};

const TYPE_COLOR: Record<string, string> = {
  phone: "#F59E0B",
  bank: "#22C55E",
  upi: "#A3E635",
  alias: "#A78BFA",
  location: "#94A3B8",
  person: "#F5F7FB",
  case: "#22D3EE",
};

/** Deterministic jitter so the layout is identical on every mount. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Avatar as an inline SVG data URI — no network fetch, no broken images. */
function avatarURI(label: string, ring: string, ghost = false): string {
  const initials = ghost
    ? "?"
    : label
        .replace(/[^\p{L}\p{N}\s]/gu, "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(s => s[0]?.toUpperCase() ?? "")
        .join("") || "?";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="84" height="84" viewBox="0 0 84 84">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${ring}" stop-opacity="0.92"/>
<stop offset="1" stop-color="#0B1018" stop-opacity="0.96"/>
</linearGradient></defs>
<circle cx="42" cy="42" r="40" fill="url(#g)" stroke="${ghost ? "#EF4444" : "#0B1018"}" stroke-width="2"/>
<text x="42" y="43" text-anchor="middle" dominant-baseline="central"
 font-family="ui-sans-serif,system-ui,sans-serif" font-size="${initials.length > 1 ? 30 : 36}"
 font-weight="700" fill="#0A0E15">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ==================================================================== *
 * Element construction
 * ==================================================================== */

interface GraphBundle {
  elements: ElementDefinition[];
  positions: Record<string, { x: number; y: number }>;
  satellites: number;
}

function buildGraph(): GraphBundle {
  const els: ElementDefinition[] = [];
  const pos: Record<string, { x: number; y: number }> = {};
  const rand = prng(20260618);

  const hubs = NODES.filter(n => n.kind === "entity" && n.type === "person");
  const cases = NODES.filter(n => n.kind === "case");
  const others = NODES.filter(n => n.kind === "entity" && n.type !== "person");

  /* ---- hubs sit on a wide ring, grouped by network ---- */
  const hubIds = new Set(hubs.map(h => h.id));
  hubs.forEach((h, i) => {
    const angle = (i / Math.max(1, hubs.length)) * Math.PI * 2 - Math.PI / 2;
    pos[h.id] = { x: Math.cos(angle) * 620, y: Math.sin(angle) * 430 };
  });

  /* ---- case nodes on an inner ring ---- */
  cases.forEach((c, i) => {
    const angle = (i / Math.max(1, cases.length)) * Math.PI * 2 - Math.PI / 2 + 0.22;
    pos[c.id] = { x: Math.cos(angle) * 300, y: Math.sin(angle) * 210 };
  });

  /* ---- entity satellites fan outward from the centre ---- */
  others.forEach((n, i) => {
    const angle = (i / Math.max(1, others.length)) * Math.PI * 2 - Math.PI / 2;
    const radius = 900 + (i % 4) * 130 + rand() * 90;
    pos[n.id] = { x: Math.cos(angle) * radius * 1.25, y: Math.sin(angle) * radius * 0.82 };
  });

  /* ---- activity satellites: real CDR rows and transactions ---- */
  let satellites = 0;
  const activityHost = new Map<string, { x: number; y: number }>();
  const attach = (hostId: string, key: string, label: string, kind: string, color: string, when: string) => {
    const host = pos[hostId];
    if (!host) return;
    const bucket = activityHost.get(hostId) ?? { x: host.x, y: host.y };
    const idx = satellites++;
    const spread = 0.55;
    const a = rand() * Math.PI * 2;
    const r = 110 + Math.sqrt(idx % 40) * 34 + rand() * 26;
    pos[key] = {
      x: bucket.x + Math.cos(a) * r * (1 + spread * rand()),
      y: bucket.y + Math.sin(a) * r * 0.72,
    };
    els.push({
      group: "nodes",
      data: { id: key, kind: "activity", type: kind, label, when, network: "" },
      classes: `activity act-${kind}`,
      style: { "background-color": color, "border-color": color },
    });
  };

  for (const row of CDR_ROWS) {
    const host = NODES.find(n => n.type === "phone" && n.label === row.phone);
    if (!host) continue;
    attach(host.id, `act-${row.id}`, row.city, "call", TYPE_COLOR.phone, row.ts);
  }
  for (const t of TRANSACTIONS) {
    const host = NODES.find(
      n =>
        (n.type === "bank" && t.to.includes(n.label.slice(-4))) ||
        (n.type === "upi" && n.label === t.to) ||
        (n.type === "bank" && t.from.includes(n.label.slice(-4))),
    );
    if (!host) continue;
    attach(host.id, `act-${t.id}`, `₹${Math.round(t.amount / 1000)}k`, "money", TYPE_COLOR.bank, t.date);
  }
  for (const e of EVIDENCE.slice(0, 18)) {
    const key = `ev-${e.id}`;
    const host = NODES.find(n => n.kind === "case" && n.id === e.caseId);
    if (!host) continue;
    attach(host.id, key, e.type, "evidence", "#64748B", e.timestamp);
  }

  /* ---- the ghost node: pinned, ambiguous, highest priority ---- */
  const ghost = GHOST_SEEDS[0];
  const ghostId = "GHOST";
  pos[ghostId] = { x: 0, y: -40 };

  /* ---- real nodes ---- */
  for (const n of [...hubs, ...cases, ...others]) {
    const isHub = hubIds.has(n.id);
    els.push({
      group: "nodes",
      data: {
        id: n.id,
        kind: isHub ? "hub" : n.kind,
        type: n.type,
        label: isHub ? `${n.label}\n${n.sub ?? n.type}` : n.label,
        fullLabel: n.label,
        network: n.network,
        date: n.date,
        sub: n.sub ?? "",
        cases: n.caseIds.length,
        avatar: isHub ? avatarURI(n.label, NET_COLOR[n.network] ?? "#22D3EE") : "",
      },
      classes: [
        isHub ? "hub" : n.kind,
        n.type,
        n.network === "NET-A" ? "neta" : n.network === "NET-B" ? "netb" : "noise",
      ].join(" "),
      style: isHub ? { "background-image": avatarURI(n.label, NET_COLOR[n.network] ?? "#22D3EE") } : undefined,
    });
  }

  els.push({
    group: "nodes",
    data: {
      id: ghostId,
      kind: "ghost",
      type: "unknown",
      label: "Unknown handler",
      fullLabel: ghost.title,
      network: "GHOST",
      cases: 0,
      avatar: avatarURI("?", "#EF4444", true),
    },
    classes: "ghost",
    style: { "background-image": avatarURI("?", "#EF4444", true) },
  });

  /* ---- edges ---- */
  const addEdge = (id: string, s: string, t: string, type: string, confidence: number) => {
    if (!pos[s] || !pos[t]) return;
    els.push({
      group: "edges",
      data: { id, source: s, target: t, sourceType: type, confidence, date: "" },
      classes: `src-${type}${confidence >= 0.85 ? " strong" : ""}`,
    });
  };

  for (const e of EDGES as GraphEdge[]) addEdge(e.id, e.source, e.target, e.sourceType, e.confidence);

  // ghost anchors — hypotheses, drawn dashed and never as facts
  for (const seed of GHOST_SEEDS) {
    seed.between.forEach((b, i) => {
      if (pos[b]) addEdge(`ghost-${seed.id}-${i}`, ghostId, b, "hypothesis", 0.4);
    });
  }

  return { elements: els, positions: pos, satellites };
}

/* ==================================================================== *
 * Styles
 * ==================================================================== */

const STYLE: StylesheetJson = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "font-family": "ui-monospace, Menlo, monospace",
      "font-size": 8,
      color: "#AEB9C9",
      "text-outline-color": "#0B0E13",
      "text-outline-width": 2,
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 4,
      "min-zoomed-font-size": 6,
      "border-width": 1,
      "border-color": "#0B0E13",
    },
  },
  /* hub chips: avatar on the left, name + number on the right */
  {
    selector: "node.hub",
    style: {
      shape: "roundrectangle",
      width: 176,
      height: 48,
      "background-color": "#171C25",
      "background-image": "data(avatar)",
      "background-width": 36,
      "background-height": 36,
      "background-position-x": 7,
      "background-position-y": "50%",
      "background-clip": "none",
      "border-width": 2,
      "border-color": "#2A3340",
      "font-family": "ui-sans-serif, system-ui, sans-serif",
      "font-size": 10,
      "font-weight": 700,
      color: "#F2F6FC",
      "text-wrap": "wrap",
      "text-max-width": "108px",
      "text-valign": "center",
      "text-halign": "center",
      "text-margin-y": 0,
      "text-margin-x": 16,
      "text-outline-width": 0,
      "min-zoomed-font-size": 8,
      "z-index": 20,
    },
  },
  { selector: "node.hub.neta", style: { "border-color": "#22D3EE" } },
  { selector: "node.hub.netb", style: { "border-color": "#F59E0B" } },
  { selector: "node.hub.noise", style: { "border-color": "#4B5563" } },

  {
    selector: "node.ghost",
    style: {
      shape: "roundrectangle",
      width: 168,
      height: 46,
      "background-color": "#2A1216",
      "background-image": "data(avatar)",
      "background-width": 34,
      "background-height": 34,
      "background-position-x": 6,
      "background-position-y": "50%",
      "background-clip": "none",
      "border-width": 2,
      "border-style": "dashed",
      "border-color": "#EF4444",
      "underlay-color": "#EF4444",
      "underlay-opacity": 0.16,
      "underlay-padding": 10,
      "font-family": "ui-sans-serif, system-ui, sans-serif",
      "font-size": 10,
      "font-weight": 800,
      color: "#FFD9DD",
      "text-valign": "center",
      "text-halign": "center",
      "text-margin-x": 14,
      "text-outline-width": 0,
      "z-index": 60,
    },
  },

  {
    selector: "node.case",
    style: {
      shape: "roundrectangle",
      width: 52,
      height: 24,
      "background-color": "#0F2A33",
      "border-width": 1.5,
      "border-color": "#22D3EE",
      "font-size": 8,
      "font-weight": 700,
      color: "#9FE9F6",
      "text-valign": "center",
      "text-margin-y": 0,
      "z-index": 15,
    },
  },

  /* entity satellites */
  { selector: "node.person", style: { width: 20, height: 20, "background-color": "#F5F7FB" } },
  { selector: "node.phone", style: { shape: "diamond", width: 16, height: 16, "background-color": "#F59E0B" } },
  { selector: "node.bank", style: { shape: "hexagon", width: 18, height: 16, "background-color": "#22C55E" } },
  { selector: "node.upi", style: { shape: "star", width: 17, height: 17, "background-color": "#A3E635" } },
  { selector: "node.alias", style: { shape: "vee", width: 18, height: 15, "background-color": "#A78BFA" } },
  { selector: "node.location", style: { width: 12, height: 12, "background-color": "#94A3B8" } },

  /* activity satellites — tiny, no label until zoomed */
  {
    selector: "node.activity",
    style: {
      shape: "ellipse",
      width: 9,
      height: 9,
      "border-width": 0,
      "font-size": 5.5,
      color: "#7E8798",
      "text-outline-width": 1.5,
      "min-zoomed-font-size": 9,
      "z-index": 3,
    },
  },
  { selector: "node.act-money", style: { shape: "roundrectangle", width: 10, height: 7 } },
  { selector: "node.act-evidence", style: { shape: "rectangle", width: 8, height: 8, opacity: 0.8 } },

  /* edges */
  {
    selector: "edge",
    style: {
      width: "mapData(confidence, 0.3, 1, 0.7, 2.6)",
      "curve-style": "bezier",
      "line-color": "#3A4453",
      "target-arrow-shape": "none",
      opacity: 0.55,
      "z-index": 1,
    },
  },
  { selector: "edge.src-fir", style: { "line-color": SOURCE_COLOR.fir } },
  { selector: "edge.src-cdr", style: { "line-color": SOURCE_COLOR.cdr } },
  { selector: "edge.src-financial", style: { "line-color": SOURCE_COLOR.financial } },
  { selector: "edge.src-osint", style: { "line-color": SOURCE_COLOR.osint, "line-style": "dashed" } },
  { selector: "edge.strong", style: { opacity: 0.95, width: 2.6 } },
  {
    selector: "edge.src-hypothesis",
    style: {
      "line-color": "#EF4444",
      "line-style": "dashed",
      opacity: 0.6,
      width: 1.3,
    },
  },
  {
    selector: "edge.hidden-link",
    style: {
      "line-color": "#A78BFA",
      "line-style": "dashed",
      width: 1.8,
      opacity: 0.85,
      "curve-style": "bezier",
    },
  },

  /* interaction states */
  { selector: ".dim", style: { opacity: 0.1 } },
  {
    selector: ".hl",
    style: {
      "border-width": 3,
      "border-color": "#FF4FA3",
      "underlay-color": "#FF4FA3",
      "underlay-opacity": 0.28,
      "underlay-padding": 8,
      "z-index": 40,
    },
  },
  { selector: ".searching", style: { opacity: 0.06 } },
  { selector: ".search-hit", style: { "border-width": 3, "border-color": "#A3E635", "z-index": 45 } },
];

/* ==================================================================== *
 * Page
 * ==================================================================== */

type Tab = "filter" | "intel" | "ghost";

export default function NetworkPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("filter");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ id: string; kind: string; label: string } | null>(null);

  const [showActivity, setShowActivity] = useState(true);
  const [showCases, setShowCases] = useState(true);
  const [netA, setNetA] = useState(true);
  const [netB, setNetB] = useState(true);
  const [noise, setNoise] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [showCommunities, setShowCommunities] = useState(false);

  const bundle = useMemo(() => buildGraph(), []);
  const gnn = useMemo(() => trainGnn(NODES, EDGES, CASES), []);
  const clusters = useMemo(() => clusterEmbeddings(gnn, 4), [gnn]);
  const anomalies = useMemo(() => detectAnomalies(gnn, 6), [gnn]);
  const hiddenLinks = useMemo(() => predictLinks(gnn, { limit: 8, minScore: 0.3 }), [gnn]);
  const approved = useQuery(api.collection.approvedEntities);

  const ghost = GHOST_SEEDS[0];

  /* ---------------- mount cytoscape once ---------------- */
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: bundle.elements,
      style: STYLE,
      layout: {
        name: "preset",
        positions: bundle.positions,
        fit: true,
        padding: 70,
        animate: false,
      },
      wheelSensitivity: 0.22,
      minZoom: 0.12,
      maxZoom: 3,
      selectionType: "single",
      boxSelectionEnabled: false,
    });
    cyRef.current = cy;

    cy.on("tap", "node", e => {
      const d = e.target.data();
      setSelected({
        id: d.id,
        kind: d.kind ?? "entity",
        label: d.fullLabel ?? d.label ?? d.id,
      });
      cy.elements().removeClass("hl");
      e.target.addClass("hl");
      e.target.connectedEdges().addClass("hl");
    });
    cy.on("tap", e => {
      if (e.target === cy) {
        cy.elements().removeClass("hl");
        setSelected(null);
      }
    });

    const fit = () => {
      const w = containerRef.current?.clientWidth ?? 0;
      const h = containerRef.current?.clientHeight ?? 0;
      if (w > 0 && h > 0) {
        cy.resize();
        cy.fit(undefined, 60);
      }
    };
    cy.one("layoutstop", fit);
    const ro = new ResizeObserver(fit);
    ro.observe(containerRef.current);
    setReady(true);

    return () => {
      ro.disconnect();
      cy.destroy();
      cyRef.current = null;
      setReady(false);
    };
  }, [bundle]);

  /* ---------------- filters ---------------- */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !ready) return;
    const apply = () => {
      cy.batch(() => {
        cy.nodes().forEach(n => {
          const kind = n.data("kind") as string;
          const net = n.data("network") as string;
          let visible = true;
          if (kind === "activity" && !showActivity) visible = false;
          if (kind === "case" && !showCases) visible = false;
          if (net === "NET-A" && !netA) visible = false;
          if (net === "NET-B" && !netB) visible = false;
          if (net === "NOISE" && !noise) visible = false;
          n.style("display", visible ? "element" : "none");
        });
        cy.edges().forEach(e => {
          const endsVisible =
            e.source().style("display") !== "none" && e.target().style("display") !== "none";
          e.style("display", endsVisible ? "element" : "none");
        });
      });
    };
    apply();
  }, [ready, showActivity, showCases, netA, netB, noise]);

  /* ---------------- hidden-link overlay ---------------- */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !ready) return;
    cy.elements(".hidden-link").remove();
    if (!showHidden) return;
    const adds: ElementDefinition[] = [];
    for (const l of hiddenLinks) {
      if (!cy.getElementById(l.a).nonempty() || !cy.getElementById(l.b).nonempty()) continue;
      adds.push({
        group: "edges",
        data: {
          id: `hl-${l.a}-${l.b}`,
          source: l.a,
          target: l.b,
          sourceType: "hidden",
          confidence: l.score,
          label: `${(l.score * 100).toFixed(0)}%`,
        },
        classes: "hidden-link",
      });
    }
    cy.add(adds);
  }, [ready, showHidden, hiddenLinks]);

  /* ---------------- community colouring ---------------- */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !ready) return;
    const palette = ["#22D3EE", "#F59E0B", "#A78BFA", "#34D399"];
    cy.nodes().removeStyle("border-color");
    if (!showCommunities) return;
    cy.batch(() => {
      clusters.forEach((c: Cluster, i: number) => {
        for (const m of c.members) {
          const n = cy.getElementById(m.id);
          if (n.nonempty()) n.style("border-color", palette[i % palette.length]);
        }
      });
    });
  }, [ready, showCommunities, clusters]);

  /* ---------------- search ---------------- */
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !ready) return;
    cy.elements().removeClass("searching search-hit");
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hits = cy.nodes().filter(n =>
      `${n.data("fullLabel") ?? ""} ${n.data("label") ?? ""} ${n.data("sub") ?? ""}`
        .toLowerCase()
        .includes(q),
    );
    cy.elements().addClass("searching");
    hits.removeClass("searching").addClass("search-hit");
    hits.connectedEdges().removeClass("searching");
    if (hits.length) cy.animate({ fit: { eles: hits, padding: 120 } }, { duration: 300 });
  }, [ready, query]);

  const focusNode = useCallback((id: string) => {
    const cy = cyRef.current;
    if (!cy) return;
    const n = cy.getElementById(id);
    if (!n.nonempty()) return;
    cy.animate({ center: { eles: n }, zoom: 1.15 }, { duration: 320 });
    cy.elements().removeClass("hl");
    n.addClass("hl");
    setSelected({ id, kind: n.data("kind"), label: n.data("fullLabel") ?? n.data("label") });
  }, []);

  const counts = useMemo(() => {
    const nodes = bundle.elements.filter(e => e.group === "nodes");
    return {
      cases: nodes.filter(n => (n.data as { kind?: string }).kind === "case").length,
      people: nodes.filter(n => (n.data as { kind?: string }).kind === "hub").length,
      instruments: nodes.filter(n =>
        ["phone", "bank", "upi", "alias"].includes((n.data as { type?: string }).type ?? ""),
      ).length,
      activity: bundle.satellites,
      edges: bundle.elements.filter(e => e.group === "edges").length,
    };
  }, [bundle]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      {/* ---------------- toolbar ---------------- */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-white/8 bg-[#0B0E14] px-4 py-2.5">
        <span className="mono inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] font-bold tracking-[0.14em] text-white/70">
          <Waypoints className="h-3.5 w-3.5 text-[#22D3EE]" /> NETWORK INTELLIGENCE
        </span>
        <span className="mono hidden rounded-lg border border-white/8 px-3 py-1.5 text-[10px] text-white/40 sm:inline">
          10 Jun – 28 Jun 2026
        </span>

        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Find an entity…"
            className="mono w-52 rounded-lg border border-white/10 bg-black/40 py-1.5 pl-8 pr-3 text-[11px] text-white/80 outline-none placeholder:text-white/25 focus:border-[#22D3EE]/50"
          />
        </div>
        <button
          onClick={() => cyRef.current?.fit(undefined, 60)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/50 transition hover:text-white"
          aria-label="Fit graph"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* ---------------- canvas ---------------- */}
        <div className="relative min-w-0 flex-1">
          <div
            ref={containerRef}
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 0%, #1A1E26 0%, #12151B 55%, #0D1015 100%)",
            }}
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-white/40">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Building graph…
            </div>
          )}

          {/* legend */}
          <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-lg border border-white/8 bg-black/55 px-3 py-2 backdrop-blur">
            {[
              { c: "#F5F7FB", l: "person" },
              { c: "#F59E0B", l: "phone" },
              { c: "#22C55E", l: "account" },
              { c: "#A3E635", l: "upi" },
              { c: "#A78BFA", l: "alias" },
              { c: "#94A3B8", l: "place" },
              { c: "#22D3EE", l: "case" },
            ].map(x => (
              <span key={x.l} className="mono flex items-center gap-1.5 text-[9px] text-white/45">
                <span className="h-2 w-2 rounded-full" style={{ background: x.c }} />
                {x.l}
              </span>
            ))}
          </div>

          {selected && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-3 right-3 w-64 rounded-xl border border-white/10 bg-[#0B0F16]/95 p-3 backdrop-blur"
            >
              <p className="mono text-[9px] tracking-[0.2em] text-white/35 uppercase">
                {selected.kind}
              </p>
              <p className="mt-1 truncate text-[13px] font-semibold text-white/90">{selected.label}</p>
              <p className="mono mt-1 text-[9.5px] text-white/35">id {selected.id}</p>
              <Explanation id={selected.id} anomalies={anomalies} />
            </motion.div>
          )}
        </div>

        {/* ---------------- right panel ---------------- */}
        <aside className="w-[19rem] shrink-0 overflow-y-auto border-l border-white/8 bg-[#0B0E14]">
          <div className="mono flex border-b border-white/8 text-[9.5px] tracking-[0.16em] uppercase">
            {(["filter", "intel", "ghost"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 px-2 py-2.5 transition ${
                  tab === t
                    ? "border-b-2 border-[#F59E0B] text-white"
                    : "text-white/35 hover:text-white/60"
                }`}
              >
                {t === "ghost" ? "Ghost" : t}
              </button>
            ))}
          </div>

          {tab === "filter" && (
            <div className="divide-y divide-white/6">
              <Section title="Nodes" count={counts.cases + counts.people + counts.instruments + counts.activity}>
                <Toggle label="Case nodes" n={counts.cases} on={showCases} set={setShowCases} />
                <Toggle label="People (hubs)" n={counts.people} on onToggleLocked />
                <Toggle label="Instruments" n={counts.instruments} on onToggleLocked />
                <Toggle label="Activity records" n={counts.activity} on={showActivity} set={setShowActivity} />
              </Section>
              <Section title="Networks" count={3}>
                <Toggle label="NET-A" n={counts.people} on={netA} set={setNetA} dot="#22D3EE" />
                <Toggle label="NET-B" n={0} on={netB} set={setNetB} dot="#F59E0B" />
                <Toggle label="Noise / unaligned" n={0} on={noise} set={setNoise} dot="#64748B" />
              </Section>
              <Section title="Relationship sources" count={4}>
                {(["fir", "cdr", "financial", "osint"] as const).map(k => (
                  <div key={k} className="flex items-center justify-between px-3 py-1.5">
                    <span className="mono flex items-center gap-2 text-[10px] text-white/55">
                      <span className="h-1.5 w-4 rounded" style={{ background: SOURCE_COLOR[k] }} />
                      {k.toUpperCase()}
                    </span>
                    <span className="mono text-[9px] text-white/25">on</span>
                  </div>
                ))}
              </Section>
              <Section title="Overlays" count={2}>
                <Toggle label="Predicted hidden links" n={hiddenLinks.length} on={showHidden} set={setShowHidden} accent="#A78BFA" />
                <Toggle label="Detected communities" n={clusters.length} on={showCommunities} set={setShowCommunities} accent="#34D399" />
              </Section>
              <p className="px-3 py-3 text-[10px] leading-relaxed text-white/30">
                {counts.edges} recorded relationships across {counts.cases} FIRs. Activity records are
                real CDR and transaction rows, not decorative filler.
              </p>
            </div>
          )}

          {tab === "intel" && (
            <div className="divide-y divide-white/6">
              <Section title="Cross-case entities" count={crossCase().length}>
                {crossCase().slice(0, 8).map(c => (
                  <button
                    key={c.id}
                    onClick={() => focusNode(c.id)}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left transition hover:bg-white/4"
                  >
                    <span className="mono truncate text-[10px] text-white/65">{c.label}</span>
                    <span className="mono shrink-0 text-[9px] text-[#22D3EE]">{c.cases} FIRs</span>
                  </button>
                ))}
              </Section>
              <Section title="Hidden links" count={hiddenLinks.length}>
                {hiddenLinks.slice(0, 5).map(l => (
                  <div key={`${l.a}-${l.b}`} className="px-3 py-1.5">
                    <p className="mono truncate text-[10px] text-white/65">
                      {l.aLabel} ↔ {l.bLabel}
                    </p>
                    <p className="mono text-[9px] text-[#A78BFA]">
                      {(l.score * 100).toFixed(0)}% · {l.request}
                    </p>
                  </div>
                ))}
              </Section>
              <Section title="Communities" count={clusters.length}>
                {clusters.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-1.5">
                    <span className="mono flex items-center gap-2 text-[10px] text-white/60">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: ["#22D3EE", "#F59E0B", "#A78BFA", "#34D399"][i % 4] }}
                      />
                      {c.majority}
                    </span>
                    <span className="mono text-[9px] text-white/35">
                      {c.members.length} · purity {c.purity.toFixed(2)}
                    </span>
                  </div>
                ))}
              </Section>
              <Section title="Risk indicators" count={anomalies.length}>
                {anomalies.slice(0, 4).map(a => (
                  <button
                    key={a.id}
                    onClick={() => focusNode(a.id)}
                    className="w-full px-3 py-1.5 text-left transition hover:bg-white/4"
                  >
                    <p className="mono truncate text-[10px] text-white/65">{a.label}</p>
                    <p className="mono text-[9px] leading-snug text-white/30">{a.note}</p>
                  </button>
                ))}
              </Section>
            </div>
          )}

          {tab === "ghost" && (
            <div className="p-3">
              <div className="rounded-xl border border-[#EF4444]/35 bg-[#EF4444]/8 p-3">
                <div className="flex items-center gap-2">
                  <Ghost className="h-4 w-4 text-[#EF4444]" />
                  <span className="mono text-[9.5px] font-bold tracking-[0.18em] text-[#EF4444]">
                    GHOST NODE · PRIORITY
                  </span>
                </div>
                <p className="mt-2 text-[12px] font-semibold text-white/90">{ghost.title}</p>
                <p className="mono mt-1 text-[9.5px] text-white/40">
                  {ghost.kind} · confidence {ghost.confidence}%
                </p>
                <p className="mt-2 text-[10.5px] leading-relaxed text-white/55">{ghost.reason}</p>
                <button
                  onClick={() => focusNode("GHOST")}
                  className="mono mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/12 py-1.5 text-[9px] font-bold tracking-[0.16em] text-[#EF4444] transition hover:bg-[#EF4444]/22"
                >
                  <Crosshair className="h-3 w-3" /> CENTRE ON GHOST
                </button>
              </div>

              <p className="mono mt-4 text-[9px] tracking-[0.2em] text-white/30 uppercase">
                Next collection step
              </p>
              <div className="mt-1.5 rounded-lg border border-white/8 bg-black/30 p-2.5">
                <p className="text-[10.5px] text-white/70">{ghost.lead.request}</p>
                <p className="mono mt-1 text-[9px] text-white/35">{ghost.lead.window}</p>
                <p className="mt-1.5 text-[10px] leading-relaxed text-white/45">{ghost.lead.payoff}</p>
              </div>

              <p className="mono mt-4 text-[9px] tracking-[0.2em] text-white/30 uppercase">
                Other hypotheses
              </p>
              <div className="mt-1.5 space-y-1.5">
                {GHOST_SEEDS.slice(1).map(g => (
                  <div key={g.id} className="rounded-lg border border-white/8 bg-black/25 p-2.5">
                    <p className="text-[10.5px] font-semibold text-white/75">{g.title}</p>
                    <p className="mono mt-0.5 text-[9px] text-white/30">
                      {g.kind} · {g.confidence}%
                    </p>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-[9.5px] leading-relaxed text-white/25">
                The ghost node is a hypothesis placeholder. It is drawn dashed because nothing in
                the record confirms it exists. Treat its edges as questions, never as facts.
              </p>
            </div>
          )}

          {approved && approved.length > 0 && (
            <div className="border-t border-white/8 px-3 py-3">
              <p className="mono text-[9px] tracking-[0.2em] text-[#22C55E] uppercase">
                Approved from collection
              </p>
              <p className="mono mt-1 text-[9.5px] text-white/35">
                {approved.length} entities ·{" "}
                {new Set(approved.map(a => a.entityType)).size} types
              </p>
              <p className="mt-1.5 text-[9.5px] leading-relaxed text-white/25">
                These have no recorded relationship yet, so they are not drawn — placing them would
                invent a connection.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ==================================================================== *
 * Small pieces
 * ==================================================================== */

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="py-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-white/3"
      >
        <ChevronDown
          className={`h-3 w-3 text-white/30 transition-transform ${open ? "" : "-rotate-90"}`}
        />
        <span className="text-[11px] font-semibold text-white/70">{title}</span>
        <span className="mono ml-auto text-[9px] text-white/30">({count})</span>
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  );
}

function Toggle({
  label,
  n,
  on,
  set,
  dot,
  accent,
  onToggleLocked,
}: {
  label: string;
  n: number;
  on: boolean;
  set?: (v: boolean) => void;
  dot?: string;
  accent?: string;
  onToggleLocked?: boolean;
}) {
  return (
    <button
      onClick={() => set?.(!on)}
      disabled={onToggleLocked}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition enabled:hover:bg-white/4 disabled:cursor-default"
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: dot ?? accent ?? "#4B5563" }}
      />
      <span className="mono flex-1 truncate text-[10px] text-white/55">{label}</span>
      <span className="mono text-[9px] text-white/25">{n}</span>
      {onToggleLocked ? (
        <Eye className="h-3 w-3 text-white/20" />
      ) : on ? (
        <Eye className="h-3 w-3 text-[#22D3EE]" />
      ) : (
        <EyeOff className="h-3 w-3 text-white/20" />
      )}
    </button>
  );
}

function Explanation({ id, anomalies }: { id: string; anomalies: Anomaly[] }) {
  const hit = anomalies.find(a => a.id === id);
  if (!hit) return null;
  return (
    <p className="mt-2 border-t border-white/8 pt-2 text-[10px] leading-relaxed text-white/45">
      {hit.note}
    </p>
  );
}

/** Entities that appear in more than one FIR — computed, not hard-coded. */
function crossCase() {
  return NODES.filter(n => n.kind === "entity" && n.caseIds.length > 1)
    .map(n => ({ id: n.id, label: n.label, cases: n.caseIds.length }))
    .sort((a, b) => b.cases - a.cases);
}

