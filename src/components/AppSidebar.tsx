import { useState, useCallback, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ClipboardCheck, Wrench, Package, LogOut, FileText, TrendingUp, Search, UserCog, X, BarChart3, Settings, Sun, Moon, CalendarDays, GripVertical, Check, Columns3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import deltaLogoIcon from "@/assets/delta-logo-icon.png";
import { useTheme } from "next-themes";
import { useConstructions } from "@/hooks/useData";

const DEFAULT_NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/assignments', label: 'Αναθέσεις', icon: ClipboardCheck },
  { to: '/surveys', label: 'Αυτοψίες', icon: Search },
  { to: '/construction', label: 'Κατασκευές', icon: Wrench },
  { to: '/materials', label: 'Αποθήκη', icon: Package },
  { to: '/work-pricing', label: 'Τιμοκατάλογος', icon: FileText },
  { to: '/profit', label: 'Κέρδος/SR', icon: TrendingUp },
  { to: '/kanban', label: 'Kanban', icon: Columns3 },
  { to: '/kpis', label: 'KPIs Τεχνικών', icon: BarChart3 },
  { to: '/calendar', label: 'Ημερολόγιο', icon: CalendarDays },
  { to: '/users', label: 'Χρήστες', icon: UserCog },
  { to: '/settings', label: 'Ρυθμίσεις', icon: Settings },
];

const ICON_MAP: Record<string, React.ElementType> = {
  '/': LayoutDashboard,
  '/assignments': ClipboardCheck,
  '/surveys': Search,
  '/construction': Wrench,
  '/materials': Package,
  '/work-pricing': FileText,
  '/profit': TrendingUp,
  '/kpis': BarChart3,
  '/calendar': CalendarDays,
  '/users': UserCog,
  '/settings': Settings,
};

function getSavedOrder(): string[] | null {
  try {
    const saved = localStorage.getItem("sidebar-order");
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}

function getOrderedItems() {
  const savedOrder = getSavedOrder();
  if (!savedOrder) return DEFAULT_NAV_ITEMS;
  // Reorder based on saved routes, keeping any new items at end
  const ordered: typeof DEFAULT_NAV_ITEMS = [];
  savedOrder.forEach((route) => {
    const item = DEFAULT_NAV_ITEMS.find((i) => i.to === route);
    if (item) ordered.push(item);
  });
  // Add any items not in saved order
  DEFAULT_NAV_ITEMS.forEach((item) => {
    if (!ordered.find((o) => o.to === item.to)) ordered.push(item);
  });
  return ordered;
}

interface AppSidebarProps {
  onClose?: () => void;
}

const AppSidebar = ({ onClose }: AppSidebarProps) => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { data: constructions } = useConstructions();
  const activeConstructions = constructions?.filter(c => c.status === 'in_progress').length || 0;

  const [navItems, setNavItems] = useState(getOrderedItems);
  const [editMode, setEditMode] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

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
    localStorage.setItem("sidebar-order", JSON.stringify(updated.map((i) => i.to)));
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border overflow-hidden">
      {/* Top gradient line */}
      <div className="h-0.5 w-full cosmote-gradient shrink-0" />
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
        <div className="flex-1 min-w-0">
          <img src={deltaLogoIcon} alt="DeltaNetwork" className="h-10 w-auto object-contain" />
          <p className="text-[9px] text-sidebar-foreground/50 uppercase tracking-widest mt-1 pl-0.5">FTTx Operations</p>
        </div>
        {/* Close button on mobile */}
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 hover:bg-sidebar-accent transition-colors lg:hidden"
        >
          <X className="h-4 w-4 text-sidebar-foreground/60" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        <div className="flex items-center justify-between px-3 pb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Μενού</p>
          <button
            onClick={() => setEditMode(!editMode)}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md transition-colors ${
              editMode
                ? "bg-primary/10 text-primary"
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
          const isActive = location.pathname === item.to;
          const isDragging = dragIndex === index;
          const isDragOver = dragOverIndex === index;
          const Icon = ICON_MAP[item.to] || item.icon;

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
                  if (editMode) {
                    e.preventDefault();
                    return;
                  }
                  onClose?.();
                }}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                  isActive && !editMode
                    ? 'cosmote-gradient text-white font-semibold shadow-lg shadow-primary/20'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                } ${editMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
              >
                {editMode && (
                  <GripVertical className="h-3.5 w-3.5 text-sidebar-foreground/30 shrink-0 -ml-1" />
                )}
                <Icon className={`h-[18px] w-[18px] shrink-0 ${isActive && !editMode ? 'text-white' : ''}`} />
                {item.label}
                {!editMode && item.to === '/construction' && activeConstructions > 0 && (
                  <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
                  }`}>
                    {activeConstructions}
                  </span>
                )}
                {!editMode && isActive && !(item.to === '/construction' && activeConstructions > 0) && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                )}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="border-t border-sidebar-border px-4 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-bold text-sidebar-accent-foreground uppercase shrink-0">
            {user?.email?.charAt(0) || 'U'}
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
