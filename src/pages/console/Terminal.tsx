import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Terminal as TermIcon, Wifi } from "lucide-react";
import { CASES, CDR_ROWS, EVIDENCE, INVESTIGATOR, NETWORKS, TRANSACTIONS } from "@/lib/data";
import { buildEvents, runQuery } from "@/lib/ql";
import { useVyuh } from "@/store/vyuh";
import { PageHeader, Panel, PanelTitle } from "./ui";

interface Line {
  id: number;
  text: string;
  tone: "in" | "out" | "err" | "ok";
}

const HELP = [
  "help                      list commands",
  "cases [state]             list cases, optionally filtered by state",
  "graph <entity>            2-hop neighbourhood of an entity label",
  "chain <caseId>            evidence chain entries for a case",
  "cash <caseId>             financial transactions touching a case",
  "cdr <phone>               call detail rows for a phone number",
  "networks                  network risk register",
  "vyuh <query>              run a VYUH-QL query (index=cdr | stats count by phone)",
  "clear                     clear the console",
];

const BANNER = [
  "CHAKRAVYUH SECURE SHELL · investigator console v2.4",
  "All commands are mirrored to the audit trail. Read-only session.",
  "Type `help` for the command set.",
];

export default function TerminalPage() {
  const { cases, pushAudit } = useVyuh();
  const events = useMemo(() => buildEvents(cases), [cases]);
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [
    { id: 0, text: BANNER[0], tone: "ok" },
    { id: 1, text: BANNER[1], tone: "out" },
    { id: 2, text: BANNER[2], tone: "out" },
  ]);
  const nextId = useRef(3);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines]);

  const emit = (text: string, tone: Line["tone"]) =>
    setLines(prev => [...prev, { id: nextId.current++, text, tone }]);

  function submit() {
    const cmd = input.trim();
    setInput("");
    if (!cmd) return;
    emit(`${INVESTIGATOR.badge}@vyuh:~$ ${cmd}`, "in");

    if (cmd === "clear") {
      setLines([]);
      return;
    }
    if (cmd === "help" || cmd === "?") {
      HELP.forEach(l => emit(`  ${l}`, "out"));
      return;
    }
    if (cmd === "networks") {
      NETWORKS.forEach(n => emit(`  ${n.id.padEnd(8)} risk ${String(n.risk).padStart(3)}  ${n.label}`, "out"));
      return;
    }
    if (cmd.startsWith("cases")) {
      const state = cmd.slice(5).trim().toLowerCase();
      const list = cases.filter(c => !state || c.state.toLowerCase().includes(state));
      emit(`  ${list.length} case(s)`, "out");
      list.forEach(c =>
        emit(`  ${c.id}  ${c.date}  ${c.state.padEnd(14)} risk ${String(c.risk).padStart(3)}  ${c.title}`, "out"),
      );
      return;
    }
    if (cmd.startsWith("chain ")) {
      const id = cmd.slice(6).trim().toUpperCase();
      const ev = EVIDENCE.filter(e => e.caseId === id);
      if (!ev.length) emit(`  no evidence registered for ${id}`, "err");
      ev.forEach(e => emit(`  ${e.id.padEnd(14)} ${e.type.padEnd(5)} ${e.timestamp}  ${e.title}`, "out"));
      return;
    }
    if (cmd.startsWith("cash ")) {
      const id = cmd.slice(5).trim().toUpperCase();
      const tx = TRANSACTIONS.filter(t => t.caseId === id);
      if (!tx.length) emit(`  no financial rows for ${id}`, "err");
      tx.forEach(t =>
        emit(`  ${t.id}  ${t.date}  ₹${t.amount.toLocaleString("en-IN")}  ${t.from} → ${t.to}  (${t.kind})`, "out"),
      );
      return;
    }
    if (cmd.startsWith("cdr ")) {
      const phone = cmd.slice(4).trim();
      const rows = CDR_ROWS.filter(r => r.phone.includes(phone));
      if (!rows.length) emit(`  no CDR rows for ${phone}`, "err");
      rows.forEach(r =>
        emit(`  ${r.ts}  ${r.phone}  ${r.tower.padEnd(10)} ${r.city.padEnd(12)} ${r.dur}s ${r.dir}`, "out"),
      );
      return;
    }
    if (cmd.startsWith("graph ")) {
      const q = cmd.slice(6).trim().toLowerCase();
      const hit = new Set<string>();
      for (const c of cases) {
        if (!c.entities.some(id => id.includes(q) || id.split("-").pop() === q)) continue;
        c.entities.forEach(id => hit.add(id));
        hit.add(c.id);
      }
      emit(`  ${hit.size} node(s) within 1 hop of “${q}”`, "out");
      [...hit].slice(0, 40).forEach(id => emit(`  · ${id}`, "out"));
      return;
    }
    if (cmd.startsWith("vyuh ")) {
      const res = runQuery(cmd.slice(5), events);
      if (!res.ok) {
        emit(`  ! ${res.error}`, "err");
      } else {
        emit(`  ${res.matched} event(s) in ${res.took}`, "ok");
        res.rows.slice(0, 15).forEach(r =>
          emit(`  ${res.columns.map(c => String(r[c] ?? "-")).join("  ")}`, "out"),
        );
      }
      pushAudit({
        ts: new Date().toISOString(),
        actor: INVESTIGATOR.badge,
        action: `shell ${cmd.slice(0, 50)}`,
        result: "OK",
      });
      return;
    }

    emit(`  vyuh: command not found: ${cmd.split(" ")[0]}. Try \`help\`.`, "err");
  }

  return (
    <div>
      <PageHeader
        eyebrow="SECURE SHELL · READ-ONLY SESSION"
        title="Investigator Terminal"
        description="A direct line into the case corpus. Shell commands and VYUH-QL queries are equivalent in power and equally auditable."
      />

      <Panel className="overflow-hidden">
        <PanelTitle hint={`${INVESTIGATOR.badge} · ${INVESTIGATOR.station}`}>
          <span className="flex items-center gap-2">
            <TermIcon className="h-3.5 w-3.5 text-[#22C55E]" />
            ssh · vyuh@console
          </span>
        </PanelTitle>

        <div
          onClick={() => document.getElementById("vyuh-input")?.focus()}
          className="h-[460px] cursor-text overflow-y-auto bg-black/55 px-5 py-4"
        >
          {lines.map(l => (
            <p
              key={l.id}
              className={`mono text-[12px] leading-6 whitespace-pre-wrap ${
                l.tone === "in"
                  ? "text-white"
                  : l.tone === "ok"
                    ? "text-[#22C55E]"
                    : l.tone === "err"
                      ? "text-[#EF4444]"
                      : "text-white/55"
              }`}
            >
              {l.text}
            </p>
          ))}

          <div className="flex items-center gap-2">
            <span className="mono text-[12px] text-[#22D3EE]">{INVESTIGATOR.badge}@vyuh:~$</span>
            <input
              id="vyuh-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              autoComplete="off"
              spellCheck={false}
              className="mono flex-1 bg-transparent text-[12px] text-white caret-[#22D3EE] outline-none"
            />
            <ChevronRight className="h-3.5 w-3.5 text-[#22C55E]" />
          </div>
          <div ref={endRef} />
        </div>

        <div className="flex flex-wrap items-center gap-4 border-t border-white/8 px-5 py-3">
          <span className="mono flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-[#22C55E]">
            <Wifi className="h-3 w-3" /> CONNECTED
          </span>
          <span className="mono text-[10px] tracking-[0.2em] text-white/30">
            {CASES.length} CASES INDEXED · {CDR_ROWS.length} CDR ROWS
          </span>
          <span className="mono ml-auto text-[10px] tracking-[0.2em] text-white/30">
            SHELL v2.4 · TLS
          </span>
        </div>
      </Panel>
    </div>
  );
}
