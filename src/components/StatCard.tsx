import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  accent?: boolean;
}

const StatCard = ({ title, value, subtitle, icon: Icon, trend, trendValue, accent }: StatCardProps) => {
  return (
    <div className="group rounded-xl border border-border bg-card p-5 transition-all hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className={`text-2xl font-extrabold font-mono ${accent ? 'text-gradient-accent' : 'text-gradient-primary'}`}>{value}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={`rounded-xl p-2.5 transition-colors ${accent ? 'bg-accent/10 group-hover:bg-accent/15' : 'bg-primary/8 group-hover:bg-primary/12'}`}>
          <Icon className={`h-5 w-5 ${accent ? 'text-accent' : 'text-primary'}`} />
        </div>
      </div>
      {trend && trendValue && (
        <div className="mt-3 flex items-center gap-1.5 text-[11px]">
          <span className={`font-medium ${trend === 'up' ? 'text-success' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground'}`}>
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendValue}
          </span>
        </div>
      )}
    </div>
  );
};

export default StatCard;
