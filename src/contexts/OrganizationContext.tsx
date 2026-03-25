import { createContext, useContext, useState, ReactNode, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  status: string;
  plan: string;
  max_users: number;
}

interface OrganizationContextType {
  organization: Organization | null;
  organizationId: string | null;
  isLoading: boolean;
  /** Super admin can override the active org context */
  overrideOrgId: string | null;
  setOverrideOrgId: (id: string | null) => void;
}

const OrganizationContext = createContext<OrganizationContextType>({
  organization: null,
  organizationId: null,
  isLoading: true,
  overrideOrgId: null,
  setOverrideOrgId: () => {},
});

export const useOrganization = () => useContext(OrganizationContext);

export const OrganizationProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [overrideOrgId, setOverrideOrgId] = useState<string | null>(null);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["my-profile-org", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  // The effective org id: super admin override takes priority
  const orgId = overrideOrgId ?? profile?.organization_id ?? null;

  const { data: organization, isLoading: orgLoading } = useQuery({
    queryKey: ["organization", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data as Organization | null;
    },
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5,
  });

  const handleSetOverride = useCallback((id: string | null) => {
    setOverrideOrgId(id);
  }, []);

  return (
    <OrganizationContext.Provider
      value={{
        organization: organization ?? null,
        organizationId: orgId,
        isLoading: profileLoading || (!!orgId && orgLoading),
        overrideOrgId,
        setOverrideOrgId: handleSetOverride,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
};
