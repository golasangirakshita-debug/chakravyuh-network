import {
  BarChart3,
  Bell,
  FileCheck2,
  FileText,
  FolderOpen,
  GitBranch,
  LayoutDashboard,
  Map,
  Radar,
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
  group: "core" | "intel";
}

/** Sidebar destinations — investigation details the console leads to. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/console", icon: LayoutDashboard, group: "core" },
  { label: "Cases", path: "/console/cases", icon: FolderOpen, group: "core" },
  { label: "Case Search", path: "/console/search", icon: Search, group: "core" },
  { label: "Network", path: "/console/network", icon: Share2, group: "core" },
  { label: "AI Analysis", path: "/console/ghost", icon: Radar, group: "core" },
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
