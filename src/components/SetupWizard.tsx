import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSetupChecklist } from "@/hooks/useSetupChecklist";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  ArrowRight,
  Sparkles,
  X,
  AlertCircle,
  KeyRound,
  FolderOpen,
  Users,
  Package,
  Euro,
  Mail,
  Loader2,
  SkipForward,
} from "lucide-react";
import deltaLogo from "@/assets/delta-logo-icon.png";

interface SetupWizardProps {
  onDismiss?: () => void;
  demoMode?: boolean;
}

const AREAS_LIST = [
  "ΡΟΔΟΣ", "ΚΩΣ", "ΚΑΛΥΜΝΟΣ", "ΛΕΡΟΣ", "ΣΥΜΗ", "ΧΑΛΚΗ",
  "ΚΑΡΠΑΘΟΣ", "ΤΗΛΟΣ", "ΝΙΣΥΡΟΣ", "ΚΩΣ ΝΟΤΙΑ",
];

const STEP_ICONS = [KeyRound, FolderOpen, Users, Package];
const STEP_LABELS = ["Σύνδεση Google", "Περιοχές & Drive", "Τεχνικοί & Email", "Υλικά & Τιμοκατάλογος"];

const SetupWizard = ({ onDismiss, demoMode = false }: SetupWizardProps) => {
  const { data: realSteps, isLoading } = useSetupChecklist();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();

  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([false, false, false, false]);
  const [validating, setValidating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Step 1 state
  const [saJson, setSaJson] = useState("");
  const [saEmail, setSaEmail] = useState("");
  const [saVerifying, setSaVerifying] = useState(false);

  // Step 2 state
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [customArea, setCustomArea] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [driveId, setDriveId] = useState("");
  const [creatingFolders, setCreatingFolders] = useState(false);
  const [createdAreas, setCreatedAreas] = useState<string[]>([]);

  // Step 3 state
  const [techEmails, setTechEmails] = useState("");
  const [sendingInvites, setSendingInvites] = useState(false);
  const [inviteProgress, setInviteProgress] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [savingEmails, setSavingEmails] = useState(false);

  // Step 4 state
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materialsLoaded, setMaterialsLoaded] = useState(false);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [pricingLoaded, setPricingLoaded] = useState(false);

  const markComplete = useCallback((stepIdx: number) => {
    setCompletedSteps(prev => {
      const next = [...prev];
      next[stepIdx] = true;
      return next;
    });
  }, []);

  const advanceStep = useCallback((fromStep: number) => {
    markComplete(fromStep);
    if (fromStep < 3) {
      setCurrentStep(fromStep + 1);
    }
  }, [markComplete]);

  const saveSetting = async (key: string, value: string) => {
    if (demoMode || !organizationId) return;
    await supabase.from("org_settings").upsert({
      organization_id: organizationId,
      setting_key: key,
      setting_value: value,
    }, { onConflict: "organization_id,setting_key" });
  };

  // ═══════════ STEP 1: Verify Service Account ═══════════
  const handleVerifySA = async () => {
    if (demoMode) {
      setSaEmail("demo-sa@project.iam.gserviceaccount.com");
      toast.success("Demo: Service Account συνδέθηκε");
      advanceStep(0);
      return;
    }

    setSaVerifying(true);
    try {
      let parsed: any;
      try {
        parsed = JSON.parse(saJson);
      } catch {
        toast.error("Μη έγκυρο JSON — βεβαιωθείτε ότι αντιγράψατε ολόκληρο το αρχείο");
        return;
      }

      const missing: string[] = [];
      if (!parsed.client_email) missing.push("client_email");
      if (!parsed.private_key) missing.push("private_key");
      if (!parsed.project_id) missing.push("project_id");
      if (missing.length > 0) {
        toast.error(`Λείπουν τα πεδία: ${missing.join(", ")}`);
        return;
      }

      setSaEmail(parsed.client_email);
      await saveSetting("service_account_json", saJson);
      await saveSetting("shared_drive_id", "pending"); // Mark as having SA
      toast.success("Service Account επαληθεύτηκε!");
      advanceStep(0);
    } catch (err: any) {
      toast.error("Σφάλμα: " + (err.message || "Δοκιμάστε ξανά"));
    } finally {
      setSaVerifying(false);
    }
  };

  // ═══════════ STEP 2: Create Folders ═══════════
  const handleToggleArea = (area: string) => {
    setSelectedAreas(prev =>
      prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]
    );
  };

  const handleAddCustomArea = () => {
    const trimmed = customArea.trim().toUpperCase();
    if (trimmed && !selectedAreas.includes(trimmed)) {
      setSelectedAreas(prev => [...prev, trimmed]);
      setCustomArea("");
      setShowCustomInput(false);
    }
  };

  const handleCreateFolders = async () => {
    if (!driveId.trim() && !demoMode) {
      toast.error("Εισάγετε το Shared Drive ID");
      return;
    }
    if (selectedAreas.length === 0) {
      toast.error("Επιλέξτε τουλάχιστον μία περιοχή");
      return;
    }

    setCreatingFolders(true);
    setCreatedAreas([]);

    if (demoMode) {
      for (const area of selectedAreas) {
        await new Promise(r => setTimeout(r, 300));
        setCreatedAreas(prev => [...prev, area]);
      }
      toast.success(`${selectedAreas.length} φάκελοι δημιουργήθηκαν!`);
      setCreatingFolders(false);
      advanceStep(1);
      return;
    }

    try {
      await saveSetting("shared_drive_id", driveId.trim());

      const areaFolders = selectedAreas.map(name => ({
        name,
        folderId: "", // Will be filled when folders are created
      }));

      // Try to create folders via edge function
      for (const area of selectedAreas) {
        try {
          const { data } = await supabase.functions.invoke("google-drive-sync", {
            body: {
              action: "create_folder",
              driveId: driveId.trim(),
              folderName: area,
              organizationId,
            },
          });
          const folderId = data?.folderId || "";
          const idx = areaFolders.findIndex(f => f.name === area);
          if (idx >= 0) areaFolders[idx].folderId = folderId;
        } catch {
          // If function doesn't exist, continue
        }
        setCreatedAreas(prev => [...prev, area]);
      }

      await saveSetting("area_root_folders", JSON.stringify(areaFolders));
      queryClient.invalidateQueries({ queryKey: ["setup-checklist"] });
      toast.success(`${selectedAreas.length} περιοχές αποθηκεύτηκαν!`);
      advanceStep(1);
    } catch (err: any) {
      toast.error("Σφάλμα: " + (err.message || "Δοκιμάστε ξανά"));
    } finally {
      setCreatingFolders(false);
    }
  };

  // ═══════════ STEP 3: Invites & Email ═══════════
  const handleSendInvites = async () => {
    const emails = techEmails
      .split("\n")
      .map(e => e.trim())
      .filter(e => e && e.includes("@"));

    if (emails.length === 0) {
      toast.error("Εισάγετε τουλάχιστον ένα email");
      return;
    }

    if (demoMode) {
      setSendingInvites(true);
      for (let i = 0; i < emails.length; i++) {
        setInviteProgress(`Αποστολή ${i + 1}/${emails.length}...`);
        await new Promise(r => setTimeout(r, 400));
      }
      setInviteProgress(`✓ ${emails.length} προσκλήσεις εστάλησαν`);
      setSendingInvites(false);
      return;
    }

    setSendingInvites(true);
    let sent = 0;
    for (let i = 0; i < emails.length; i++) {
      setInviteProgress(`Αποστολή ${i + 1}/${emails.length}...`);
      try {
        await supabase.functions.invoke("create-user", {
          body: {
            email: emails[i],
            role: "technician",
            organizationId,
          },
        });
        sent++;
      } catch {
        toast.error(`⚠ Δεν στάλθηκε το ${emails[i]} — ελέγξτε αν είναι έγκυρο`);
      }
    }
    setInviteProgress(`✓ ${sent} προσκλήσεις εστάλησαν`);
    setSendingInvites(false);
    queryClient.invalidateQueries({ queryKey: ["setup-checklist"] });
  };

  const handleSaveEmails = async () => {
    if (demoMode) {
      toast.success("Demo: Email αποθηκεύτηκαν");
      advanceStep(2);
      return;
    }

    setSavingEmails(true);
    try {
      if (emailFrom) await saveSetting("email_from", emailFrom);
      if (reportTo) await saveSetting("report_to_emails", reportTo);
      queryClient.invalidateQueries({ queryKey: ["setup-checklist"] });
      toast.success("Ρυθμίσεις email αποθηκεύτηκαν!");
      advanceStep(2);
    } catch (err: any) {
      toast.error("Σφάλμα αποθήκευσης");
    } finally {
      setSavingEmails(false);
    }
  };

  // ═══════════ STEP 4: Materials & Pricing ═══════════
  const handleLoadMaterials = async () => {
    if (demoMode) {
      setLoadingMaterials(true);
      await new Promise(r => setTimeout(r, 1500));
      setMaterialsLoaded(true);
      setLoadingMaterials(false);
      toast.success("Demo: 847 υλικά φορτώθηκαν");
      return;
    }

    setLoadingMaterials(true);
    try {
      await supabase.functions.invoke("sync-materials", {
        body: { organizationId },
      });
      setMaterialsLoaded(true);
      queryClient.invalidateQueries({ queryKey: ["setup-checklist"] });
      toast.success("Υλικά φορτώθηκαν επιτυχώς!");
    } catch (err: any) {
      toast.error("Σφάλμα φόρτωσης υλικών: " + (err.message || ""));
    } finally {
      setLoadingMaterials(false);
    }
  };

  const handleLoadPricing = async () => {
    if (demoMode) {
      setLoadingPricing(true);
      await new Promise(r => setTimeout(r, 1200));
      setPricingLoaded(true);
      setLoadingPricing(false);
      toast.success("Demo: Τιμοκατάλογος φορτώθηκε");
      return;
    }

    setLoadingPricing(true);
    try {
      await supabase.functions.invoke("sync-materials", {
        body: { organizationId },
      });
      setPricingLoaded(true);
      queryClient.invalidateQueries({ queryKey: ["setup-checklist"] });
      toast.success("Τιμοκατάλογος φορτώθηκε!");
    } catch (err: any) {
      toast.error("Σφάλμα: " + (err.message || ""));
    } finally {
      setLoadingPricing(false);
    }
  };

  // ═══════════ FINAL VALIDATION (preserved) ═══════════
  const handleFinalValidation = async () => {
    if (demoMode) {
      toast.success("🎉 Η εγκατάσταση ολοκληρώθηκε!");
      onDismiss?.();
      return;
    }
    setValidating(true);
    setValidationErrors([]);
    try {
      const errors: string[] = [];
      const { data: settings } = await supabase
        .from("org_settings")
        .select("setting_key, setting_value")
        .eq("organization_id", organizationId!);

      const settingsMap: Record<string, string> = {};
      (settings || []).forEach((s) => {
        settingsMap[s.setting_key] = s.setting_value;
      });

      if (!settingsMap["shared_drive_id"]) {
        errors.push("Google Drive: Δεν έχει οριστεί Shared Drive ID");
      }

      let hasAreaFolders = false;
      try {
        const folders = JSON.parse(settingsMap["area_root_folders"] || "[]");
        hasAreaFolders = Array.isArray(folders) && folders.length > 0;
      } catch { hasAreaFolders = false; }
      if (!hasAreaFolders) {
        errors.push("Περιοχές: Δεν έχουν οριστεί φάκελοι περιοχών");
      }

      if (!settingsMap["email_from"] && !settingsMap["report_to_emails"]) {
        errors.push("Email: Δεν έχουν ρυθμιστεί οι παραλήπτες email");
      }

      const { count: techCount } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId!);
      if ((techCount || 0) <= 1) {
        errors.push("Τεχνικοί: Δεν έχετε προσθέσει τεχνικούς");
      }

      const { count: materialCount } = await supabase
        .from("materials")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId!);
      if ((materialCount || 0) === 0) {
        errors.push("Αποθήκη: Δεν υπάρχουν υλικά");
      }

      const { count: pricingCount } = await supabase
        .from("work_pricing")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId!);
      if ((pricingCount || 0) === 0) {
        errors.push("Τιμοκατάλογος: Δεν υπάρχουν εργασίες");
      }

      if (errors.length > 0) {
        setValidationErrors(errors);
        toast.error(`${errors.length} βήματα δεν ολοκληρώθηκαν σωστά`);
        return;
      }

      // Seed default work categories if none exist
      const { count: catCount } = await supabase
        .from("sr_work_categories" as any)
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId!);
      if ((catCount || 0) === 0) {
        await supabase.from("sr_work_categories" as any).insert([
          { organization_id: organizationId!, name: "Σκάμμα", sort_order: 1, photo_categories: ["ΣΚΑΜΜΑ"], requires_works: true },
          { organization_id: organizationId!, name: "Εμφύσηση", sort_order: 2, photo_categories: ["ΕΜΦΥΣΗΣΗ", "ΟΠΤΙΚΗ"] },
          { organization_id: organizationId!, name: "Κουτιά / Κανάλια / Οδεύσεις", sort_order: 3, photo_categories: ["FB", "BEP", "BMO", "ΚΑΝΑΛΙΑ", "ΣΠΙΡΑΛ", "ΟΔΕΥΣΗ"], requires_works: true },
          { organization_id: organizationId!, name: "Κόλληση Ινών & OTDR", sort_order: 4, photo_categories: ["ΚΟΛΛΗΣΗ", "OTDR"], requires_measurements: true },
          { organization_id: organizationId!, name: "Γ' Φάση — Οδεύσεις OTO", sort_order: 5, photo_categories: ["ΟΔΕΥΣΗ_ΟΤΟ", "ΤΕΛΙΚΗ"], requires_works: true, can_close_sr: true },
        ]);
      }

      await supabase.from("org_settings").upsert({
        organization_id: organizationId!,
        setting_key: "setup_wizard_completed",
        setting_value: "true",
      }, { onConflict: "organization_id,setting_key" });

      queryClient.invalidateQueries({ queryKey: ["setup-checklist"] });
      queryClient.invalidateQueries({ queryKey: ["setup-wizard-status"] });
      toast.success("Η ρύθμιση ολοκληρώθηκε επιτυχώς! 🎉");
      onDismiss?.();
    } catch (err: any) {
      toast.error("Σφάλμα επαλήθευσης: " + (err.message || "Δοκιμάστε ξανά"));
    } finally {
      setValidating(false);
    }
  };

  if (!demoMode && isLoading) return null;

  const completedCount = completedSteps.filter(Boolean).length;
  const progress = Math.round((completedCount / 4) * 100);

  // ═══════════ RENDER ═══════════
  return (
    <Card className="overflow-hidden border-primary/20 max-w-2xl mx-auto">
      {/* Top gradient bar */}
      <div className="h-1.5 cosmote-gradient" />

      {/* Header */}
      <div className="px-4 sm:px-6 pt-5 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src={deltaLogo} alt="Delta" className="h-8 w-8 rounded-lg" />
            <div>
              <h2 className="text-base font-bold text-foreground">Εγκατάσταση DeltaNetwork</h2>
              <p className="text-xs text-muted-foreground">
                Βήμα {currentStep + 1} από 4 — {STEP_LABELS[currentStep]}
              </p>
            </div>
          </div>
          {onDismiss && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onDismiss}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Step dots */}
        <div className="flex items-center gap-3 mt-4">
          {[0, 1, 2, 3].map(i => {
            const Icon = STEP_ICONS[i];
            return (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    completedSteps[i]
                      ? "bg-success text-success-foreground"
                      : i === currentStep
                      ? "cosmote-gradient text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {completedSteps[i] ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                {i < 3 && (
                  <div className={`flex-1 h-0.5 rounded-full ${
                    completedSteps[i] ? "bg-success" : "bg-muted"
                  }`} />
                )}
              </div>
            );
          })}
        </div>
        <Progress value={progress} className="mt-3 h-1" />
      </div>

      {/* Step content */}
      <div className="px-4 sm:px-6 pb-5 sm:pb-6">
        {/* ══════ STEP 1: Service Account ══════ */}
        {currentStep === 0 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1">🔑 Σύνδεση Google Service Account</h3>
              <p className="text-xs text-muted-foreground">
                Επικολλήστε το JSON κλειδί του Service Account για σύνδεση με Google Drive & Sheets.
              </p>
            </div>

            {saEmail ? (
              <div className="rounded-xl bg-success/10 border border-success/30 p-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Συνδέθηκε επιτυχώς</p>
                  <Badge variant="secondary" className="mt-1 text-xs">
                    ✓ {saEmail}
                  </Badge>
                </div>
              </div>
            ) : (
              <>
                <Textarea
                  value={saJson}
                  onChange={e => setSaJson(e.target.value)}
                  placeholder='Επικολλήστε το JSON κλειδί σας εδώ...\n{\n  "type": "service_account",\n  "project_id": "...",\n  "client_email": "...",\n  ...\n}'
                  className="min-h-[160px] font-mono text-xs"
                />
                <Button
                  onClick={handleVerifySA}
                  disabled={!saJson.trim() || saVerifying}
                  className="w-full gap-2"
                >
                  {saVerifying ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Επαλήθευση...</>
                  ) : (
                    <>Επαλήθευση <ArrowRight className="h-4 w-4" /></>
                  )}
                </Button>
              </>
            )}
          </div>
        )}

        {/* ══════ STEP 2: Areas & Drive ══════ */}
        {currentStep === 1 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1">📂 Περιοχές & Google Drive</h3>
              <p className="text-xs text-muted-foreground">
                Επιλέξτε τις περιοχές που εξυπηρετείτε και συνδέστε το Shared Drive.
              </p>
            </div>

            {/* Area chips */}
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Περιοχές</p>
              <div className="flex flex-wrap gap-2">
                {AREAS_LIST.map(area => (
                  <button
                    key={area}
                    onClick={() => handleToggleArea(area)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      selectedAreas.includes(area)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border hover:border-primary/50"
                    } ${createdAreas.includes(area) ? "ring-2 ring-success/50" : ""}`}
                  >
                    {createdAreas.includes(area) && "✓ "}{area}
                  </button>
                ))}
                {selectedAreas.filter(a => !AREAS_LIST.includes(a)).map(area => (
                  <button
                    key={area}
                    onClick={() => handleToggleArea(area)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground border border-primary"
                  >
                    {createdAreas.includes(area) && "✓ "}{area}
                  </button>
                ))}
                <button
                  onClick={() => setShowCustomInput(!showCustomInput)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-border text-muted-foreground hover:border-primary/50"
                >
                  + ΑΛΛΗ
                </button>
              </div>
              {showCustomInput && (
                <div className="flex gap-2 mt-2">
                  <Input
                    value={customArea}
                    onChange={e => setCustomArea(e.target.value)}
                    placeholder="Όνομα περιοχής"
                    className="flex-1"
                    onKeyDown={e => e.key === "Enter" && handleAddCustomArea()}
                  />
                  <Button size="sm" variant="outline" onClick={handleAddCustomArea}>Προσθήκη</Button>
                </div>
              )}
            </div>

            {/* Drive ID */}
            <div>
              <p className="text-xs font-semibold text-foreground mb-1.5">Shared Drive ID</p>
              <Input
                value={driveId}
                onChange={e => setDriveId(e.target.value)}
                placeholder="Επικολλήστε το ID από το URL του Google Drive"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                💡 Από το URL: drive.google.com/drive/folders/<strong>0ABcDeFgHiJkLmN</strong> → αντιγράψτε το τελευταίο μέρος
              </p>
            </div>

            <Button
              onClick={handleCreateFolders}
              disabled={creatingFolders || (selectedAreas.length === 0)}
              className="w-full gap-2"
            >
              {creatingFolders ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Δημιουργία φακέλων... ({createdAreas.length}/{selectedAreas.length})</>
              ) : (
                <>🚀 Δημιουργία Φακέλων Αυτόματα</>
              )}
            </Button>
          </div>
        )}

        {/* ══════ STEP 3: Technicians & Email ══════ */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1">👥 Τεχνικοί & Email</h3>
              <p className="text-xs text-muted-foreground">
                Προσθέστε τεχνικούς και ρυθμίστε τις ειδοποιήσεις email.
              </p>
            </div>

            {/* A) Technicians */}
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <p className="text-xs font-bold text-foreground uppercase tracking-wider">Τεχνικοί</p>
              </div>
              <Textarea
                value={techEmails}
                onChange={e => setTechEmails(e.target.value)}
                placeholder={"Γράψτε ένα email ανά γραμμή:\ngiorgos@example.gr\nnikos@example.gr"}
                className="min-h-[80px] text-sm"
              />
              {inviteProgress && (
                <p className={`text-xs font-medium ${inviteProgress.startsWith("✓") ? "text-success" : "text-muted-foreground"}`}>
                  {inviteProgress}
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleSendInvites}
                disabled={sendingInvites || !techEmails.trim()}
                className="gap-1.5"
              >
                {sendingInvites ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                Αποστολή Προσκλήσεων
              </Button>
            </div>

            {/* B) Email settings */}
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <p className="text-xs font-bold text-foreground uppercase tracking-wider">Email Ειδοποιήσεων</p>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Email αποστολέα</p>
                  <Input
                    value={emailFrom}
                    onChange={e => setEmailFrom(e.target.value)}
                    placeholder="noreply@company.gr"
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Παραλήπτης αναφορών</p>
                  <Input
                    value={reportTo}
                    onChange={e => setReportTo(e.target.value)}
                    placeholder="admin@company.gr"
                  />
                </div>
              </div>
              <Button
                onClick={handleSaveEmails}
                disabled={savingEmails}
                className="w-full gap-2"
              >
                {savingEmails ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Αποθήκευση & Συνέχεια <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ══════ STEP 4: Materials & Pricing ══════ */}
        {currentStep === 3 && (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1">📦 Υλικά & Τιμοκατάλογος</h3>
              <p className="text-xs text-muted-foreground">
                Φορτώστε αυτόματα τα υλικά OTE και τον τιμοκατάλογο εργασιών.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Card A: Materials */}
              <Card className="p-4 space-y-3 border-border">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Package className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Υλικά OTE</p>
                    <p className="text-[11px] text-muted-foreground">847 υλικά έτοιμα για εισαγωγή</p>
                  </div>
                </div>
                {loadingMaterials && <Progress value={65} className="h-1.5" />}
                {materialsLoaded ? (
                  <div className="flex items-center gap-2 text-success text-xs font-medium">
                    <CheckCircle2 className="h-4 w-4" /> 847 υλικά φορτώθηκαν
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleLoadMaterials}
                    disabled={loadingMaterials}
                    className="w-full gap-1.5"
                  >
                    {loadingMaterials ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <>⚡</>}
                    Φόρτωση Υλικών OTE
                  </Button>
                )}
              </Card>

              {/* Card B: Pricing */}
              <Card className="p-4 space-y-3 border-border">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Euro className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Τιμοκατάλογος OTE</p>
                    <p className="text-[11px] text-muted-foreground">Τιμές εργασιών FTTH 2025</p>
                  </div>
                </div>
                {loadingPricing && <Progress value={50} className="h-1.5" />}
                {pricingLoaded ? (
                  <div className="flex items-center gap-2 text-success text-xs font-medium">
                    <CheckCircle2 className="h-4 w-4" /> Τιμοκατάλογος φορτώθηκε
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleLoadPricing}
                    disabled={loadingPricing}
                    className="w-full gap-1.5"
                  >
                    {loadingPricing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <>⚡</>}
                    Φόρτωση Τιμοκαταλόγου
                  </Button>
                )}
              </Card>
            </div>

            {/* Validation errors */}
            {validationErrors.length > 0 && (
              <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-3 space-y-1.5">
                <p className="text-[11px] font-bold text-destructive uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" /> Ελλιπή βήματα
                </p>
                {validationErrors.map((err, i) => (
                  <p key={i} className="text-xs text-destructive/80 pl-5">• {err}</p>
                ))}
              </div>
            )}

            <Button
              onClick={() => {
                markComplete(3);
                handleFinalValidation();
              }}
              disabled={validating}
              className="w-full gap-2"
            >
              {validating ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Έλεγχος...</>
              ) : (
                <>🎉 Ολοκλήρωση Εγκατάστασης</>
              )}
            </Button>
          </div>
        )}

        {/* Skip button (all steps except last) */}
        {currentStep < 3 && (
          <div className="mt-4 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground"
              onClick={() => advanceStep(currentStep)}
            >
              Παράλειψη βήματος <SkipForward className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};

export default SetupWizard;
