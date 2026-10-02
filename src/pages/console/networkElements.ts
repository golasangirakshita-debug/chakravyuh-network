import type { ElementDefinition, Stylesheet } from "cytoscape";
import type { GraphEdge, GraphNode, SourceType } from "@/lib/data";
import { SOURCE_COLOR } from "@/lib/data";

/** Node visuals by type — case = cyan rounded rect, person = white circle,
 *  phone = amber diamond, bank = green hexagon, alias = violet tag,
 *  UPI = lime star, location = grey dot. */
export const NODE_VISUALS: Record<
  string,
  { shape: string; color: string; label: string }
> = {
  case: { shape: "roundrectangle", color: "#22D3EE", label: "Case" },
  person: { shape: "ellipse", color: "#F5F7FB", label: "Person" },
  phone: { shape: "diamond", color: "#F59E0B", label: "Phone" },
  bank: { shape: "hexagon", color: "#22C55E", label: "Bank" },
  alias: { shape: "vee", color: "#A78BFA", label: "Alias" },
  upi: { shape: "star", color: "#A3E635", label: "UPI" },
  location: { shape: "ellipse", color: "#6B7280", label: "Location" },
};

export const LAYER_META: { key: SourceType; label: string; color: string }[] = [
  { key: "fir", label: "FIR", color: SOURCE_COLOR.fir },
  { key: "cdr", label: "CDR", color: SOURCE_COLOR.cdr },
  { key: "financial", label: "Financial", color: SOURCE_COLOR.financial },
  { key: "osint", label: "OSINT", color: SOURCE_COLOR.osint },
];

export function netClass(network: string): string {
  return network === "NET-A" ? "neta" : network === "NET-B" ? "netb" : "noise";
}

export function buildElements(
  nodes: GraphNode[],
  edges: GraphEdge[],
): ElementDefinition[] {
  const els: ElementDefinition[] = nodes.map(n => ({
    group: "nodes",
    data: {
      id: n.id,
      kind: n.kind,
      type: n.type,
      label: n.kind === "case" ? n.id : n.label,
      fullLabel: n.label,
      network: n.network,
      date: n.date,
      caseIds: n.caseIds.join(","),
    },
    classes: `${n.kind} ${n.type} ${netClass(n.network)}`,
  }));

  for (const e of edges) {
    els.push({
      group: "edges",
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        date: e.date,
        caseId: e.caseId,
        sourceType: e.sourceType,
        confidence: e.confidence,
      },
      classes: `src-${e.sourceType}`,
    });
  }
  return els;
}

export const CY_STYLE: Stylesheet[] = [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "font-family": "JetBrains Mono, monospace",
      "font-size": 9,
      color: "#E7ECF5",
      "text-outline-color": "#05060A",
      "text-outline-width": 2,
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 5,
      "min-zoomed-font-size": 7,
      "z-index": 5,
    },
  },
  { selector: "node.case", style: { shape: "roundrectangle", width: 62, height: 34, "background-color": "#22D3EE", color: "#041018", "text-outline-width": 0, "text-valign": "center", "text-margin-y": 0, "font-size": 11, "font-weight": 800, "border-width": 2, "border-color": "#7EE7FA" } },
  { selector: "node.person", style: { shape: "ellipse", width: 34, height: 34, "background-color": "#F5F7FB", color: "#05060A", "text-outline-width": 0, "font-weight": 700 } },
  { selector: "node.phone", style: { shape: "diamond", width: 36, height: 36, "background-color": "#F59E0B" } },
  { selector: "node.bank", style: { shape: "hexagon", width: 42, height: 38, "background-color": "#22C55E" } },
  { selector: "node.alias", style: { shape: "vee", width: 42, height: 34, "background-color": "#A78BFA" } },
  { selector: "node.upi", style: { shape: "star", width: 40, height: 40, "background-color": "#A3E635" } },
  { selector: "node.location", style: { shape: "ellipse", width: 22, height: 22, "background-color": "#6B7280", "text-margin-y": 8 } },
  { selector: "node.noise", style: { opacity: 0.75 } },

  {
    selector: "edge",
    style: {
      width: "mapData(confidence, 0.5, 1, 1.2, 4.6)",
      "curve-style": "bezier",
      opacity: 0.85,
      "line-style": "solid",
      "target-arrow-shape": "triangle",
      "arrow-scale": 0.75,
      "z-index": 1,
    },
  },
  { selector: ".src-fir", style: { "line-color": SOURCE_COLOR.fir, "target-arrow-color": SOURCE_COLOR.fir } },
  { selector: ".src-cdr", style: { "line-color": SOURCE_COLOR.cdr, "target-arrow-color": SOURCE_COLOR.cdr } },
  { selector: ".src-financial", style: { "line-color": SOURCE_COLOR.financial, "target-arrow-color": SOURCE_COLOR.financial } },
  { selector: ".src-osint", style: { "line-color": SOURCE_COLOR.osint, "target-arrow-color": SOURCE_COLOR.osint, "line-style": "dashed" } },

  /* interaction / state classes */
  { selector: ".hl", style: { "border-width": 3, "border-color": "#FF4FA3", "underlay-color": "#FF4FA3", "underlay-opacity": 0.28, "underlay-padding": 9, "z-index": 30 } },
  { selector: "edge.hl", style: { width: 5, opacity: 1, "z-index": 30 } },
  { selector: ".dim", style: { opacity: 0.12 } },
  { selector: ".step-dim", style: { opacity: 0.08 } },
  { selector: ".step-on", style: { "underlay-color": "#22D3EE", "underlay-opacity": 0.32, "underlay-padding": 11, "z-index": 25, opacity: 1 } },
  { selector: ".frozen", style: { "background-color": "#93C5FD", "border-color": "#EFF6FF", "border-width": 3, "border-style": "dashed", "z-index": 40 } },
  { selector: "edge.frozen-edge", style: { opacity: 0.06 } },
  { selector: ".found", style: { "border-width": 4, "border-color": "#A3E635", "underlay-color": "#A3E635", "underlay-opacity": 0.3, "underlay-padding": 10, "z-index": 35 } },
];
