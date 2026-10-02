import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useAuth } from "@/hooks/use-auth";
import { useVyuh } from "@/store/vyuh";
import { INVESTIGATOR } from "@/lib/data";
import {
  ArrowRight,
  Fingerprint,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(returnTo: string | null, fallback = "/console") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  return fallback;
}

/* ---------------- animated network (left pane) ---------------- */

const NET_NODES = [
  { x: 60, y: 90, r: 5, pulse: false },
  { x: 180, y: 50, r: 4, pulse: true },
  { x: 300, y: 120, r: 6, pulse: false },
  { x: 120, y: 210, r: 4, pulse: false },
  { x: 250, y: 250, r: 5, pulse: true },
  { x: 400, y: 70, r: 4, pulse: false },
  { x: 430, y: 190, r: 6, pulse: false },
  { x: 350, y: 300, r: 4, pulse: true },
  { x: 170, y: 330, r: 5, pulse: false },
  { x: 70, y: 280, r: 4, pulse: false },
  { x: 500, y: 270, r: 4, pulse: false },
  { x: 470, y: 360, r: 5, pulse: true },
];
const NET_EDGES: [number, number][] = [
  [0, 1], [1, 2], [0, 3], [3, 4], [4, 2], [2, 5], [5, 6], [6, 4],
  [4, 7], [7, 8], [8, 3], [8, 9], [9, 0], [6, 10], [10, 11], [11, 7], [2, 6],
];

function AuthNetwork() {
  return (
    <svg viewBox="0 0 560 420" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id="authEdge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#A78BFA" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      {NET_EDGES.map(([a, b], i) => (
        <line
          key={i}
          x1={NET_NODES[a].x}
          y1={NET_NODES[a].y}
          x2={NET_NODES[b].x}
          y2={NET_NODES[b].y}
          stroke="url(#authEdge)"
          strokeWidth={1.2}
          strokeDasharray="6 8"
          className="flow-dash"
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
      {NET_NODES.map((n, i) => (
        <g key={i}>
          {n.pulse && (
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r + 4}
              fill="none"
              stroke="#FF4FA3"
              strokeWidth="1"
              opacity="0.7"
              className="ping-dot"
              style={{ transformOrigin: `${n.x}px ${n.y}px`, animationDelay: `${i * 0.4}s` }}
            />
          )}
          <circle
            cx={n.x}
            cy={n.y}
            r={n.r}
            fill={i % 3 === 0 ? "#22D3EE" : i % 3 === 1 ? "#A78BFA" : "#F5F7FB"}
            opacity="0.95"
          >
            {n.pulse && (
              <animate
                attributeName="opacity"
                values="0.55;1;0.55"
                dur="2.6s"
                repeatCount="indefinite"
                begin={`${i * 0.3}s`}
              />
            )}
          </circle>
        </g>
      ))}
    </svg>
  );
}

/* ---------------- handshake lines ---------------- */

const HANDSHAKE = [
  { t: "$ ssh INV-2041@chakravyuh-node-01", d: 0 },
  { t: "Establishing secure channel ............ OK", d: 380 },
  { t: "Verifying key fingerprint SHA256:9f3a…c21d", d: 760 },
  { t: "MFA challenge issued to badge INV-2041", d: 1150 },
  { t: "Session audited. Welcome, Insp. R. Menon.", d: 1550 },
];

type Step = "credentials" | "handshake" | "mfa" | "opening";

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const { startSession, pushAudit } = useVyuh();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  const [step, setStep] = useState<Step>("credentials");
  const [badge, setBadge] = useState<string>(INVESTIGATOR.badge);
  const [pass, setPass] = useState<string>(INVESTIGATOR.pass);
  const [otp, setOtp] = useState("");
  const [shown, setShown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (!authLoading && isAuthenticated && step === "credentials") {
      // A live Convex session already exists — go straight to the console.
    }
  }, [authLoading, isAuthenticated, step]);

  useEffect(() => () => timers.current.forEach(t => window.clearTimeout(t)), []);

  const startHandshake = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (badge.trim().toUpperCase() !== INVESTIGATOR.badge || pass !== INVESTIGATOR.pass) {
      setError("Badge ID or passphrase rejected. Use the demo credentials below.");
      return;
    }
    setStep("handshake");
    setShown(0);
    timers.current.forEach(t => window.clearTimeout(t));
    timers.current = HANDSHAKE.map((line, i) =>
      window.setTimeout(() => setShown(i + 1), line.d),
    );
    timers.current.push(window.setTimeout(() => setStep("mfa"), 2050));
  };

  const completeLogin = async () => {
    setStep("opening");
    startSession(INVESTIGATOR.badge, INVESTIGATOR.name);
    pushAudit({
      ts: new Date().toISOString(),
      actor: INVESTIGATOR.badge,
      action: "login mfa-verified",
      result: "OK",
    });
    try {
      // Anchor the session in Convex so RequireAuth agrees with our badge login.
      await signIn("anonymous");
    } catch {
      // Already signed in (or offline) — the local investigator session stands.
    }
    navigate(redirect, { replace: true });
  };

  const verifyOtp = () => {
    if (otp.length !== 6) return;
    completeLogin();
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
      {/* ---------------- left: brand + animated network ---------------- */}
      <aside className="relative hidden overflow-hidden border-r border-white/8 bg-[#05060A] lg:block">
        <div className="absolute inset-0 grid-bg opacity-70" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 520px at 30% 30%, rgba(34,211,238,0.12), transparent 65%), radial-gradient(760px 520px at 78% 74%, rgba(167,139,250,0.14), transparent 65%)",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center p-10">
          <AuthNetwork />
        </div>

        <div className="relative z-10 flex h-full flex-col justify-between p-10">
          <div className="flex items-center gap-3">
            <img src="/chakravyuh-icon.svg" alt="" className="h-9 w-9" />
            <span className="font-display text-lg font-bold tracking-[0.34em] text-white">
              CHAKRAVYUH
            </span>
          </div>

          <div className="max-w-md">
            <p className="mono text-[11px] uppercase tracking-[0.4em] text-[#22D3EE]">
              Investigator Intelligence Platform
            </p>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight text-white">
              <span className="text-gradient">One hidden network.</span>
            </h1>
            <p className="mt-4 text-sm leading-6 text-white/55">
              Chakravyuh connects scattered records to expose relationships. It
              ranks what deserves human eyes — it never determines guilt.
            </p>
          </div>

          <div className="mono flex items-center gap-3 text-[11px] tracking-widest text-white/40">
            <ShieldCheck className="h-4 w-4 text-[#22C55E]" />
            SESSION AUDITED · HUMAN-IN-THE-LOOP BY DESIGN
          </div>
        </div>
      </aside>

      {/* ---------------- right: access card ---------------- */}
      <main className="relative flex items-center justify-center bg-[#05060A] px-6 py-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(700px 420px at 50% 12%, rgba(255,79,163,0.1), transparent 70%)",
          }}
        />

        <div className="relative w-full max-w-md">
          <div className="glass-strong relative overflow-hidden rounded-3xl p-8 shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#22D3EE]/60 to-transparent" />

            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[#22D3EE]">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold tracking-wide text-white">
                  Investigator Access
                </h2>
                <p className="mono text-[10px] tracking-[0.28em] text-white/40">
                  CHAKRAVYUH NODE-01 · SECURE
                </p>
              </div>
            </div>

            {/* ---------- step: credentials ---------- */}
            {step === "credentials" && (
              <form onSubmit={startHandshake} className="mt-7 space-y-4">
                <div>
                  <label className="mono mb-1.5 block text-[10px] tracking-[0.24em] text-white/45">
                    BADGE ID
                  </label>
                  <Input
                    value={badge}
                    onChange={e => setBadge(e.target.value)}
                    className="mono h-11 border-white/10 bg-white/5 tracking-widest"
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className="mono mb-1.5 block text-[10px] tracking-[0.24em] text-white/45">
                    PASSPHRASE
                  </label>
                  <Input
                    type="password"
                    value={pass}
                    onChange={e => setPass(e.target.value)}
                    className="mono h-11 border-white/10 bg-white/5 tracking-widest"
                    autoComplete="current-password"
                  />
                </div>

                {error && (
                  <p className="mono text-xs text-[#EF4444]">{error}</p>
                )}

                <Button
                  type="submit"
                  className="h-11 w-full bg-gradient-to-r from-[#22D3EE] to-[#A78BFA] font-semibold text-[#041018] hover:opacity-90"
                >
                  Establish secure session
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>

                <div className="mono rounded-xl border border-dashed border-white/12 bg-white/[0.03] px-3 py-2.5 text-[11px] leading-5 text-white/50">
                  demo · ID <span className="text-[#22D3EE]">INV-2041</span> / pass{" "}
                  <span className="text-[#A78BFA]">vyuh123</span>
                </div>

                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="mono w-full text-center text-[11px] tracking-widest text-white/35 transition hover:text-white/70"
                >
                  ← BACK TO LANDING
                </button>
              </form>
            )}

            {/* ---------- step: handshake ---------- */}
            {step === "handshake" && (
              <div className="mono mt-7 min-h-[168px] rounded-xl border border-white/10 bg-black/50 p-4 text-[12px] leading-6 text-[#22C55E]">
                {HANDSHAKE.slice(0, shown).map(line => (
                  <div key={line.t}>
                    <span className="text-white/35">›</span> {line.t}
                  </div>
                ))}
                <span className="blink">▊</span>
              </div>
            )}

            {/* ---------- step: 2FA ---------- */}
            {step === "mfa" && (
              <div className="mt-7 space-y-5">
                <div className="flex items-center gap-2 text-[#F59E0B]">
                  <Fingerprint className="h-4 w-4" />
                  <span className="mono text-[10px] tracking-[0.24em]">
                    SECOND FACTOR · TOTP
                  </span>
                </div>
                <p className="text-sm text-white/60">
                  Enter the 6-digit code from your authenticator.{" "}
                  <span className="text-white/40">(any code works in demo)</span>
                </p>
                <InputOTP value={otp} onChange={setOtp} maxLength={6}>
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <Button
                  onClick={verifyOtp}
                  disabled={otp.length !== 6}
                  className="h-11 w-full bg-gradient-to-r from-[#22D3EE] to-[#A78BFA] font-semibold text-[#041018] hover:opacity-90"
                >
                  Verify & open console
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <button
                  type="button"
                  onClick={() => setStep("credentials")}
                  className="mono w-full text-center text-[11px] tracking-widest text-white/35 transition hover:text-white/70"
                >
                  ← USE DIFFERENT BADGE
                </button>
              </div>
            )}

            {/* ---------- step: opening ---------- */}
            {step === "opening" && (
              <div className="mono mt-7 min-h-[168px] rounded-xl border border-white/10 bg-black/50 p-4 text-[12px] leading-6 text-[#22D3EE]">
                <div>› MFA verified.</div>
                <div>› Session audited. Welcome, {INVESTIGATOR.name}.</div>
                <div>› Opening /console<span className="blink">▊</span></div>
              </div>
            )}
          </div>

          <p className="mono mt-5 text-center text-[10px] leading-5 tracking-[0.18em] text-white/30">
            HUMAN-IN-THE-LOOP BY DESIGN · RISK IS NOT GUILT
          </p>
        </div>
      </main>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense fallback={null}>
      <Auth {...props} />
    </Suspense>
  );
}
