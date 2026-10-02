import ChakraRing from "@/components/ChakraRing";
import LineSidebar from "@/components/LineSidebar.jsx";
import { useAuth } from "@/hooks/use-auth";
import { useVyuh } from "@/store/vyuh";
import { NAV_ITEMS, navIndexForPath } from "./nav";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  LogOut,
  Menu,
  PanelLeft,
  Search as SearchIcon,
  ShieldCheck,
  ShieldAlert,
  User,
  Settings as SettingsIcon,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";

/* ---------------- Integrity Sentinel ---------------- */

function IntegritySentinel() {
  const { integrity } = useVyuh();
  if (integrity.valid) {
    return (
      <div className="mono hidden items-center gap-2 rounded-full border border-[#22C55E]/35 bg-[#22C55E]/10 px-3 py-1.5 text-[10px] font-bold tracking-[0.16em] text-[#22C55E] sm:flex">
        <ShieldCheck className="h-3.5 w-3.5" />
        CHAIN VERIFIED
      </div>
    );
  }
  return (
    <div className="mono alert-pulse hidden items-center gap-2 rounded-full border border-[#EF4444]/60 px-3 py-1.5 text-[10px] font-bold tracking-[0.16em] text-[#EF4444] sm:flex">
      <ShieldAlert className="h-3.5 w-3.5" />
      INTEGRITY ALERT · BLOCK {(integrity.brokenBlock ?? 0) + 1}
    </div>
  );
}

/* ---------------- Top bar ---------------- */

function TopBar({ onMenu }: { onMenu: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useVyuh();
  const [q, setQ] = useState("");

  const segment = location.pathname.split("/").filter(Boolean).pop() ?? "console";
  const title = segment === "console" ? "dashboard" : segment;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    navigate(`/console/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="glass-strong sticky top-0 z-30 flex h-16 items-center gap-3 px-4 sm:px-6">
      <button
        onClick={onMenu}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-white/70 transition hover:text-white lg:hidden"
        aria-label="Toggle navigation"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="mono hidden min-w-0 items-center gap-2 text-[11px] tracking-[0.22em] text-white/40 md:flex">
        <span className="text-white/70">CHAKRAVYUH</span>
        <span>/</span>
        <span>CONSOLE</span>
        <span>/</span>
        <span className="text-[#22D3EE] uppercase">{title}</span>
      </div>

      <form onSubmit={submit} className="ml-auto flex items-center">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search cases, phones, accounts…"
            className="mono h-9 w-40 rounded-full border border-white/10 bg-white/5 pl-9 pr-3 text-xs text-white/90 placeholder:text-white/30 focus:border-[#22D3EE]/60 focus:outline-none sm:w-64"
          />
        </div>
      </form>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="mono hidden items-center gap-2 rounded-full border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-3 py-1.5 text-[10px] font-bold tracking-[0.16em] text-[#F59E0B] md:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#F59E0B] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F59E0B]" />
          </span>
          HUMAN REVIEW REQUIRED
        </div>

        <IntegritySentinel />

        <div className="mono hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] tracking-[0.16em] text-white/55 lg:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
          SESSION AUDITED
        </div>

        <Link
          to="/console/profile"
          className="flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 pl-1.5 pr-3 transition hover:border-[#22D3EE]/50"
        >
          <span className="mono flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#FF4FA3] to-[#B84DFF] text-[9px] font-bold text-white">
            {(session?.name ?? "Insp. R. Menon")
              .replace("Insp. ", "")
              .split(" ")
              .map(w => w[0])
              .join("")
              .slice(0, 2)}
          </span>
          <span className="mono hidden text-[10px] tracking-widest text-white/60 sm:block">
            {session?.badge ?? "INV-2041"}
          </span>
        </Link>
      </div>
    </header>
  );
}

/* ---------------- Sidebar ---------------- */

function ConsoleSidebar({
  collapsed,
  mobileOpen,
  onCollapse,
  onCloseMobile,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onCollapse: () => void;
  onCloseMobile: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { hitSidebar, endSession } = useVyuh();
  const { signOut } = useAuth();
  const activeIndex = navIndexForPath(location.pathname);

  const go = (index: number) => {
    navigate(NAV_ITEMS[index].path);
    hitSidebar(index);
    onCloseMobile();
  };

  const handleLogout = async () => {
    endSession();
    try {
      await signOut();
    } catch {
      /* session already closed locally */
    }
    navigate("/");
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/8 bg-[#0B0F1A]/92 backdrop-blur-xl transition-all duration-300 lg:static lg:z-auto ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      } ${collapsed ? "w-[84px]" : "w-[268px]"}`}
    >
      {/* brand */}
      <div className="flex h-16 items-center justify-between border-b border-white/8 px-4">
        <Link to="/" className="flex items-center gap-2.5 overflow-hidden">
          <ChakraRing className="h-7 w-7 shrink-0" />
          {!collapsed && (
            <span className="font-display text-xs font-bold tracking-[0.3em] text-white">
              CHAKRAVYUH
            </span>
          )}
        </Link>
        <button
          onClick={onCollapse}
          className="hidden h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-white/50 transition hover:text-white lg:flex"
          aria-label="Collapse sidebar"
        >
          <PanelLeft className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* nav */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
        {collapsed ? (
          <ul className="space-y-1.5">
            {NAV_ITEMS.map((item, i) => {
              const Icon = item.icon;
              const active = i === activeIndex;
              return (
                <li key={item.path}>
                  <button
                    onClick={() => go(i)}
                    title={item.label}
                    className={`flex h-10 w-full items-center justify-center rounded-xl border transition ${
                      active
                        ? "border-[#B84DFF]/50 bg-[#B84DFF]/15 text-white shadow-[0_0_20px_rgba(184,77,255,0.25)]"
                        : "border-transparent text-white/50 hover:border-white/10 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <LineSidebar
            key={location.pathname}
            items={NAV_ITEMS.map(i => i.label)}
            defaultActive={activeIndex ?? 0}
            onItemClick={go}
            accentColor="#B84DFF"
            textColor="#C4C4C4"
            markerColor="#6C6C6C"
            showIndex={false}
            showMarker
            proximityRadius={100}
            maxShift={30}
            falloff="smooth"
            scaleTick
            fontSize={0.92}
            itemGap={14}
            markerLength={44}
            className="console-nav"
          />
        )}
      </div>

      {/* footer actions */}
      <div className="border-t border-white/8 p-3">
        <div className={`flex ${collapsed ? "flex-col" : "flex-row"} items-center gap-2`}>
          <Link
            to="/console/profile"
            title="User Profile"
            className={`flex h-9 items-center justify-center rounded-lg border border-transparent text-white/50 transition hover:bg-white/5 hover:text-white ${
              collapsed ? "w-full" : "flex-1 gap-2"
            }`}
          >
            <User className="h-4 w-4" />
            {!collapsed && <span className="text-xs">Profile</span>}
          </Link>
          <Link
            to="/console/settings"
            title="Settings"
            className={`flex h-9 items-center justify-center rounded-lg border border-transparent text-white/50 transition hover:bg-white/5 hover:text-white ${
              collapsed ? "w-full" : "flex-1 gap-2"
            }`}
          >
            <SettingsIcon className="h-4 w-4" />
            {!collapsed && <span className="text-xs">Settings</span>}
          </Link>
          <button
            onClick={handleLogout}
            title="Logout"
            className={`flex h-9 items-center justify-center rounded-lg border border-transparent text-[#EF4444]/80 transition hover:bg-[#EF4444]/10 hover:text-[#EF4444] ${
              collapsed ? "w-full" : "flex-1 gap-2"
            }`}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="text-xs">Logout</span>}
          </button>
        </div>

        {!collapsed && (
          <div className="mono mt-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-[9px] leading-4 tracking-[0.14em] text-white/35">
            {NAV_ITEMS.filter((_, i) => i === 1 || i === 11).length > 0 && (
              <>
                <Bell className="mr-1 inline h-3 w-3 text-[#F59E0B]" />
                1 ALERT AWAITING REVIEW
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

/* ---------------- Layout ---------------- */

export default function ConsoleLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { pushAudit, session } = useVyuh();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Scroll to top on route change.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location.pathname]);

  // Everything clickable becomes a target for the custom cursor.
  useEffect(() => {
    const id = window.setTimeout(() => {
      document
        .querySelectorAll("button, a, .line-sidebar__item, input, [role='button']")
        .forEach(el => el.classList.add("cursor-target"));
    }, 40);
    return () => window.clearTimeout(id);
  }, [location.pathname]);

  const handleSearchSubmitAudit = () => {
    pushAudit({
      ts: new Date().toISOString(),
      actor: session?.badge ?? "INV-2041",
      action: "console.nav",
      result: location.pathname,
    });
  };
  void handleSearchSubmitAudit;
  void navigate;

  return (
    <div className="flex min-h-screen bg-[#05060A]/70">
      <ConsoleSidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCollapse={() => setCollapsed(v => !v)}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {mobileOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMobileOpen(v => !v)} />

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.26, ease: "easeOut" }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
