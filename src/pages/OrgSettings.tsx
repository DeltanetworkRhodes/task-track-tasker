import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Settings, HardDrive, Mail, Save, Plus, Trash2, FolderOpen } from "lucide-react";

interface SettingRow {
  setting_key: string;
  setting_value: string;
}

const SETTING_DEFINITIONS = [
  {
    section: "Google Drive",
    icon: HardDrive,
    fields: [
      { key: "shared_drive_id", label: "Shared Drive ID", placeholder: "0AN9VpmNEa7QBUk9PVA", description: "Το ID του Shared Drive της εταιρίας" },
    ],
  },
  {
    section: "Email",
    icon: Mail,
    fields: [
      { key: "email_from", label: "Email Αποστολέα", placeholder: "noreply@company.gr", description: "Το email από το οποίο αποστέλλονται οι ειδοποιήσεις" },
      { key: "email_reply_to", label: "Reply-To Email", placeholder: "info@company.gr", description: "Το email απάντησης" },
      { key: "completion_to_emails", label: "Emails Ολοκλήρωσης (TO)", placeholder: "email1@example.com, email2@example.com", description: "Παραλήπτες email ολοκλήρωσης (χωρισμένοι με κόμμα)" },
      { key: "completion_cc_emails", label: "Emails Ολοκλήρωσης (CC)", placeholder: "cc@example.com", description: "CC παραλήπτες email ολοκλήρωσης" },
      { key: "low_stock_alert_email", label: "Email Ειδοποίησης Αποθήκης", placeholder: "warehouse@company.gr", description: "Email για ειδοποιήσεις χαμηλού αποθέματος" },
    ],
  },
];

const OrgSettings = () => {
  const queryClient = useQueryClient();
  const { organizationId } = useOrganization();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Area root folders state
  const [areaFolders, setAreaFolders] = useState<{ area: string; folderId: string }[]>([]);
  const [newArea, setNewArea] = useState("");
  const [newFolderId, setNewFolderId] = useState("");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["org-settings", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("org_settings")
        .select("setting_key, setting_value")
        .eq("organization_id", organizationId);
      if (error) throw error;
      return (data || []) as SettingRow[];
    },
    enabled: !!organizationId,
  });

  useEffect(() => {
    if (settings) {
      const map: Record<string, string> = {};
      settings.forEach((s) => {
        map[s.setting_key] = s.setting_value;
      });
      setValues(map);

      // Parse area folders
      try {
        const folders = JSON.parse(map["area_root_folders"] || "[]");
        setAreaFolders(folders);
      } catch {
        setAreaFolders([]);
      }
    }
  }, [settings]);

  const handleSave = async () => {
    if (!organizationId) return;
    setSaving(true);
    try {
      // Include area_root_folders in values
      const allValues = {
        ...values,
        area_root_folders: JSON.stringify(areaFolders),
      };

      for (const [key, value] of Object.entries(allValues)) {
        if (!value && value !== "") continue;
        const { error } = await supabase
          .from("org_settings")
          .upsert(
            { organization_id: organizationId, setting_key: key, setting_value: value } as any,
            { onConflict: "organization_id,setting_key" }
          );
        if (error) throw error;
      }
      toast.success("Ρυθμίσεις αποθηκεύτηκαν");
      queryClient.invalidateQueries({ queryKey: ["org-settings", organizationId] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const addAreaFolder = () => {
    if (!newArea.trim() || !newFolderId.trim()) return;
    setAreaFolders([...areaFolders, { area: newArea.trim().toUpperCase(), folderId: newFolderId.trim() }]);
    setNewArea("");
    setNewFolderId("");
  };

  const removeAreaFolder = (index: number) => {
    setAreaFolders(areaFolders.filter((_, i) => i !== index));
  };

  if (!organizationId) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Δεν ανήκετε σε κάποια εταιρία</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Ρυθμίσεις Εταιρίας
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Google Drive · Email · Φάκελοι Περιοχών
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-6">
            {SETTING_DEFINITIONS.map((section) => (
              <Card key={section.section} className="p-5 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-border">
                  <section.icon className="h-5 w-5 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">{section.section}</h2>
                </div>
                <div className="grid gap-4">
                  {section.fields.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <Label className="text-xs font-medium">{field.label}</Label>
                      <Input
                        value={values[field.key] || ""}
                        onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                        placeholder={field.placeholder}
                        className="text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground">{field.description}</p>
                    </div>
                  ))}
                </div>
              </Card>
            ))}

            {/* Area Root Folders */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <FolderOpen className="h-5 w-5 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Φάκελοι Περιοχών (Google Drive)</h2>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Ορίστε τα Folder IDs του Google Drive για κάθε περιοχή. Οι φάκελοι αυτοψιών/κατασκευών θα δημιουργηθούν αυτόματα μέσα σε αυτούς.
              </p>

              {areaFolders.length > 0 && (
                <div className="space-y-2">
                  {areaFolders.map((af, i) => (
                    <div key={i} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                      <span className="text-xs font-semibold text-foreground min-w-[80px]">{af.area}</span>
                      <span className="text-xs text-muted-foreground flex-1 font-bold truncate">{af.folderId}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeAreaFolder(i)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Περιοχή</Label>
                  <Input
                    value={newArea}
                    onChange={(e) => setNewArea(e.target.value)}
                    placeholder="π.χ. ΡΟΔΟΣ"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1 flex-[2]">
                  <Label className="text-xs">Folder ID</Label>
                  <Input
                    value={newFolderId}
                    onChange={(e) => setNewFolderId(e.target.value)}
                    placeholder="π.χ. 1ABcD_EfGhIjKlMnOpQrS"
                    className="text-sm font-bold"
                  />
                </div>
                <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={addAreaFolder}>
                  <Plus className="h-3.5 w-3.5" /> Προσθήκη
                </Button>
              </div>
            </Card>

            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? "Αποθήκευση..." : "Αποθήκευση Ρυθμίσεων"}
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default OrgSettings;
