import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  CASES,
  ENTITY_BY_ID,
  type CaseDef,
  type EntityDef,
} from "@/lib/data";
import { scoreSignals, signalsFor } from "@/lib/analysis";
import type { AuditLine } from "@/lib/ql";

const SESSION_KEY = "vyuh.session";
const AUDIT_KEY = "vyuh.audit";

export interface VyuhSession {
  badge: string;
  name: string;
  since: string;
}

export interface SharedHit {
  label: string;
  kind: "phone" | "bank" | "alias";
  cases: string[];
}

interface RegisterInput {
  id: string;
  state: string;
  city: string;
  date: string;
  crime: string;
  phone?: string;
  bank?: string;
  alias?: string;
}

interface VyuhContextValue {
  session: VyuhSession | null;
  startSession: (badge: string, name: string) => void;
  endSession: () => void;

  pixelActive: boolean;
  hitSidebar: (index: number) => void;

  cases: CaseDef[];
  extraEntities: EntityDef[];
  registerCase: (input: RegisterInput) => { caseDef: CaseDef; shared: SharedHit[] };

  highlightPhones: string[] | null;
  clearHighlight: () => void;

  audit: AuditLine[];
  pushAudit: (line: AuditLine) => void;

  integrity: { valid: boolean; brokenBlock: number | null };
  reportIntegrity: (valid: boolean, brokenBlock: number | null) => void;
}

const VyuhContext = createContext<VyuhContextValue | null>(null);

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage?.getItem(key) ?? window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — demo continues in memory */
  }
}

function seedAudit(): AuditLine[] {
  const now = Date.now();
  const at = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
  return [
    { ts: at(1), actor: "INV-2041", action: "session.open console", result: "OK" },
    { ts: at(4), actor: "INV-2041", action: "query index=cdr phone=9876543210", result: "12 events" },
    { ts: at(9), actor: "system", action: "integrity.scan chain", result: "VERIFIED" },
    { ts: at(16), actor: "INV-2041", action: "evidence.view EV-004-FIR", result: "OK" },
    { ts: at(24), actor: "INV-1188", action: "login", result: "OK" },
  ];
}

export function VyuhProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<VyuhSession | null>(() =>
    readJson<VyuhSession | null>(SESSION_KEY, null),
  );
  const [pixelActive, setPixelActive] = useState(false);
  const [cases, setCases] = useState<CaseDef[]>(CASES);
  const [extraEntities, setExtraEntities] = useState<EntityDef[]>([]);
  const [highlightPhones, setHighlightPhones] = useState<string[] | null>(null);
  const [audit, setAudit] = useState<AuditLine[]>(() => readJson<AuditLine[]>(AUDIT_KEY, seedAudit()));
  const [integrity, setIntegrity] = useState({ valid: true, brokenBlock: null as number | null });

  useEffect(() => {
    writeJson(AUDIT_KEY, audit.slice(0, 120));
  }, [audit]);

  const startSession = useCallback((badge: string, name: string) => {
    const next: VyuhSession = { badge, name, since: new Date().toISOString() };
    setSession(next);
    writeJson(SESSION_KEY, next);
  }, []);

  const endSession = useCallback(() => {
    setSession(null);
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const hitSidebar = useCallback((index: number) => {
    setPixelActive(index % 2 === 1);
  }, []);

  const pushAudit = useCallback((line: AuditLine) => {
    setAudit(prev => [line, ...prev].slice(0, 200));
  }, []);

  const reportIntegrity = useCallback((valid: boolean, brokenBlock: number | null) => {
    setIntegrity({ valid, brokenBlock });
  }, []);

  const clearHighlight = useCallback(() => setHighlightPhones(null), []);

  const registerCase = useCallback(
    (input: RegisterInput) => {
      const registry: Record<string, EntityDef> = {
        ...ENTITY_BY_ID,
        ...Object.fromEntries(extraEntities.map(e => [e.id, e])),
      };
      const ids: string[] = [];
      const newEntities: EntityDef[] = [];
      const shared: SharedHit[] = [];

      const resolve = (
        kind: "phone" | "bank" | "alias",
        value: string,
        prefix: string,
        meta: string,
      ) => {
        const existing = Object.values(registry).find(
          e => e.type === kind && e.label.toLowerCase() === value.toLowerCase(),
        );
        if (existing) {
          ids.push(existing.id);
          const holders = cases.filter(c => c.entities.includes(existing.id)).map(c => c.id);
          if (holders.length) shared.push({ label: value, kind, cases: holders });
        } else {
          const ent: EntityDef = { id: `${prefix}${value}`, type: kind, label: value, meta };
          newEntities.push(ent);
          registry[ent.id] = ent;
          ids.push(ent.id);
        }
      };

      if (input.phone) resolve("phone", input.phone, "ph-", "Registered from console entry");
      if (input.bank) resolve("bank", input.bank, "bk-", "Registered from console entry");
      if (input.alias) resolve("alias", input.alias, "a-", "Registered from console entry");

      // Location entity (created if the city has not been seen before)
      const locExisting = Object.values(registry).find(
        e => e.type === "location" && e.label.toLowerCase() === input.city.toLowerCase(),
      );
      if (locExisting) ids.push(locExisting.id);
      else {
        const loc: EntityDef = {
          id: `loc-${input.city.toLowerCase().replace(/\s+/g, "-")}`,
          type: "location",
          label: input.city,
          meta: input.state,
        };
        newEntities.push(loc);
        registry[loc.id] = loc;
        ids.push(loc.id);
      }

      const allEntities = [...extraEntities, ...newEntities];
      const risk = scoreSignals(signalsFor(ids, [...cases]));

      const caseDef: CaseDef = {
        id: input.id,
        network: risk >= 60 ? "NET-A" : risk >= 30 ? "NET-B" : "NOISE",
        state: input.state,
        city: input.city,
        date: input.date,
        crime: input.crime,
        status: "Open",
        risk,
        title: `${input.crime} — console entry`,
        summary: `Registered live from the console with ${
          [input.phone, input.bank, input.alias].filter(Boolean).join(", ") || "no instruments"
        }. ${shared.length ? `Overlap detected with ${shared.flatMap(s => s.cases).join(", ")}.` : "No overlap detected."}`,
        entities: ids,
      };

      setExtraEntities(prev => [...prev, ...newEntities]);
      setCases(prev => [...prev, caseDef]);
      const sharedPhones = shared.filter(s => s.kind === "phone").map(s => s.label);
      if (sharedPhones.length) setHighlightPhones(sharedPhones);
      pushAudit({
        ts: new Date().toISOString(),
        actor: session?.badge ?? "INV-2041",
        action: `case.register ${caseDef.id}`,
        result: shared.length ? `SHARED ${shared.map(s => s.label).join(",")}` : "NO OVERLAP",
      });

      return { caseDef, shared };
    },
    [cases, extraEntities, pushAudit, session?.badge],
  );

  const value = useMemo<VyuhContextValue>(
    () => ({
      session,
      startSession,
      endSession,
      pixelActive,
      hitSidebar,
      cases,
      extraEntities,
      registerCase,
      highlightPhones,
      clearHighlight,
      audit,
      pushAudit,
      integrity,
      reportIntegrity,
    }),
    [
      session,
      startSession,
      endSession,
      pixelActive,
      hitSidebar,
      cases,
      extraEntities,
      registerCase,
      highlightPhones,
      clearHighlight,
      audit,
      pushAudit,
      integrity,
      reportIntegrity,
    ],
  );

  return <VyuhContext.Provider value={value}>{children}</VyuhContext.Provider>;
}

export function useVyuh(): VyuhContextValue {
  const ctx = useContext(VyuhContext);
  if (!ctx) throw new Error("useVyuh must be used inside <VyuhProvider>");
  return ctx;
}
