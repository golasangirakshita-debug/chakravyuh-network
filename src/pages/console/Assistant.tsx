import { EmptyNote, PageHeader, Panel, PanelTitle } from "./ui";
import { api } from "@/convex/_generated/api";
import { CASES, EDGES, NODES } from "@/lib/data";
import { trainGnn } from "@/lib/gnn";
import { resolve, SUGGESTED_QUESTIONS, type Retrieval } from "@/lib/retrieve";
import { useAction, useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Bot,
  CircleSlash2,
  Loader2,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router";

interface Turn {
  id: string;
  role: "user" | "assistant";
  text: string;
  retrieval?: Retrieval;
  usedLlm?: boolean;
  model?: string | null;
}

/** Rows from the most recent assistant turn, without Array.prototype.at (ES2020). */
function lastRetrieval(turns: Turn[]) {
  const assistants = turns.filter(t => t.role === "assistant");
  return assistants.length ? (assistants[assistants.length - 1].retrieval?.rows ?? []) : [];
}

export default function AssistantPage() {
  const ask = useAction(api.assistant.ask);
  const approved = useQuery(api.collection.approvedEntities);
  const gnn = useMemo(() => trainGnn(NODES, EDGES, CASES), []);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || busy) return;
      setInput("");
      setBusy(true);

      const userTurn: Turn = { id: `u-${Date.now()}`, role: "user", text: question };
      setTurns(t => [...t, userTurn]);

      // Retrieval happens here, before anything is sent to a model.
      const retrieval = resolve(question, {
        gnn,
        approved: (approved ?? []).map(a => ({
          value: a.value,
          entityType: a.entityType,
          sourceId: a.sourceId as string,
        })),
      });

      try {
        const res = await ask({
          question,
          evidence: retrieval.rows.slice(0, 14).map(r => ({
            id: r.id,
            kind: r.kind,
            label: r.label,
            detail: r.detail,
          })),
        });
        setTurns(t => [
          ...t,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: res.answer,
            retrieval,
            usedLlm: res.usedLlm,
            model: res.model ?? null,
          },
        ]);
      } catch (err) {
        setTurns(t => [
          ...t,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            text: `The assistant could not be reached (${(err as Error).message.slice(0, 120)}). The retrieved records are still shown below — they came from the local graph and are unaffected.`,
            retrieval,
            usedLlm: false,
          },
        ]);
      } finally {
        setBusy(false);
        requestAnimationFrame(() => {
          scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
        });
      }
    },
    [ask, approved, busy, gnn],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Module 04"
        title="Investigation Assistant"
        description="Ask in plain language. Every answer is assembled from records retrieved first — the assistant is never asked to recall anything it was not given."
        actions={
          <span className="mono inline-flex items-center gap-2 rounded-xl border border-[#22C55E]/35 bg-[#22C55E]/10 px-3 py-2 text-[9.5px] font-bold tracking-[0.16em] text-[#22C55E]">
            <ShieldCheck className="h-3.5 w-3.5" /> EVIDENCE-BOUND
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Panel className="flex h-[34rem] flex-col">
          <PanelTitle hint={`${turns.filter(t => t.role === "user").length} questions`}>
            <span className="inline-flex items-center gap-2">
              <Bot className="h-3.5 w-3.5 text-[#A78BFA]" /> Console
            </span>
          </PanelTitle>

          <div ref={scroller} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {turns.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Sparkles className="h-7 w-7 text-[#A78BFA]/60" />
                <p className="mt-3 max-w-sm text-[12.5px] leading-relaxed text-white/45">
                  Ask about a phone number, an alias, a FIR, or the money moving between two
                  accounts. If the records do not contain an answer, the assistant will say so
                  rather than construct one.
                </p>
              </div>
            )}

            <AnimatePresence initial={false}>
              {turns.map(turn => (
                <motion.div
                  key={turn.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2.5 ${turn.role === "user" ? "justify-end" : ""}`}
                >
                  {turn.role === "assistant" && (
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#A78BFA]/15">
                      <Bot className="h-3.5 w-3.5 text-[#A78BFA]" />
                    </span>
                  )}
                  <div
                    className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[12px] leading-relaxed whitespace-pre-wrap ${
                      turn.role === "user"
                        ? "bg-[#22D3EE]/12 text-white/85"
                        : "border border-white/8 bg-black/30 text-white/70"
                    }`}
                  >
                    {turn.text}

                    {turn.role === "assistant" && turn.retrieval && (
                      <div className="mt-2.5 border-t border-white/8 pt-2">
                        <p className="mono text-[8.5px] tracking-[0.16em] text-white/25 uppercase">
                          {turn.usedLlm
                            ? `phrased by ${turn.model ?? "model"} · from ${turn.retrieval.rows.length} records`
                            : turn.retrieval.rows.length
                              ? `records only · no model configured`
                              : "no records matched"}
                        </p>
                        {turn.retrieval.rows.length === 0 && (
                          <p className="mono mt-1 flex items-center gap-1.5 text-[9.5px] text-[#F59E0B]">
                            <CircleSlash2 className="h-3 w-3" /> {turn.retrieval.scope}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {turn.role === "user" && (
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10">
                      <User className="h-3.5 w-3.5 text-white/60" />
                    </span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {busy && (
              <div className="mono flex items-center gap-2 text-[10px] text-white/35">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> retrieving records…
              </div>
            )}
          </div>

          <form
            onSubmit={e => {
              e.preventDefault();
              void send(input);
            }}
            className="flex items-center gap-2 border-t border-white/8 p-3"
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask about a phone, account, alias or FIR…"
              disabled={busy}
              className="mono min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[11.5px] text-white/85 outline-none placeholder:text-white/25 focus:border-[#A78BFA]/50"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#A78BFA]/40 bg-[#A78BFA]/15 text-[#A78BFA] transition hover:bg-[#A78BFA]/25 disabled:opacity-30"
              aria-label="Send"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <PanelTitle hint="start here">Suggested</PanelTitle>
            <div className="space-y-1.5 p-3">
              {SUGGESTED_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => void send(q)}
                  disabled={busy}
                  className="w-full rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-left text-[11px] text-white/60 transition hover:border-[#A78BFA]/40 hover:text-white/85 disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelTitle hint="what it can reach">Grounding</PanelTitle>
            <div className="space-y-2 p-4 text-[11px] text-white/50">
              <p>Retrieval covers exactly these sources:</p>
              <ul className="mono space-y-1 text-[10px] text-white/40">
                <li>· {NODES.length} graph nodes</li>
                <li>· {EDGES.length} recorded edges</li>
                <li>· {CASES.length} FIRs</li>
                <li>· approved extraction rows</li>
              </ul>
              <p className="pt-1 leading-relaxed text-white/35">
                The model is given those rows and nothing else. If retrieval returns nothing, the
                assistant refuses instead of guessing — that is enforced in the server action, not
                just suggested in the prompt.
              </p>
              <Link
                to="/console/network"
                className="mono inline-block pt-1 text-[9.5px] tracking-[0.14em] text-[#22D3EE] hover:underline"
              >
                OPEN THE GRAPH →
              </Link>
            </div>
          </Panel>
        </div>
      </div>

      {turns.some(t => t.retrieval && t.retrieval.rows.length > 0) && (
        <Panel>
          <PanelTitle hint="every row below is a record, not a sentence">Last retrieval</PanelTitle>
          <div className="divide-y divide-white/6">
            {lastRetrieval(turns).map((r, i) => (
              <div key={`${r.id}-${i}`} className="flex items-start gap-3 px-4 py-2">
                <span className="mono mt-0.5 shrink-0 rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[8.5px] text-white/40">
                  R{i + 1}
                </span>
                <span className="mono shrink-0 text-[9.5px] tracking-[0.1em] text-[#A78BFA] uppercase">
                  {r.kind}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] text-white/75">{r.label}</span>
                  <span className="mono block text-[9.5px] text-white/30">{r.detail}</span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {turns.length === 0 && (
        <EmptyNote>
          Nothing asked yet. The assistant reads the same graph the Network module draws.
        </EmptyNote>
      )}
    </div>
  );
}
