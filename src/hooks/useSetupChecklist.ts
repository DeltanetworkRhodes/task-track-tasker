import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  route?: string;
  icon: string;
}

export function useSetupChecklist() {
  const { organizationId } = useOrganization();

  return useQuery({
    queryKey: ["setup-checklist", organizationId],
    queryFn: async (): Promise<SetupStep[]> => {
      if (!organizationId) return [];

      // Fetch all org_settings
      const { data: settings } = await supabase
        .from("org_settings")
        .select("setting_key, setting_value")
        .eq("organization_id", organizationId);

      const settingsMap: Record<string, string> = {};
      (settings || []).forEach((s) => {
        settingsMap[s.setting_key] = s.setting_value;
      });

      const hasEmailSettings = !!settingsMap["email_from"] || !!settingsMap["report_to_emails"];

      // Check if there are technicians
      const { count: techCount } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId);

      // Check if there are materials
      const { count: materialCount } = await supabase
        .from("materials")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId);

      // Check if there are work_pricing entries
      const { count: pricingCount } = await supabase
        .from("work_pricing")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId);

      // Check area folders
      let hasAreaFolders = false;
      try {
        const folders = JSON.parse(settingsMap["area_root_folders"] || "[]");
        hasAreaFolders = Array.isArray(folders) && folders.length > 0;
      } catch {
        hasAreaFolders = false;
      }

      const steps: SetupStep[] = [
        {
          id: "service_account",
          title: "Service Account",
          description: "Δημιουργία Google Service Account για σύνδεση με Drive & Sheets",
          completed: !!settingsMap["shared_drive_id"], // If drive is set, service account exists
          route: "/settings",
          icon: "key-round",
        },
        {
          id: "drive",
          title: "Google Drive",
          description: "Σύνδεση με Shared Drive για αρχεία αυτοψιών & κατασκευών",
          completed: !!settingsMap["shared_drive_id"],
          route: "/settings",
          icon: "hard-drive",
        },
        {
          id: "areas",
          title: "Περιοχές & Φάκελοι",
          description: "Ορισμός περιοχών (π.χ. ΡΟΔΟΣ, ΚΩΣ) και Folder IDs",
          completed: hasAreaFolders,
          route: "/settings",
          icon: "folder",
        },
        {
          id: "emails",
          title: "Ρυθμίσεις Email",
          description: "Email αποστολέα, παραλήπτες ειδοποιήσεων",
          completed: hasEmailSettings || !!settingsMap["email_from"],
          route: "/settings",
          icon: "mail",
        },
        {
          id: "users",
          title: "Τεχνικοί",
          description: "Προσθήκη τεχνικών για αναθέσεις αυτοψιών",
          completed: (techCount || 0) > 1, // More than just the admin
          route: "/users",
          icon: "users",
        },
        {
          id: "materials",
          title: "Αποθήκη Υλικών",
          description: "Εισαγωγή υλικών (μέσω sync ή χειροκίνητα)",
          completed: (materialCount || 0) > 0,
          route: "/materials",
          icon: "package",
        },
        {
          id: "pricing",
          title: "Τιμοκατάλογος Εργασιών",
          description: "Τιμές εργασιών κατασκευής (μέσω sync ή χειροκίνητα)",
          completed: (pricingCount || 0) > 0,
          route: "/work-pricing",
          icon: "euro",
        },
      ];

      return steps;
    },
    enabled: !!organizationId,
    staleTime: 60_000,
  });
}
