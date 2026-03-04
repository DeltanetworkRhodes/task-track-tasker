import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ClipboardCheck, Wrench, Package, Zap } from "lucide-react";

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/assignments', label: 'Αυτοψίες', icon: ClipboardCheck },
  { to: '/construction', label: 'Κατασκευές', icon: Wrench },
  { to: '/materials', label: 'Αποθήκη', icon: Package },
];

const AppSidebar = () => {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-border/50 bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-border/50 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 glow-primary">
          <Zap className="h-4 w-4 text-primary animate-pulse-glow" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-gradient-primary">DELTANETWORK</h1>
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

      <div className="border-t border-border/50 px-5 py-4">
        <p className="text-[10px] text-muted-foreground tracking-wider uppercase">Ρόδος — Κως</p>
      </div>
    </aside>
  );
};

export default AppSidebar;
