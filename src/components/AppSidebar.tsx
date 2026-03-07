import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ClipboardCheck, Wrench, Package, LogOut, Wifi, FileText, TrendingUp, Search, UserCog, X, BarChart3, Settings, Sun, Moon, CalendarDays } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import NotificationBell from "@/components/NotificationBell";
import deltaLogoIcon from "@/assets/delta-logo-icon.png";
import { useTheme } from "next-themes";

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/assignments', label: 'Αναθέσεις', icon: ClipboardCheck },
  { to: '/surveys', label: 'Αυτοψίες', icon: Search },
  { to: '/construction', label: 'Κατασκευές', icon: Wrench },
  { to: '/materials', label: 'Αποθήκη', icon: Package },
  { to: '/work-pricing', label: 'Τιμοκατάλογος', icon: FileText },
  { to: '/profit', label: 'Κέρδος/SR', icon: TrendingUp },
  { to: '/kpis', label: 'KPIs Τεχνικών', icon: BarChart3 },
  { to: '/users', label: 'Χρήστες', icon: UserCog },
  { to: '/settings', label: 'Ρυθμίσεις', icon: Settings },
];

interface AppSidebarProps {
  onClose?: () => void;
}

const AppSidebar = ({ onClose }: AppSidebarProps) => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

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
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Μενού</p>
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                isActive
                  ? 'cosmote-gradient text-white font-semibold shadow-lg shadow-primary/20'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              }`}
            >
              <item.icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-white' : ''}`} />
              {item.label}
              {isActive && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              )}
            </Link>
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
