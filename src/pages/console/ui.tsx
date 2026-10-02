import { levelOf, type Level } from "@/lib/analysis";
import { useEffect, useState, type ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mono text-[10px] tracking-[0.4em] text-[#22D3EE]">{eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-white/50">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-white/8 bg-[#0B0F1A]/75 backdrop-blur ${className}`}
    >
      {children}
    </section>
  );
}

export function PanelTitle({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
      <h2 className="mono text-[11px] font-bold tracking-[0.24em] text-white/70 uppercase">
        {children}
      </h2>
      {hint && <div className="mono text-[10px] tracking-widest text-white/35">{hint}</div>}
    </div>
  );
}

export const LEVEL_BG: Record<Level, string> = {
  LOW: "border-[#22C55E]/40 bg-[#22C55E]/10 text-[#22C55E]",
  MEDIUM: "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F59E0B]",
  HIGH: "border-[#FB7185]/40 bg-[#FB7185]/10 text-[#FB7185]",
  CRITICAL: "border-[#EF4444]/50 bg-[#EF4444]/12 text-[#EF4444]",
};

export function LevelBadge({
  score,
  level,
  className = "",
}: {
  score?: number;
  level?: Level;
  className?: string;
}) {
  const lv = level ?? levelOf(score ?? 0);
  return (
    <span
      className={`mono rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] ${LEVEL_BG[lv]} ${className}`}
    >
      {lv}
      {score !== undefined && ` · ${score}`}
    </span>
  );
}

export function RiskBar({ value, className = "" }: { value: number; className?: string }) {
  const color = { LOW: "#22C55E", MEDIUM: "#F59E0B", HIGH: "#FB7185", CRITICAL: "#EF4444" }[
    levelOf(value)
  ];
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-white/8 ${className}`}>
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${Math.max(3, value)}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }}
      />
    </div>
  );
}

export function CountUp({
  to,
  duration = 1400,
  suffix = "",
}: {
  to: number;
  duration?: number;
  suffix?: string;
}) {
  const [n, setN] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setN(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(to * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);

  return (
    <span>
      {n}
      {suffix}
    </span>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="mono px-5 py-8 text-center text-[11px] tracking-widest text-white/35">
      {children}
    </p>
  );
}
