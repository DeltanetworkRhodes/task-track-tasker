import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ClipboardCheck, Wrench, Package, LogOut, FileText, TrendingUp,
  Search, UserCog, X, BarChart3, Settings, Sun, Moon, CalendarDays, GripVertical,
  Check, FileSpreadsheet, Banknote, ShieldCheck, Receipt, Activity, Ticket,
  Users as UsersIcon, Briefcase, Repeat,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import deltaLogoIcon from "@/assets/delta-logo-icon.png";
import logoOte from "@/assets/logo-ote.png";
import logoVodafone from "@/assets/logo-vodafone.png";
import logoNova from "@/assets/logo-nova.png";
import logoDeh from "@/assets/logo-deh.png";
import { useTheme } from "next-themes";
import { useConstructions } from "@/hooks/useData";
import { useUserRole } from "@/hooks/useUserRole";
import { useEnabledClients, type ClientCode } from "@/hooks/useEnabledClients";

// ── Client detection from URL ──────────────────────────────────────────────
function detectClient(pathname: string): ClientCode {
  if (pathname.startsWith("/vodafone") || pathname.startsWith("/subcontractor")) return "vodafone";
  if (pathname.startsWith("/nova")) return "nova";
  if (pathname.startsWith("/deh")) return "deh";
  if (pathname.startsWith("/master")) return "master";
  return "ote";
}

// ── Theme per client ───────────────────────────────────────────────────────
type ClientTheme = {
  gradient: string;        // tailwind gradient classes
  glow: string;            // glow shadow class
  activeText: string;
  badgeBg: string;
  badgeText: string;
  topBar: string;          // top accent line
  logo?: string;
  fallback?: string;       // emoji fallback
  label: string;
  sublabel: string;
};

const CLIENT_THEMES: Record<ClientCode, ClientTheme> = {
  ote: {
    gradient: "bg-gradient-to-r from-blue-500 to-blue-600",
    glow: "shadow-glow-blue",
    activeText: "text-blue-500",
    badgeBg: "bg-blue-500/15",
    badgeText: "text-blue-500",
    topBar: "bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600",
    logo: logoOte,
    label: "OTE / COSMOTE",
    sublabel: "FTTH Έργα",
  },
  vodafone: {
    gradient: "bg-gradient-to-r from-red-500 to-red-600",
    glow: "shadow-glow-red",
    activeText: "text-red-500",
    badgeBg: "bg-red-500/15",
    badgeText: "text-red-500",
    topBar: "bg-gradient-to-r from-red-500 via-rose-400 to-red-600",
    logo: logoVodafone,
    label: "VODAFONE",
    sublabel: "LLU + FTTH Φ3",
  },
  nova: {
    gradient: "bg-gradient-to-r from-purple-500 to-purple-600",
    glow: "shadow-glow-purple",
    activeText: "text-purple-500",
    badgeBg: "bg-purple-500/15",
    badgeText: "text-purple-500",
    topBar: "bg-gradient-to-r from-purple-500 via-fuchsia-400 to-purple-600",
    logo: logoNova,
    label: "NOVA",
    sublabel: "Multi-service",
  },
  deh: {
    gradient: "bg-gradient-to-r from-amber-500 to-amber-600",
    glow: "shadow-glow-amber",
    activeText: "text-amber-500",
    badgeBg: "bg-amber-500/15",
    badgeText: "text-amber-500",
    topBar: "bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600",
    logo: logoDeh,
    label: "ΔΕΗ",
    sublabel: "Δίκτυο διανομής",
  },
  master: {
    gradient: "bg-gradient-to-r from-emerald-500 to-teal-600",
    glow: "shadow-glow-emerald",
    activeText: "text-emerald-500",
    badgeBg: "bg-emerald-500/15",
    badgeText: "text-emerald-500",
    topBar: "bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600",
    fallback: "💼",
    label: "Master View",
    sublabel: "Όλοι οι clients",
  },
};

// ── Nav items per client ───────────────────────────────────────────────────
type NavItem = { to: string; label: string; icon: React.ElementType };

const NAV_ITEMS_BY_CLIENT: Record<ClientCode, NavItem[]> = {
  ote: [
    { to: "/ote/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/ote/assignments", label: "Αναθέσεις", icon: ClipboardCheck },
    { to: "/ote/surveys", label: "Αυτοψίες", icon: Search },
    { to: "/ote/construction", label: "Κατασκευές", icon: Wrench },
    { to: "/ote/materials", label: "Αποθήκη", icon: Package },
    { to: "/ote/pricing", label: "Άρθρα ΟΤΕ", icon: Receipt },
    { to: "/ote/earnings-pricing", label: "Αμοιβές Κτιρίων", icon: Banknote },
    { to: "/ote/photo-requirements", label: "Έλεγχος Φωτο", icon: ShieldCheck },
    { to: "/ote/profit", label: "Κέρδος/SR", icon: TrendingUp },
    { to: "/ote/kpis", label: "KPIs Τεχνικών", icon: BarChart3 },
    { to: "/ote/calendar", label: "Ημερολόγιο", icon: CalendarDays },
    { to: "/ote/documents", label: "Documents", icon: FileSpreadsheet },
  ],
  vodafone: [
    { to: "/vodafone/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/vodafone/tickets", label: "Tickets", icon: Ticket },
    { to: "/vodafone/import", label: "Excel Import", icon: FileSpreadsheet },
    { to: "/subcontractors", label: "Υπεργολάβοι", icon: UsersIcon },
    { to: "/subcontractor-payments", label: "Πληρωμές", icon: Banknote },
  ],
  nova: [
    { to: "/nova/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ],
  deh: [
    { to: "/deh/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ],
  master: [
    { to: "/master/dashboard", label: "Dashboard", icon: LayoutDashboard },
  ],
};

const COMMON_ITEMS: NavItem[] = [
  { to: "/users", label: "Χρήστες", icon: UserCog },
  { to: "/settings", label: "Ρυθμίσεις", icon: Settings },
  { to: "/diagnostics", label: "Διαγνωστικά", icon: Activity },
];

// Per-client storage key for drag order
const orderKey = (client: ClientCode) => `sidebar-order-${client}`;

function getOrderedItems(client: ClientCode): NavItem[] {
  const defaults = NAV_ITEMS_BY_CLIENT[client] || NAV_ITEMS_BY_CLIENT.ote;
  try {
    const saved = localStorage.getItem(orderKey(client));
    if (!saved) return defaults;
    const order: string[] = JSON.parse(saved);
    const ordered: NavItem[] = [];
    order.forEach((to) => {
      const item = defaults.find((i) => i.to === to);
      if (item) ordered.push(item);
    });
    defaults.forEach((item) => {
      if (!ordered.find((o) => o.to === item.to)) ordered.push(item);
    });
    return ordered;
  } catch {
    return defaults;
  }
}

interface AppSidebarProps {
  onClose?: () => void;
}

const AppSidebar = ({ onClose }: AppSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { data: constructions } = useConstructions();
  const { data: role } = useUserRole();
  const { data: enabledClients = ["ote"] } = useEnabledClients();

  const activeConstructions = constructions?.filter((c) => c.status === "in_progress").length || 0;
  const isAdmin = role === "admin" || role === "super_admin";

  // Detect client from URL & resolve theme + items
  const client = detectClient(location.pathname);
  const t = CLIENT_THEMES[client];

  const [navItems, setNavItems] = useState<NavItem[]>(() => getOrderedItems(client));
  const [editMode, setEditMode] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Refresh nav items when client changes
  useEffect(() => {
    setNavItems(getOrderedItems(client));
    setEditMode(false);
  }, [client]);

  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setDragOverIndex(index);
  };
  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    const updated = [...navItems];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(index, 0, moved);
    setNavItems(updated);
    localStorage.setItem(orderKey(client), JSON.stringify(updated.map((i) => i.to)));
    setDragIndex(null);
    setDragOverIndex(null);
  };
  const handleDragEnd = () => { setDragIndex(null); setDragOverIndex(null); };

  // Multiple clients available → show "switch client" affordance
  const hasMultipleClients = (enabledClients?.length ?? 0) > 1;

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border overflow-hidden">
      {/* Top accent line — themed per client */}
      <div className={`h-0.5 w-full shrink-0 ${t.topBar}`} />

      {/* Brand / Client header */}
      <div className="relative px-4 py-4 border-b border-sidebar-border overflow-hidden">
        {/* Ambient glow strip */}
        <div className={`pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full opacity-40 blur-2xl ${t.gradient}`} />

        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white p-1 ${t.glow}`}>
              {t.logo ? (
                <img src={t.logo} alt={t.label} className="h-full w-full object-contain" />
              ) : (
                <span className="text-xl">{t.fallback}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-sidebar-foreground truncate leading-tight">{t.label}</p>
              <p className="text-[9px] text-sidebar-foreground/50 uppercase tracking-widest mt-0.5 truncate">
                {t.sublabel}
              </p>
            </div>
          </div>
          {/* Close button on mobile */}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-sidebar-accent transition-colors lg:hidden shrink-0"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4 text-sidebar-foreground/60" />
          </button>
        </div>

        {/* Switch client (admins with multiple clients) */}
        {isAdmin && hasMultipleClients && (
          <button
            onClick={() => { onClose?.(); navigate("/client-selector"); }}
            className="relative mt-3 w-full flex items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground bg-sidebar-accent/40 hover:bg-sidebar-accent transition-colors"
          >
            <Repeat className="h-3 w-3" />
            Αλλαγή Client
          </button>
        )}
      </div>

      {/* DeltaNetwork branding micro-line */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-sidebar-border/60">
        <img src={deltaLogoIcon} alt="DeltaNetwork" className="h-4 w-auto object-contain opacity-70" />
        <span className="text-[8px] text-sidebar-foreground/40 uppercase tracking-widest">FTTx Operations</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        <div className="flex items-center justify-between px-3 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Μενού</p>
          <button
            onClick={() => setEditMode(!editMode)}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md transition-colors ${
              editMode
                ? `${t.badgeBg} ${t.badgeText}`
                : "text-sidebar-foreground/30 hover:text-sidebar-foreground/60"
            }`}
          >
            {editMode ? (
              <span className="flex items-center gap-1"><Check className="h-3 w-3" /> OK</span>
            ) : (
              "✏️"
            )}
          </button>
        </div>

        {navItems.map((item, index) => {
          const isActive =
            location.pathname === item.to ||
            (item.to !== `/${client}/dashboard` && location.pathname.startsWith(item.to + "/"));
          const isDragging = dragIndex === index;
          const isDragOver = dragOverIndex === index;
          const Icon = item.icon;

          return (
            <div
              key={item.to}
              draggable={editMode}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              className={`transition-all ${isDragging ? "opacity-40" : ""} ${isDragOver ? "border-t-2 border-primary" : ""}`}
            >
              <Link
                to={editMode ? "#" : item.to}
                onClick={(e) => {
                  if (editMode) { e.preventDefault(); return; }
                  onClose?.();
                }}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                  isActive && !editMode
                    ? `${t.gradient} text-white font-semibold shadow-lg`
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                } ${editMode ? "cursor-grab active:cursor-grabbing" : ""}`}
              >
                {editMode && (
                  <GripVertical className="h-3.5 w-3.5 text-sidebar-foreground/30 shrink-0 -ml-1" />
                )}
                <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive && !editMode ? "text-white" : ""}`} />
                <span className="truncate">{item.label}</span>
                {!editMode && item.to === "/ote/construction" && activeConstructions > 0 && (
                  <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-white/20 text-white" : `${t.badgeBg} ${t.badgeText}`
                  }`}>
                    {activeConstructions}
                  </span>
                )}
                {!editMode && isActive && !(item.to === "/ote/construction" && activeConstructions > 0) && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                )}
              </Link>
            </div>
          );
        })}

        {/* Common section */}
        <div className="pt-4 mt-2 border-t border-sidebar-border/60">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 px-3 pb-2">
            Γενικά
          </p>
          {COMMON_ITEMS.map((item) => {
            const isActive = location.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => onClose?.()}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                  isActive
                    ? `${t.gradient} text-white font-semibold shadow-lg`
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-white" : ""}`} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* User Section */}
      <div className="border-t border-sidebar-border px-4 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-bold text-sidebar-accent-foreground uppercase shrink-0">
            {user?.email?.charAt(0) || "U"}
          </div>
          <p className="text-[11px] text-sidebar-foreground truncate flex-1">{user?.email}</p>
          <NotificationBell />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex items-center justify-center rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={signOut}
            className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Αποσύνδεση
          </button>
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;
