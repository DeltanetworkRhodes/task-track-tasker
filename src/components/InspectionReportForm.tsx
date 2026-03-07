import { useState, useRef, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, ChevronRight, Save, Loader2, CheckCircle, Eraser, FileText } from "lucide-react";

interface Props {
  assignment: any;
  surveyId?: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

const STEPS = [
  { label: "Στοιχεία Πελάτη", icon: "👤" },
  { label: "Τεχνική Περιγραφή", icon: "🔧" },
  { label: "Υπεύθυνη Δήλωση", icon: "📋" },
  { label: "BCP / BEP / BMO", icon: "📦" },
];

const FLOOR_OPTIONS = [
  "ΥΠΟΓΕΙΟ", "ΗΜΙΥΠΟΓΕΙΟ", "ΙΣΟΓΕΙΟ", "ΗΜΙΟΡΟΦΟΣ",
  "1ΟΣ ΟΡΟΦΟΣ", "2ΟΣ ΟΡΟΦΟΣ", "3ΟΣ ΟΡΟΦΟΣ", "4ΟΣ ΟΡΟΦΟΣ",
  "5ΟΣ ΟΡΟΦΟΣ", "6ΟΣ ΟΡΟΦΟΣ", "7ΟΣ ΟΡΟΦΟΣ", "8ΟΣ ΟΡΟΦΟΣ",
];

const InspectionReportForm = ({ assignment, surveyId, onComplete, onCancel }: Props) => {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Signature refs
  const engineerSigRef = useRef<SignatureCanvas>(null);
  const customerSigRef = useRef<SignatureCanvas>(null);
  const managerSigRef = useRef<SignatureCanvas>(null);
  const declarationSigRef = useRef<SignatureCanvas>(null);

  // Form state
  const [form, setForm] = useState({
    // Page 1
    customer_name: assignment?.customer_name || "",
    customer_father_name: "",
    customer_mobile: assignment?.phone || "",
    customer_phone: "",
    customer_email: "",
    customer_street: assignment?.address || "",
    customer_number: "",
    customer_postal_code: "",
    customer_floor: "",
    customer_apartment_code: "",
    customer_county: "",
    customer_municipality: "",
    customer_notes: "",
    manager_name: "",
    manager_mobile: "",
    manager_email: "",
    service_address: "",
    service_phone: "",
    service_email: "",
    technician_name: "",
    // Page 2
    routing_escalit: false,
    routing_external_pipe: false,
    routing_aerial: false,
    routing_other: "",
    routing_aerial_notes: "",
    routing_other_notes: "",
    sidewalk_excavation: null as boolean | null,
    entry_pipe_notes: "",
    ext_pipe_sidewalk_excavation: null as boolean | null,
    excavation_to_pipe: null as boolean | null,
    excavation_to_rg: null as boolean | null,
    pipe_placement: false,
    wall_mount: false,
    fence_building_mount: false,
    excavation_to_building: false,
    bep_position: [] as string[],
    vertical_routing: "",
    vertical_routing_other_notes: "",
    sketch_notes: "",
    optical_socket_position: "",
    // Signatures (stored in form state to survive step navigation)
    engineer_signature: "",
    customer_signature: "",
    manager_signature: "",
    // Page 3
    declaration_type: "approve",
    declarant_name: "",
    declarant_id_number: "",
    declarant_city: "",
    declarant_street: "",
    declarant_number: "",
    declarant_postal_code: "",
    declaration_date: new Date().toISOString().split("T")[0],
    cost_option: "ote_covers",
    declaration_signature: "",
    // Page 4
    building_id: "",
    building_address: assignment?.address || "",
    customer_floor_select: "",
    total_apartments: 0,
    total_shops: 0,
    total_spaces: 0,
    total_floors: 0,
    cabinet: assignment?.cab || "",
    pipe_code: "",
    bcp_brand: "",
    bcp_size: "",
    bcp_floorbox: false,
    bcp_drop_4: false,
    bcp_drop_6: false,
    bcp_drop_12: false,
    bep_brand: "",
    bep_size: "",
    bep_capacity: "",
    bmo_brand: "",
    bmo_size: "",
    bmo_capacity: "",
  });

  // Fetch existing report
  const { data: existingReport } = useQuery({
    queryKey: ["inspection-report", assignment?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("inspection_reports" as any)
        .select("*")
        .eq("assignment_id", assignment.id)
        .maybeSingle();
      return data;
    },
    enabled: !!assignment?.id,
  });

  // Fetch technician profile
  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone, email")
        .eq("user_id", user!.id)
        .single();
      return data;
    },
    enabled: !!user,
  });

  // Load existing report data
  useEffect(() => {
    if (existingReport) {
      const r = existingReport as any;
      const merged = Object.fromEntries(
        Object.entries(r).filter(([k]) => k in form)
      );
      // Convert bep_position from comma-separated string to array
      if (merged.bep_position && typeof merged.bep_position === "string") {
        merged.bep_position = merged.bep_position.split(",").map((v: string) => v.trim()).filter(Boolean);
      }
      setForm((prev) => ({ ...prev, ...merged }));
    }
  }, [existingReport]);

  // Pre-fill technician name
  useEffect(() => {
    if (profile && !form.technician_name) {
      setForm((prev) => ({ ...prev, technician_name: profile.full_name || "" }));
    }
  }, [profile]);

  const updateField = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Capture signatures from canvas refs into form state (called before leaving a step)
  const captureSignaturesFromCanvas = () => {
    const updates: Record<string, string> = {};
    if (engineerSigRef.current && !engineerSigRef.current.isEmpty()) {
      updates.engineer_signature = engineerSigRef.current.toDataURL("image/png");
    }
    if (customerSigRef.current && !customerSigRef.current.isEmpty()) {
      updates.customer_signature = customerSigRef.current.toDataURL("image/png");
    }
    if (managerSigRef.current && !managerSigRef.current.isEmpty()) {
      updates.manager_signature = managerSigRef.current.toDataURL("image/png");
    }
    if (declarationSigRef.current && !declarationSigRef.current.isEmpty()) {
      updates.declaration_signature = declarationSigRef.current.toDataURL("image/png");
    }
    if (Object.keys(updates).length > 0) {
      setForm((prev) => ({ ...prev, ...updates }));
    }
    return updates;
  };

  // Navigate between steps, capturing signatures before leaving
  const navigateToStep = (targetStep: number) => {
    captureSignaturesFromCanvas();
    setStep(targetStep);
  };

  // Restore saved signatures to canvases when returning to a step
  useEffect(() => {
    const restoreSignature = (ref: React.RefObject<SignatureCanvas>, dataUrl: string) => {
      if (ref.current && dataUrl && dataUrl.startsWith("data:image/png;base64,")) {
        // Small delay to ensure canvas is mounted
        setTimeout(() => {
          if (ref.current) {
            ref.current.clear();
            ref.current.fromDataURL(dataUrl, { ratio: 1 });
          }
        }, 100);
      }
    };
    if (step === 1) {
      restoreSignature(engineerSigRef, form.engineer_signature);
      restoreSignature(customerSigRef, form.customer_signature);
      restoreSignature(managerSigRef, form.manager_signature);
    }
    if (step === 2) {
      restoreSignature(declarationSigRef, form.declaration_signature);
    }
  }, [step]);

  const handleSave = async (final = false) => {
    if (!user || !assignment) return;
    
    if (final) {
      setSubmitting(true);
    } else {
      setSaving(true);
    }

    try {
      // Capture any signatures still on screen before saving
      const freshSigs = captureSignaturesFromCanvas();
      const payload: any = {
        ...form,
        ...freshSigs,
        survey_id: surveyId || null,
        assignment_id: assignment.id,
        organization_id: organizationId || null,
        technician_id: user.id,
        sr_id: assignment.sr_id,
      };
      // Convert bep_position array to comma-separated string for DB
      if (Array.isArray(payload.bep_position)) {
        payload.bep_position = payload.bep_position.join(",");
      }
      // Remove fields not in DB
      delete payload.declaration_type;

      if (existingReport) {
        const { error } = await supabase
          .from("inspection_reports" as any)
          .update(payload)
          .eq("id", (existingReport as any).id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("inspection_reports" as any)
          .insert(payload);
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["inspection-report"] });

      if (final) {
        // Generate PDF via edge function
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData?.session?.access_token;
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/generate-inspection-pdf`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                assignment_id: assignment.id,
                sr_id: assignment.sr_id,
                area: assignment.area,
              }),
            }
          );
          const result = await response.json();
          if (response.ok && result.success) {
            if (result.drive_url) {
              toast.success("Το δελτίο αυτοψίας δημιουργήθηκε και ανέβηκε στο Drive! ✅");
            } else {
              toast.warning("Το δελτίο δημιουργήθηκε, αλλά δεν βρέθηκε φάκελος Drive για ανέβασμα");
            }
          } else {
            toast.warning("Το δελτίο αποθηκεύτηκε αλλά η δημιουργία PDF απέτυχε");
          }
        } catch {
          toast.warning("Αποθηκεύτηκε αλλά η δημιουργία PDF δεν ήταν δυνατή");
        }
        onComplete?.();
      } else {
        toast.success("Αποθηκεύτηκε προσωρινά");
      }
    } catch (err: any) {
      toast.error("Σφάλμα: " + (err.message || "Δοκιμάστε ξανά"));
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  const SignaturePad = ({ 
    sigRef, 
    label 
  }: { 
    sigRef: React.RefObject<SignatureCanvas>; 
    label: string;
  }) => (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{label}</Label>
      <div className="border-2 border-dashed border-border rounded-lg bg-card overflow-hidden">
        <SignatureCanvas
          ref={sigRef}
          penColor="#1a2332"
          canvasProps={{
            className: "w-full",
            style: { width: "100%", height: "150px" },
          }}
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => sigRef.current?.clear()}
        className="gap-1 text-muted-foreground"
      >
        <Eraser className="h-3 w-3" /> Καθαρισμός
      </Button>
    </div>
  );

  // ─── STEP 1: Customer Info ───
  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-foreground mb-4">📍 Στοιχεία Πελάτη</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs">Ονοματεπώνυμο / Επωνυμία</Label>
            <Input value={form.customer_name} onChange={(e) => updateField("customer_name", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Όνομα Πατρός</Label>
            <Input value={form.customer_father_name} onChange={(e) => updateField("customer_father_name", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Τηλέφωνο (κινητό)</Label>
            <Input value={form.customer_mobile} onChange={(e) => updateField("customer_mobile", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Τηλέφωνο (σταθερό)</Label>
            <Input value={form.customer_phone} onChange={(e) => updateField("customer_phone", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input value={form.customer_email} onChange={(e) => updateField("customer_email", e.target.value)} />
          </div>
          <div className="sm:col-span-2 grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">Οδός</Label>
              <Input value={form.customer_street} onChange={(e) => updateField("customer_street", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Αριθ.</Label>
              <Input value={form.customer_number} onChange={(e) => updateField("customer_number", e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Τ.Κ.</Label>
            <Input value={form.customer_postal_code} onChange={(e) => updateField("customer_postal_code", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Όροφος</Label>
            <Input value={form.customer_floor} onChange={(e) => updateField("customer_floor", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Κωδ. Διαμ/τος</Label>
            <Input value={form.customer_apartment_code} onChange={(e) => updateField("customer_apartment_code", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Νομός</Label>
            <Input value={form.customer_county} onChange={(e) => updateField("customer_county", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Δήμος</Label>
            <Input value={form.customer_municipality} onChange={(e) => updateField("customer_municipality", e.target.value)} />
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-base font-bold text-foreground mb-4">📝 Παρατηρήσεις</h3>
        <Textarea
          value={form.customer_notes}
          onChange={(e) => updateField("customer_notes", e.target.value)}
          placeholder="Σημειώσεις..."
          rows={3}
        />
      </div>

      <Separator />

      <div>
        <h3 className="text-base font-bold text-foreground mb-4">🏢 Στοιχεία Διαχειριστή</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs">Ονοματεπώνυμο</Label>
            <Input value={form.manager_name} onChange={(e) => updateField("manager_name", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Τηλέφωνο (κινητό)</Label>
            <Input value={form.manager_mobile} onChange={(e) => updateField("manager_mobile", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input value={form.manager_email} onChange={(e) => updateField("manager_email", e.target.value)} />
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-base font-bold text-foreground mb-4">🛠️ Τεχνική Υπηρεσία</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs">Διεύθυνση αλληλογραφίας</Label>
            <Input value={form.service_address} onChange={(e) => updateField("service_address", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Τηλέφωνο (σταθερό)</Label>
            <Input value={form.service_phone} onChange={(e) => updateField("service_phone", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input value={form.service_email} onChange={(e) => updateField("service_email", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Τεχνικός που επιτέλεσε την αυτοψία</Label>
            <Input value={form.technician_name} onChange={(e) => updateField("technician_name", e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );

  // ─── STEP 2: Technical Description ───
  const renderStep2 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-foreground mb-4">1. Όδευση μέχρι τον Β.Ε.Ρ.</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { field: "routing_escalit", label: "Εσκαλίτ (Εισαγωγή χαλκού)" },
            { field: "routing_external_pipe", label: "Εξωτερική με σιδηροσωλήνα" },
            { field: "routing_aerial", label: "Εναέριο" },
          ].map(({ field, label }) => (
            <label key={field} className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card cursor-pointer hover:border-primary/40 transition-colors">
              <Checkbox
                checked={(form as any)[field]}
                onCheckedChange={(v) => updateField(field, v)}
              />
              <span className="text-xs font-medium">{label}</span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <Label className="text-xs">Σημειώσεις Εναέριας</Label>
            <Input value={form.routing_aerial_notes} onChange={(e) => updateField("routing_aerial_notes", e.target.value)} placeholder="Σημειώσεις..." />
          </div>
          <div>
            <Label className="text-xs">Σημειώσεις Άλλου τρόπου</Label>
            <Input value={form.routing_other_notes} onChange={(e) => updateField("routing_other_notes", e.target.value)} placeholder="Σημειώσεις..." />
          </div>
        </div>
        <div className="mt-3">
          <Label className="text-xs">Άλλος τρόπος</Label>
          <Input value={form.routing_other} onChange={(e) => updateField("routing_other", e.target.value)} />
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div>
            <Label className="text-xs mb-2 block">Εκσκαφή πεζοδρ. έως σωλήνα εισαγωγής</Label>
            <RadioGroup value={form.excavation_to_pipe === null ? "" : form.excavation_to_pipe ? "yes" : "no"} onValueChange={(v) => updateField("excavation_to_pipe", v === "yes")}>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5"><RadioGroupItem value="yes" /><span className="text-xs">ΝΑΙ</span></label>
                <label className="flex items-center gap-1.5"><RadioGroupItem value="no" /><span className="text-xs">ΌΧΙ</span></label>
              </div>
            </RadioGroup>
          </div>
          <div>
            <Label className="text-xs mb-2 block">Εκσκαφή πεζοδρ. έως ΡΓ</Label>
            <RadioGroup value={form.excavation_to_rg === null ? "" : form.excavation_to_rg ? "yes" : "no"} onValueChange={(v) => updateField("excavation_to_rg", v === "yes")}>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5"><RadioGroupItem value="yes" /><span className="text-xs">ΝΑΙ</span></label>
                <label className="flex items-center gap-1.5"><RadioGroupItem value="no" /><span className="text-xs">ΌΧΙ</span></label>
              </div>
            </RadioGroup>
          </div>
          <div>
            <Label className="text-xs mb-2 block">Εκσκαφή πεζοδρ. (γενική)</Label>
            <RadioGroup value={form.sidewalk_excavation === null ? "" : form.sidewalk_excavation ? "yes" : "no"} onValueChange={(v) => updateField("sidewalk_excavation", v === "yes")}>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5"><RadioGroupItem value="yes" /><span className="text-xs">ΝΑΙ</span></label>
                <label className="flex items-center gap-1.5"><RadioGroupItem value="no" /><span className="text-xs">ΌΧΙ</span></label>
              </div>
            </RadioGroup>
          </div>
          <div>
            <Label className="text-xs mb-2 block">Εκσκαφή πεζοδρ. (εξωτ. σιδηροσωλήνα)</Label>
            <RadioGroup value={form.ext_pipe_sidewalk_excavation === null ? "" : form.ext_pipe_sidewalk_excavation ? "yes" : "no"} onValueChange={(v) => updateField("ext_pipe_sidewalk_excavation", v === "yes")}>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5"><RadioGroupItem value="yes" /><span className="text-xs">ΝΑΙ</span></label>
                <label className="flex items-center gap-1.5"><RadioGroupItem value="no" /><span className="text-xs">ΌΧΙ</span></label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <div className="mt-3">
          <Label className="text-xs">Σημειώσεις έως σωλήνα εισαγωγής</Label>
          <Input value={form.entry_pipe_notes} onChange={(e) => updateField("entry_pipe_notes", e.target.value)} placeholder="Σημειώσεις..." />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          {[
            { field: "pipe_placement", label: "Τοποθέτηση Σιδηροσωλήνα" },
            { field: "wall_mount", label: "Στήριξη επί τοιχοποιίας" },
            { field: "fence_building_mount", label: "Περίφραξης ή/και κτιρίου" },
            { field: "excavation_to_building", label: "Εκσκαφή έως κτίριο" },
          ].map(({ field, label }) => (
            <label key={field} className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card cursor-pointer hover:border-primary/40 transition-colors">
              <Checkbox
                checked={(form as any)[field]}
                onCheckedChange={(v) => updateField(field, v)}
              />
              <span className="text-xs font-medium">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-base font-bold text-foreground mb-4">2. Θέση Β.Ε.Ρ. (πολλαπλή επιλογή)</h3>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {[
            { value: "internal", label: "Εσωτερικά" },
            { value: "external", label: "Εξωτερικά" },
            { value: "fence", label: "Στην περίφραξη" },
            { value: "building", label: "Στο κτίριο" },
            { value: "pillar", label: "PILAR" },
            { value: "pole", label: "Επί στύλου" },
            { value: "basement", label: "Υπόγειο" },
            { value: "rooftop", label: "Ταράτσα" },
            { value: "ground", label: "Ισόγειο" },
            { value: "piloti", label: "Πυλωτή" },
          ].map(({ value, label }) => {
            const selected = Array.isArray(form.bep_position) ? form.bep_position.includes(value) : form.bep_position === value;
            return (
              <label
                key={value}
                className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-xs font-medium transition-colors ${
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={(checked) => {
                    const current = Array.isArray(form.bep_position) ? form.bep_position : (form.bep_position ? [form.bep_position] : []);
                    if (checked) {
                      updateField("bep_position", [...current, value]);
                    } else {
                      updateField("bep_position", current.filter((v: string) => v !== value));
                    }
                  }}
                />
                {label}
              </label>
            );
          })}
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-base font-bold text-foreground mb-4">3. Κατακόρυφη Όδευση</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { value: "shaft", label: "Φρεάτιο" },
            { value: "staircase", label: "Κλιμακοστάσιο" },
            { value: "lightwell", label: "Φωταγωγός" },
            { value: "elevator", label: "Ανελκυστήρα" },
            { value: "lantern", label: "Φανάρι σκάλας" },
            { value: "other", label: "Άλλο" },
          ].map(({ value, label }) => (
            <label
              key={value}
              className={`flex items-center justify-center p-2.5 rounded-lg border cursor-pointer text-xs font-medium text-center transition-colors ${
                form.vertical_routing === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <input type="radio" className="sr-only" checked={form.vertical_routing === value} onChange={() => updateField("vertical_routing", value)} />
              {label}
            </label>
          ))}
        </div>
        {form.vertical_routing === "other" && (
          <div className="mt-3">
            <Label className="text-xs">Σημειώσεις (Άλλο)</Label>
            <Input value={form.vertical_routing_other_notes} onChange={(e) => updateField("vertical_routing_other_notes", e.target.value)} placeholder="Περιγράψτε..." />
          </div>
        )}
      </div>

      <Separator />

      <div>
        <h3 className="text-base font-bold text-foreground mb-4">📝 Σκαρίφημα & Παρατηρήσεις</h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Παρατηρήσεις - Περιγραφή</Label>
            <Textarea value={form.sketch_notes} onChange={(e) => updateField("sketch_notes", e.target.value)} rows={3} />
          </div>
          <div>
            <Label className="text-xs">Θέση Οπτικής Πρίζας</Label>
            <Input value={form.optical_socket_position} onChange={(e) => updateField("optical_socket_position", e.target.value)} />
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <h3 className="text-base font-bold text-foreground">✍️ Υπογραφές</h3>
        <SignaturePad sigRef={engineerSigRef} label="Υπογραφή Μηχανικού" />
        <SignaturePad sigRef={customerSigRef} label="Υπογραφή Πελάτη" />
        <SignaturePad sigRef={managerSigRef} label="Υπογραφή Διαχειριστή" />
      </div>
    </div>
  );

  // ─── STEP 3: Responsible Declaration ───
  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
        <h3 className="text-base font-bold text-foreground mb-2">📋 Υπεύθυνη Δήλωση Διαχειριστή / Εκπροσώπου</h3>
        <p className="text-xs text-muted-foreground">Υπογράφεται υποχρεωτικά μόνο ΜΙΑ από τις ΔΥΟ ΕΠΙΛΟΓΕΣ</p>
      </div>

      <RadioGroup value={form.declaration_type} onValueChange={(v) => updateField("declaration_type", v)}>
        <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${form.declaration_type === "approve" ? "border-primary bg-primary/5" : "border-border"}`}>
          <RadioGroupItem value="approve" className="mt-0.5" />
          <div>
            <p className="text-sm font-bold text-foreground">ΕΠΙΛΟΓΗ (Α) – ΕΓΚΡΙΝΩ ΑΜΕΣΗ ΕΝΑΡΞΗ ΕΡΓΑΣΙΩΝ</p>
            <p className="text-xs text-muted-foreground mt-1">Δηλώνω ότι έλαβα γνώση της Έκθεσης και εγκρίνω την άμεση έναρξη εργασιών.</p>
          </div>
        </label>
        <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${form.declaration_type === "reject" ? "border-destructive bg-destructive/5" : "border-border"}`}>
          <RadioGroupItem value="reject" className="mt-0.5" />
          <div>
            <p className="text-sm font-bold text-foreground">ΕΠΙΛΟΓΗ (Β) – ΔΕΝ ΕΓΚΡΙΝΩ</p>
            <p className="text-xs text-muted-foreground mt-1">Δεν εγκρίνω την έναρξη εργασιών.</p>
          </div>
        </label>
      </RadioGroup>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label className="text-xs">Ονοματεπώνυμο</Label>
          <Input value={form.declarant_name} onChange={(e) => updateField("declarant_name", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">ΑΔΤ</Label>
          <Input value={form.declarant_id_number} onChange={(e) => updateField("declarant_id_number", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Πόλη</Label>
          <Input value={form.declarant_city} onChange={(e) => updateField("declarant_city", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Οδός</Label>
          <Input value={form.declarant_street} onChange={(e) => updateField("declarant_street", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Αρ.</Label>
          <Input value={form.declarant_number} onChange={(e) => updateField("declarant_number", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Τ.Κ.</Label>
          <Input value={form.declarant_postal_code} onChange={(e) => updateField("declarant_postal_code", e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Ημερομηνία</Label>
          <Input type="date" value={form.declaration_date} onChange={(e) => updateField("declaration_date", e.target.value)} />
        </div>
      </div>

      <div>
        <Label className="text-xs mb-2 block">Κόστος εργασιών</Label>
        <RadioGroup value={form.cost_option} onValueChange={(v) => updateField("cost_option", v)}>
          <label className="flex items-center gap-2"><RadioGroupItem value="ote_covers" /><span className="text-xs">Επιβαρύνει αποκλειστικά την ΟΤΕ Α.Ε.</span></label>
          <label className="flex items-center gap-2"><RadioGroupItem value="not_ote" /><span className="text-xs">Δεν επιβαρύνει την ΟΤΕ Α.Ε.</span></label>
        </RadioGroup>
      </div>

      <SignaturePad sigRef={declarationSigRef} label="Υπογραφή Διαχειριστή / Εκπροσώπου" />
    </div>
  );

  // ─── STEP 4: BCP / BEP / BMO ───
  const renderStep4 = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-foreground mb-4">🏠 Στοιχεία Κτιρίου</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label className="text-xs">Διεύθυνση</Label>
            <Input value={form.building_address} onChange={(e) => updateField("building_address", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Building ID</Label>
            <Input value={form.building_id} onChange={(e) => updateField("building_id", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Όροφος πελάτη</Label>
            <Select value={form.customer_floor_select} onValueChange={(v) => updateField("customer_floor_select", v)}>
              <SelectTrigger><SelectValue placeholder="Επιλογή" /></SelectTrigger>
              <SelectContent>
                {FLOOR_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">SR ID</Label>
            <Input value={assignment?.sr_id || ""} disabled className="bg-muted" />
          </div>
          <div>
            <Label className="text-xs">Καμπίνα</Label>
            <Input value={form.cabinet} onChange={(e) => updateField("cabinet", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Σωληνίσκος</Label>
            <Input value={form.pipe_code} onChange={(e) => updateField("pipe_code", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div>
            <Label className="text-xs">Σύνολο Διαμερισμάτων</Label>
            <Input type="number" value={form.total_apartments} onChange={(e) => updateField("total_apartments", parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <Label className="text-xs">Σύνολο Καταστημάτων</Label>
            <Input type="number" value={form.total_shops} onChange={(e) => updateField("total_shops", parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <Label className="text-xs">Σύνολο Χώρων</Label>
            <Input type="number" value={form.total_spaces} onChange={(e) => updateField("total_spaces", parseInt(e.target.value) || 0)} />
          </div>
          <div>
            <Label className="text-xs">Σύνολο Ορόφων</Label>
            <Input type="number" value={form.total_floors} onChange={(e) => updateField("total_floors", parseInt(e.target.value) || 0)} />
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-base font-bold text-foreground mb-4">📦 BCP</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Κατασκευαστής</Label>
            <RadioGroup value={form.bcp_brand} onValueChange={(v) => updateField("bcp_brand", v)}>
              <label className="flex items-center gap-2"><RadioGroupItem value="raycap" /><span className="text-xs">RAYCAP</span></label>
              <label className="flex items-center gap-2"><RadioGroupItem value="ztt" /><span className="text-xs">ZTT</span></label>
            </RadioGroup>
          </div>
          <div>
            <Label className="text-xs">Μέγεθος</Label>
            <RadioGroup value={form.bcp_size} onValueChange={(v) => updateField("bcp_size", v)}>
              <label className="flex items-center gap-2"><RadioGroupItem value="small" /><span className="text-xs">SMALL</span></label>
              <label className="flex items-center gap-2"><RadioGroupItem value="medium" /><span className="text-xs">MEDIUM</span></label>
            </RadioGroup>
          </div>
        </div>
        <div className="flex gap-4 mt-3 flex-wrap">
          <label className="flex items-center gap-2">
            <Checkbox checked={form.bcp_floorbox} onCheckedChange={(v) => updateField("bcp_floorbox", v)} />
            <span className="text-xs">Floorbox</span>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={form.bcp_drop_4} onCheckedChange={(v) => updateField("bcp_drop_4", v)} />
            <span className="text-xs">Drop 4</span>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={form.bcp_drop_6} onCheckedChange={(v) => updateField("bcp_drop_6", v)} />
            <span className="text-xs">Drop 6</span>
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={form.bcp_drop_12} onCheckedChange={(v) => updateField("bcp_drop_12", v)} />
            <span className="text-xs">Drop 12</span>
          </label>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-base font-bold text-foreground mb-4">📦 BEP</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Κατασκευαστής</Label>
            <RadioGroup value={form.bep_brand} onValueChange={(v) => updateField("bep_brand", v)}>
              <label className="flex items-center gap-2"><RadioGroupItem value="raycap" /><span className="text-xs">RAYCAP</span></label>
              <label className="flex items-center gap-2"><RadioGroupItem value="ztt" /><span className="text-xs">ZTT</span></label>
            </RadioGroup>
          </div>
          <div>
            <Label className="text-xs">Μέγεθος</Label>
            <Select value={form.bep_size} onValueChange={(v) => updateField("bep_size", v)}>
              <SelectTrigger><SelectValue placeholder="Μέγεθος" /></SelectTrigger>
              <SelectContent>
                {["SMALL", "MEDIUM", "LARGE", "XLARGE"].map((s) => <SelectItem key={s} value={s.toLowerCase()}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Χωρητικότητα</Label>
            <Input value={form.bep_capacity} onChange={(e) => updateField("bep_capacity", e.target.value)} />
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-base font-bold text-foreground mb-4">📦 BMO</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Κατασκευαστής</Label>
            <RadioGroup value={form.bmo_brand} onValueChange={(v) => updateField("bmo_brand", v)}>
              <label className="flex items-center gap-2"><RadioGroupItem value="raycap" /><span className="text-xs">RAYCAP</span></label>
              <label className="flex items-center gap-2"><RadioGroupItem value="ztt" /><span className="text-xs">ZTT</span></label>
            </RadioGroup>
          </div>
          <div>
            <Label className="text-xs">Μέγεθος</Label>
            <Select value={form.bmo_size} onValueChange={(v) => updateField("bmo_size", v)}>
              <SelectTrigger><SelectValue placeholder="Μέγεθος" /></SelectTrigger>
              <SelectContent>
                {["SMALL", "MEDIUM", "LARGE"].map((s) => <SelectItem key={s} value={s.toLowerCase()}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Χωρητικότητα</Label>
            <Input value={form.bmo_capacity} onChange={(e) => updateField("bmo_capacity", e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 0: return renderStep1();
      case 1: return renderStep2();
      case 2: return renderStep3();
      case 3: return renderStep4();
      default: return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with SR info */}
      <div className="flex items-center justify-between px-1 pb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Δελτίο Αυτοψίας
          </h2>
          <p className="text-xs text-muted-foreground">SR: {assignment?.sr_id} · {assignment?.area}</p>
        </div>
        {existingReport && (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle className="h-3 w-3" /> Αποθηκευμένο
          </Badge>
        )}
      </div>

      {/* Step indicator */}
      <div className="flex gap-1 mb-4">
         {STEPS.map((s, i) => (
          <button
            key={i}
            onClick={() => navigateToStep(i)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-colors text-center ${
              i === step
                ? "bg-primary/10 border border-primary/30"
                : i < step
                ? "bg-accent/10 border border-accent/20"
                : "bg-muted border border-transparent"
            }`}
          >
            <span className="text-sm">{s.icon}</span>
            <span className="text-[10px] font-medium leading-tight">{s.label}</span>
          </button>
        ))}
      </div>

      {/* Form content */}
      <div className="flex-1 overflow-y-auto pb-4">
        {renderCurrentStep()}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2 pt-4 border-t border-border">
        {step > 0 && (
          <Button variant="outline" size="sm" onClick={() => navigateToStep(step - 1)} className="gap-1">
            <ChevronLeft className="h-4 w-4" /> Πίσω
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => handleSave(false)} disabled={saving} className="gap-1 ml-auto">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Αποθήκευση
        </Button>
        {step < STEPS.length - 1 ? (
          <Button size="sm" onClick={() => navigateToStep(step + 1)} className="gap-1">
            Επόμενο <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" onClick={() => handleSave(true)} disabled={submitting} className="gap-1 bg-accent hover:bg-accent/90">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
            Ολοκλήρωση & PDF
          </Button>
        )}
      </div>
    </div>
  );
};

export default InspectionReportForm;
