import { useNavigate, useLocation } from "react-router-dom";
import { ChevronDown, Check, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface ClientOption {
  code: string;
  label: string;
  icon: string;
  path: string;
  comingSoon?: boolean;
}

const CLIENTS: ClientOption[] = [
  { code: 'ote', label: 'OTE', icon: '📡', path: '/ote/dashboard' },
  { code: 'vodafone', label: 'VODAFONE', icon: '📱', path: '/vodafone/dashboard', comingSoon: true },
  { code: 'nova', label: 'NOVA', icon: '📺', path: '/nova/dashboard', comingSoon: true },
  { code: 'deh', label: 'ΔΕΗ', icon: '⚡', path: '/deh/dashboard', comingSoon: true },
  { code: 'master', label: 'Συνολική Εικόνα', icon: '💼', path: '/master/dashboard' },
];

function detectCurrentClient(pathname: string): string {
  if (
    pathname.startsWith('/ote') ||
    pathname.startsWith('/assignments') ||
    pathname.startsWith('/construction') ||
    pathname.startsWith('/surveys') ||
    pathname.startsWith('/materials') ||
    pathname.startsWith('/profit') ||
    pathname.startsWith('/kpis') ||
    pathname.startsWith('/calendar') ||
    pathname.startsWith('/documents') ||
    pathname.startsWith('/work-pricing') ||
    pathname.startsWith('/earnings-pricing') ||
    pathname.startsWith('/photo-requirements') ||
    pathname.startsWith('/ote-pricing')
  ) return 'ote';
  if (pathname.startsWith('/vodafone')) return 'vodafone';
  if (pathname.startsWith('/nova')) return 'nova';
  if (pathname.startsWith('/deh')) return 'deh';
  if (pathname.startsWith('/master')) return 'master';
  return 'ote';
}

export function ClientSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();

  const currentCode = detectCurrentClient(location.pathname);
  const current = CLIENTS.find((c) => c.code === currentCode) || CLIENTS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 h-10 font-semibold"
        >
          <span className="text-lg">{current.icon}</span>
          <span className="flex-1 text-left truncate">{current.label}</span>
          <ChevronDown className="w-4 h-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 z-50 bg-popover">
        <DropdownMenuLabel>Άλλαξε Client</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CLIENTS.map((c) => (
          <DropdownMenuItem
            key={c.code}
            onClick={() => !c.comingSoon && navigate(c.path)}
            disabled={c.comingSoon}
            className="gap-2 cursor-pointer"
          >
            <span className="text-base">{c.icon}</span>
            <span className="flex-1">{c.label}</span>
            {c.comingSoon && (
              <span className="text-xs text-muted-foreground">Σύντομα</span>
            )}
            {c.code === currentCode && !c.comingSoon && (
              <Check className="w-4 h-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => navigate('/client-selector')}
          className="gap-2 cursor-pointer"
        >
          <Home className="w-4 h-4" />
          <span>Πίνακες Ελέγχου</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
