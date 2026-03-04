import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ClipboardCheck, Wrench, Package, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import deltaLogo from "@/assets/delta-logo.jpg";

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/assignments', label: 'Αυτοψίες', icon: ClipboardCheck },
  { to: '/construction', label: 'Κατασκευές', icon: Wrench },
  { to: '/materials', label: 'Αποθήκη', icon: Package },
];

const AppSidebar = () => {
  const location = useLocation();
  const { user, signOut } = useAuth();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-border/50 bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-border/50 px-4 py-4">
        <img
          src={deltaLogo}
          alt="Delta Network"
          className="h-9 w-auto rounded bg-foreground/90 px-1.5 py-0.5"
        />
        <div className="min-w-0">
          <p className="text-[10px] text-muted-foreground tracking-wider uppercase">FTTH Operations</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all ${
                isActive
                  ? 'bg-primary/10 text-primary border-glow border glow-primary font-medium'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border/50 px-4 py-3 space-y-2">
        <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Αποσύνδεση
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;