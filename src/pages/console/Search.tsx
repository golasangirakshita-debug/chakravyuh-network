import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, Play, Search as SearchIcon, Sparkles, Terminal } from "lucide-react";
import {
  SAVED_SEARCHES,
  buildEvents,
  eventsPerDay,
  interestingFields,
  runQuery,
  type QlResult,
} from "@/lib/ql";
import { useVyuh } from "@/store/vyuh";
import { EmptyNote, PageHeader, Panel, PanelTitle } from "./ui";

export default function SearchPage() {
  const { cases, audit, pushAudit } = useVyuh();
  const events = useMemo(() => buildEvents(cases, audit), [cases, audit]);
  const [query, setQuery] = useState(SAVED_SEARCHES[0].query);
  const [result, setResult] = useState<QlResult | null>(null);
  const [history, setHistory] = useState<string[]>([]);

  function run() {
    const res = runQuery(query, events);
    setResult(res);
    if (res.ok) {
      setHistory(h => [res.command, ...h.filter(x => x !== res.command)].slice(0, 8));
      pushAudit({
        ts: new Date().toISOString(),
        actor: "INV-2041",
        action: `query ${res.command.slice(0, 60)}`,
        result: `${res.matched} events · ${res.took}`,
      });
    }
  }

  const perDay = result?.ok ? eventsPerDay(result.events) : [];
  const maxDay = Math.max(1, ...perDay.map(d => d.count));
  const fields = result?.ok ? interestingFields(result.events, ["phone", "tower", "state", "network", "result"]) : [];

  return (
    <div>
      <PageHeader
        eyebrow="VYUH-QL · SPLUNK-FLAVOURED"
        title="Case Search"
        description="Query FIR, CDR, financial, OSINT and audit indexes in one place. Every query is written to the audit trail."
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_1.5fr]">
        <div className="space-y-5">
          <Panel>
            <PanelTitle hint="Enter to run">Query editor</PanelTitle>
            <div className="p-5">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 focus-within:border-[#22D3EE]/50">
                <Terminal className="h-4 w-4 shrink-0 text-[#22D3EE]" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && run()}
                  placeholder="index=cdr phone=9876543210 | stats count by case_id"
                  className="mono w-full bg-transparent text-[12px] text-white outline-none placeholder:text-white/25"
                />
                <button
                  onClick={run}
                  className="mono shrink-0 rounded-lg bg-[#22D3EE] px-3 py-1.5 text-[10px] font-bold tracking-[0.18em] text-black hover:brightness-110"
                >
                  <Play className="mr-1 inline h-3 w-3" />
                  RUN
                </button>
              </div>
              <p className="mono mt-3 text-[10px] leading-5 text-white/35">
                index= · field=value · free text · | stats count [by f] · | sort [-]f · | head N · |
                fields a,b · | graph
              </p>
            </div>
          </Panel>

          <Panel>
            <PanelTitle> Saved searches</PanelTitle>
            <div className="divide-y divide-white/6">
              {SAVED_SEARCHES.map(s => (
                <button
                  key={s.label}
                  onClick={() => setQuery(s.query)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-white/4"
                >
                  <span className="text-xs text-white/70">{s.label}</span>
                  <span className="mono truncate text-[10px] text-white/30">{s.query}</span>
                </button>
              ))}
            </div>
          </Panel>

          {history.length > 0 && (
            <Panel>
              <PanelTitle>Session history</PanelTitle>
              <div className="divide-y divide-white/6">
                {history.map(h => (
                  <button
                    key={h}
                    onClick={() => setQuery(h)}
                    className="mono block w-full truncate px-5 py-2.5 text-left text-[11px] text-white/50 transition hover:bg-white/4 hover:text-white"
                  >
                    {h}
                  </button>
                ))}
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-5">
          <Panel>
            <PanelTitle
              hint={result?.ok ? `${result.matched} events · ${result.took}` : "no query yet"}
            >
              Results
            </PanelTitle>
            {!result ? (
              <EmptyNote>Run a saved search to populate this table.</EmptyNote>
            ) : !result.ok ? (
              <div className="p-5">
                <p className="mono rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/10 px-4 py-3 text-[11px] leading-5 text-[#EF4444]">
                  {result.error}
                </p>
              </div>
            ) : (
              <motion.div
                key={result.command + result.matched}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="overflow-x-auto"
              >
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/8">
                      {result.columns.map(c => (
                        <th
                          key={c}
                          className="mono px-4 py-2.5 text-[10px] font-bold tracking-[0.2em] text-white/40 uppercase"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 60).map((r, i) => (
                      <tr
                        key={i}
                        className="border-b border-white/4 transition hover:bg-white/4"
                      >
                        {result.columns.map(c => (
                          <td
                            key={c}
                            className={`mono max-w-[240px] truncate px-4 py-2 text-[11px] ${
                              c === "_index" ? "text-[#22D3EE]" : "text-white/65"
                            }`}
                          >
                            {r[c] === undefined ? "—" : String(r[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.rows.length === 0 && <EmptyNote>No events matched.</EmptyNote>}
              </motion.div>
            )}
          </Panel>

          {result?.ok && result.matched > 0 && (
            <div className="grid gap-5 md:grid-cols-2">
              <Panel>
                <PanelTitle hint="volume">Events per day</PanelTitle>
                <div className="flex h-40 items-end gap-1.5 px-5 pt-5 pb-3">
                  {perDay.map(d => (
                    <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-[#22D3EE]/25 to-[#22D3EE]"
                        style={{ height: `${(d.count / maxDay) * 100}%` }}
                        title={`${d.day}: ${d.count}`}
                      />
                      <span className="mono text-[9px] text-white/35">{d.day}</span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <PanelTitle hint="top values">Field distribution</PanelTitle>
                <div className="space-y-3 p-5">
                  {fields.length === 0 ? (
                    <EmptyNote>No enumerable fields in this result set.</EmptyNote>
                  ) : (
                    fields.map(f => (
                      <div key={f.field}>
                        <p className="mono text-[10px] tracking-[0.2em] text-white/40">
                          {f.field} · {f.total} distinct
                        </p>
                        <div className="mt-1.5 space-y-1">
                          {f.values.map(v => (
                            <div key={v.value} className="flex items-center gap-2">
                              <span className="mono w-32 shrink-0 truncate text-[10px] text-white/55">
                                {v.value}
                              </span>
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                                <div
                                  className="h-full rounded-full bg-[#A78BFA]"
                                  style={{ width: `${(v.count / f.values[0].count) * 100}%` }}
                                />
                              </div>
                              <span className="mono w-6 text-right text-[10px] text-white/40">
                                {v.count}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </div>
          )}

          <Panel className="flex items-center gap-3 p-5">
            <Sparkles className="h-4 w-4 shrink-0 text-[#A78BFA]" />
            <p className="text-xs leading-5 text-white/50">
              <SearchIcon className="mr-1 inline h-3 w-3" />
              Search is scoped to cases loaded in this session. Results are evidence pointers,
              not findings.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}