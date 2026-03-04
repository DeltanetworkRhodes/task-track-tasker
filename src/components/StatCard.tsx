import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}

const StatCard = ({ title, value, subtitle, icon: Icon, trend, trendValue }: StatCardProps) => {
  return (
    <div className="rounded-lg border border-glow bg-card p-5 glow-primary transition-all hover:border-primary/40">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold font-mono text-gradient-primary">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="rounded-md bg-primary/10 p-2">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
      {trend && trendValue && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          <span className={trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground'}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
          </span>
          <span className="text-muted-foreground">vs προηγ. μήνα</span>
        </div>
      )}
    </div>
  );
};

export default StatCard;
