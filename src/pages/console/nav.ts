import {
  BarChart3,
  Bell,
  BrainCircuit,
  FileCheck2,
  FileText,
  FolderOpen,
  GitBranch,
  Inbox,
  LayoutDashboard,
  Map,
  MessagesSquare,
  Radar,
  ScanText,
  ScrollText,
  Search,
  Share2,
  Terminal,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  group: "modules" | "core" | "intel";
}

/** Sidebar destinations — investigation details the console leads to. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/console", icon: LayoutDashboard, group: "core" },

  /* ---- the five-module investigative workflow ---- */
  { label: "Collection", path: "/console/collection", icon: Inbox, group: "modules" },
  { label: "Extraction", path: "/console/extraction", icon: ScanText, group: "modules" },
  { label: "Network", path: "/console/network", icon: Share2, group: "modules" },
  { label: "Assistant", path: "/console/assistant", icon: MessagesSquare, group: "modules" },
  { label: "Case File", path: "/console/case-file", icon: ScrollText, group: "modules" },

  { label: "Cases", path: "/console/cases", icon: FolderOpen, group: "core" },
  { label: "Case Search", path: "/console/search", icon: Search, group: "core" },
  { label: "AI Analysis", path: "/console/ghost", icon: Radar, group: "core" },
  { label: "Neural Engine", path: "/console/neural", icon: BrainCircuit, group: "core" },
  { label: "Terminal", path: "/console/terminal", icon: Terminal, group: "core" },
  { label: "Kill Chain", path: "/console/killchain", icon: GitBranch, group: "core" },
  { label: "Evidence", path: "/console/evidence", icon: FileCheck2, group: "core" },
  { label: "Analytics", path: "/console/analytics", icon: BarChart3, group: "intel" },
  { label: "Crime Map", path: "/console/crime-map", icon: Map, group: "intel" },
  { label: "Suspects", path: "/console/suspects", icon: Users, group: "intel" },
  { label: "Alerts", path: "/console/alerts", icon: Bell, group: "intel" },
  { label: "Reports", path: "/console/reports", icon: FileText, group: "intel" },
];

export function navIndexForPath(pathname: string): number {
  const exact = NAV_ITEMS.findIndex(i => i.path === pathname);
  if (exact >= 0) return exact;
  const partial = NAV_ITEMS.findIndex(
    i => i.path !== "/console" && pathname.startsWith(i.path),
  );
  return partial >= 0 ? partial : 0;
}
