import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

export type ClientCode = "ote" | "vodafone" | "nova" | "deh" | "master";

const ALL_CLIENTS: ClientCode[] = ["ote", "vodafone", "nova", "deh", "master"];

export function useEnabledClients() {
  const { data: role } = useUserRole();

  return useQuery({
    queryKey: ["enabled_clients", role],
    queryFn: async (): Promise<ClientCode[]> => {
      // Super admin sees everything
      if (role === "super_admin") return ALL_CLIENTS;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return ["ote"];

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (pErr || !profile?.organization_id) return ["ote"];

      const { data: org, error: oErr } = await supabase
        .from("organizations")
        .select("enabled_clients")
        .eq("id", profile.organization_id)
        .maybeSingle();

      if (oErr || !org) return ["ote"];

      const list = (org as { enabled_clients?: string[] | null }).enabled_clients;
      if (!list || list.length === 0) return ["ote"];

      return list.filter((c): c is ClientCode =>
        (ALL_CLIENTS as string[]).includes(c)
      );
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useIsClientEnabled(client: ClientCode): boolean {
  const { data: enabled } = useEnabledClients();
  return enabled?.includes(client) ?? false;
}
