import { sha256Hex } from "@/lib/hash";
import { useEffect, useState } from "react";

/** Short SHA-256 badge for an evidence item's content. */
export function HashBadge({
  text,
  len = 12,
  className = "",
}: {
  text: string;
  len?: number;
  className?: string;
}) {
  const [hex, setHex] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setHex(null);
    sha256Hex(text)
      .then(h => {
        if (alive) setHex(h);
      })
      .catch(() => {
        if (alive) setHex("unavailable");
      });
    return () => {
      alive = false;
    };
  }, [text]);

  return (
    <span
      className={`mono rounded-md border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] tracking-tight text-[#22C55E] ${className}`}
      title={hex ?? undefined}
    >
      {hex ? `#${hex.slice(0, len)}` : "computing…"}
    </span>
  );
}

export default HashBadge;
