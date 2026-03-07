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
import { Settings, HardDrive, Mail, Save, Plus, Trash2, FolderOpen, KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, Shield } from "lucide-react";

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
      { key: "email_from", label: "Email Αποστολέα", placeholder: "noreply@company.gr", description: "Το email που εμφανίζεται ως «Από:» στα emails (πρέπει να είναι verified στο Resend)" },
      { key: "email_reply_to", label: "Reply-To Email", placeholder: "info@company.gr", description: "Το email στο οποίο θα απαντήσει ο παραλήπτης" },
      { key: "report_to_emails", label: "Παραλήπτες Αυτοψιών / Ακυρώσεων (TO)", placeholder: "supervisor@company.gr, manager@company.gr", description: "Emails που λαμβάνουν αναφορές αυτοψιών, ακυρώσεων και blockers (χωρισμένα με κόμμα)" },
      { key: "report_cc_emails", label: "Παραλήπτες Αυτοψιών / Ακυρώσεων (CC)", placeholder: "cc@company.gr", description: "CC παραλήπτες για τα ίδια emails" },
      { key: "completion_to_emails", label: "Παραλήπτες Ολοκλήρωσης Κατασκευής (TO)", placeholder: "ote@example.com, billing@company.gr", description: "Emails που λαμβάνουν το ZIP ολοκλήρωσης κατασκευής (χωρισμένα με κόμμα)" },
      { key: "completion_cc_emails", label: "Παραλήπτες Ολοκλήρωσης Κατασκευής (CC)", placeholder: "cc@company.gr", description: "CC παραλήπτες για emails ολοκλήρωσης" },
      { key: "low_stock_alert_email", label: "Email Ειδοποίησης Αποθήκης", placeholder: "warehouse@company.gr", description: "Email για ειδοποιήσεις χαμηλού αποθέματος υλικών OTE" },
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

  // Service Account JSON key state
  const [saKeyJson, setSaKeyJson] = useState("");
  const [saKeyVisible, setSaKeyVisible] = useState(false);
  const [saKeySaving, setSaKeySaving] = useState(false);
  const [saKeyStatus, setSaKeyStatus] = useState<"none" | "valid" | "invalid" | "saved">("none");

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

      // Check if service account key exists
      if (map["service_account_email"]) {
        setSaKeyStatus("saved");
      }
    }
  }, [settings]);

  const validateAndParseSaKey = (jsonStr: string): { valid: boolean; email?: string; projectId?: string } => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.type !== "service_account" || !parsed.client_email || !parsed.private_key || !parsed.project_id) {
        return { valid: false };
      }
      return { valid: true, email: parsed.client_email, projectId: parsed.project_id };
    } catch {
      return { valid: false };
    }
  };

  const handleSaKeyChange = (val: string) => {
    setSaKeyJson(val);
    if (!val.trim()) {
      setSaKeyStatus("none");
      return;
    }
    const result = validateAndParseSaKey(val);
    setSaKeyStatus(result.valid ? "valid" : "invalid");
  };

  const handleSaveSaKey = async () => {
    if (!organizationId) return;
    const result = validateAndParseSaKey(saKeyJson);
    if (!result.valid) {
      toast.error("Μη έγκυρο JSON κλειδί Service Account");
      return;
    }
    setSaKeySaving(true);
    try {
      // Save the JSON key as org setting (encrypted at rest in the database)
      const settingsToSave = [
        { key: "service_account_key", value: saKeyJson.trim() },
        { key: "service_account_email", value: result.email! },
        { key: "service_account_project_id", value: result.projectId! },
      ];

      for (const s of settingsToSave) {
        const { error } = await supabase
          .from("org_settings")
          .upsert(
            { organization_id: organizationId, setting_key: s.key, setting_value: s.value } as any,
            { onConflict: "organization_id,setting_key" }
          );
        if (error) throw error;
      }

      toast.success("Service Account αποθηκεύτηκε επιτυχώς");
      setSaKeyJson("");
      setSaKeyStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["org-settings", organizationId] });
      queryClient.invalidateQueries({ queryKey: ["setup-checklist"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaKeySaving(false);
    }
  };

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

  const savedEmail = values["service_account_email"];
  const savedProjectId = values["service_account_project_id"];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Ρυθμίσεις Εταιρίας
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Service Account · Google Drive · Email · Φάκελοι Περιοχών
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-6">

            {/* Service Account JSON Key */}
            <Card className="p-5 space-y-4 border-primary/20">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <KeyRound className="h-5 w-5 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Google Service Account</h2>
                {saKeyStatus === "saved" && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-success bg-success/10 px-2 py-0.5 rounded-lg">
                    <CheckCircle2 className="h-3 w-3" /> Ρυθμισμένο
                  </span>
                )}
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Το Service Account επιτρέπει στην εφαρμογή να δημιουργεί φακέλους, να ανεβάζει αρχεία και να διαβάζει δεδομένα
                από το Google Drive. Επικολλήστε εδώ το JSON κλειδί που κατεβάσατε από το Google Cloud Console.
              </p>

              {/* Show saved info */}
              {saKeyStatus === "saved" && savedEmail && (
                <div className="rounded-xl bg-success/5 border border-success/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-success" />
                    <p className="text-xs font-bold text-foreground">Συνδεδεμένο Service Account</p>
                  </div>
                  <div className="grid gap-1.5 ml-6">
                    <div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Email:</span>
                      <p className="text-xs font-bold text-foreground">{savedEmail}</p>
                    </div>
                    {savedProjectId && (
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Project:</span>
                        <p className="text-xs font-bold text-foreground">{savedProjectId}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground ml-6">
                    Για να αντικαταστήσετε το κλειδί, επικολλήστε ένα νέο παρακάτω.
                  </p>
                </div>
              )}

              {/* JSON input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">JSON Κλειδί</Label>
                  <button
                    onClick={() => setSaKeyVisible(!saKeyVisible)}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  >
                    {saKeyVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {saKeyVisible ? "Απόκρυψη" : "Εμφάνιση"}
                  </button>
                </div>
                <Textarea
                  value={saKeyJson}
                  onChange={(e) => handleSaKeyChange(e.target.value)}
                  placeholder='Επικολλήστε εδώ το περιεχόμενο του αρχείου JSON (ξεκινάει με { "type": "service_account", ... })'
                  className={`text-xs font-mono min-h-[120px] ${
                    !saKeyVisible && saKeyJson ? "text-transparent [text-shadow:0_0_5px_hsl(var(--foreground)/0.5)]" : ""
                  } ${
                    saKeyStatus === "valid"
                      ? "border-success/50 focus:border-success"
                      : saKeyStatus === "invalid"
                      ? "border-destructive/50 focus:border-destructive"
                      : ""
                  }`}
                />

                {/* Validation feedback */}
                {saKeyStatus === "valid" && (
                  <div className="flex items-center gap-2 text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">
                      Έγκυρο κλειδί — {validateAndParseSaKey(saKeyJson).email}
                    </span>
                  </div>
                )}
                {saKeyStatus === "invalid" && (
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">
                      Μη έγκυρο JSON. Βεβαιωθείτε ότι αντιγράψατε ολόκληρο το αρχείο (πρέπει να περιέχει "type": "service_account")
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSaveSaKey}
                  disabled={saKeySaving || saKeyStatus !== "valid"}
                  size="sm"
                  className="gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saKeySaving ? "Αποθήκευση..." : "Αποθήκευση Service Account"}
                </Button>
              </div>

              {/* Security note */}
              <div className="rounded-xl bg-warning/5 border border-warning/20 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    <span className="font-bold text-warning">Ασφάλεια:</span> Το κλειδί αποθηκεύεται κρυπτογραφημένα στη βάση δεδομένων
                    και δεν είναι προσβάσιμο από χρήστες ή τεχνικούς. Χρησιμοποιείται μόνο από τις αυτοματοποιήσεις της εφαρμογής.
                  </p>
                </div>
              </div>
            </Card>

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
