import {
  INDIA_OUTLINE,
  MAP_MARKERS,
  SRI_LANKA,
  type NetworkId,
} from "@/lib/data";
import { useMemo } from "react";

/* ---------- geometry ---------- */

const LNG0 = 67.4;
const LNG1 = 98.4;
const LAT0 = 37.2;
const LAT1 = 4.8;
const W = 560;
const H = 620;

const project = (lng: number, lat: number) => ({
  x: ((lng - LNG0) / (LNG1 - LNG0)) * W,
  y: ((LAT0 - lat) / (LAT0 - LAT1)) * H,
});

function pointInPoly(lng: number, lat: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Arcs between linked cases: [from, to, network, false = dashed/weak] */
const ARCS: { from: string; to: string; net: NetworkId; weak?: boolean }[] = [
  { from: "CR-001", to: "CR-004", net: "NET-A" }, // shared phone
  { from: "CR-003", to: "CR-006", net: "NET-A" }, // shared account
  { from: "CR-006", to: "CR-008", net: "NET-B" }, // the bridge
  { from: "CR-007", to: "CR-009", net: "NET-B" }, // shared UPI
  { from: "CR-004", to: "CR-010", net: "NOISE", weak: true }, // booth false positive
];

const NET_COLOR: Record<NetworkId, string> = {
  "NET-A": "#22D3EE",
  "NET-B": "#A78BFA",
  NOISE: "#6B7280",
};

interface Props {
  height?: number;
  showLabels?: boolean;
  onMarkerClick?: (caseId: string) => void;
}

export default function IndiaMap({ height = 560, showLabels = true, onMarkerClick }: Props) {
  const dots = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (let lng = LNG0 + 0.2; lng < LNG1; lng += 0.5) {
      for (let lat = LAT1 + 0.2; lat < LAT0; lat += 0.5) {
        if (pointInPoly(lng, lat, INDIA_OUTLINE) || pointInPoly(lng, lat, SRI_LANKA)) {
          const p = project(lng, lat);
          out.push(p);
        }
      }
    }
    return out;
  }, []);

  const markerPos = useMemo(
    () =>
      MAP_MARKERS.map(m => ({
        ...m,
        ...project(m.lng, m.lat),
      })),
    [],
  );

  const arcPaths = useMemo(() => {
    return ARCS.map(a => {
      const from = markerPos.find(m => m.caseIds.includes(a.from));
      const to = markerPos.find(m => m.caseIds.includes(a.to));
      if (!from || !to) return null;
      const mx = (from.x + to.x) / 2;
      const my = (from.y + to.y) / 2;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const cx = mx - (dy / len) * len * 0.22;
      const cy = my + (dx / len) * len * 0.22;
      return { d: `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`, ...a };
    }).filter(Boolean) as { d: string; net: NetworkId; weak?: boolean; from: string; to: string }[];
  }, [markerPos]);

  return (
    <div className="relative w-full" style={{ maxHeight: height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto block w-full"
        style={{ maxHeight: height }}
        role="img"
        aria-label="Map of India with case markers"
      >
        <defs>
          <radialGradient id="mapGlow" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width={W} height={H} fill="url(#mapGlow)" />

        {/* country silhouette as dots */}
        <g>
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={1.7} fill="rgba(129,140,166,0.5)" />
          ))}
        </g>

        {/* arcs */}
        <g fill="none">
          {arcPaths.map((a, i) => (
            <path
              key={i}
              d={a.d}
              stroke={a.weak ? "#6B7280" : NET_COLOR[a.net]}
              strokeWidth={a.weak ? 1.2 : 1.8}
              strokeDasharray={a.weak ? "4 7" : "7 9"}
              strokeLinecap="round"
              opacity={a.weak ? 0.55 : 0.9}
              className="flow-dash"
              style={{ animationDelay: `${i * 0.25}s` }}
            />
          ))}
        </g>

        {/* markers */}
        <g>
          {markerPos.map(m => {
            const color = NET_COLOR[m.network];
            return (
              <g
                key={m.city}
                className={onMarkerClick ? "cursor-pointer" : undefined}
                onClick={() => onMarkerClick?.(m.caseIds[0])}
              >
                <circle cx={m.x} cy={m.y} r={6} fill={color} opacity={0.25}>
                  <animate
                    attributeName="r"
                    values="6;17"
                    dur="2.4s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.5;0"
                    dur="2.4s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle cx={m.x} cy={m.y} r={4.4} fill={color} stroke="#05060A" strokeWidth="1.4" />
                {showLabels && (
                  <text
                    x={m.x + 9}
                    y={m.y + 3.5}
                    className="mono"
                    fontSize="10.5"
                    fill="rgba(231,236,245,0.72)"
                    style={{ fontFamily: "JetBrains Mono, monospace" }}
                  >
                    {m.city}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* legend */}
      <div className="mono mt-2 flex flex-wrap items-center justify-center gap-4 text-[10px] tracking-[0.18em] text-white/40">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#22D3EE]" /> NET-A
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#A78BFA]" /> NET-B
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#6B7280]" /> NOISE
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-5 border-t border-dashed border-[#6B7280]" /> weak link
        </span>
      </div>
    </div>
  );
}
