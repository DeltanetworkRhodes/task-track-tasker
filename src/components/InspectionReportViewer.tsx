import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText, User, Wrench, ClipboardList, Package, Loader2 } from "lucide-react";

interface Props {
  assignmentId: string;
  srId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const Field = ({ label, value }: { label: string; value: any }) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Badge variant={value ? "default" : "outline"} className="text-[10px]">
          {value ? "Ναι" : "Όχι"}
        </Badge>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between py-1 gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-medium text-right">{String(value)}</span>
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <h4 className="text-xs font-bold text-foreground uppercase tracking-wide">{title}</h4>
    <div className="bg-muted/30 rounded-lg p-3 space-y-0.5">{children}</div>
  </div>
);

const SignaturePreview = ({ label, data }: { label: string; data: string | null }) => {
  if (!data) return null;
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="bg-background border rounded-lg p-2 flex items-center justify-center">
        <img src={data} alt={label} className="max-h-16 object-contain" />
      </div>
    </div>
  );
};

const InspectionReportViewer = ({ assignmentId, srId, open, onOpenChange }: Props) => {
  const [activeTab, setActiveTab] = useState("form");

  const { data: report, isLoading } = useQuery({
    queryKey: ["inspection-report-view", assignmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("inspection_reports")
        .select("*")
        .eq("assignment_id", assignmentId)
        .maybeSingle();
      return data;
    },
    enabled: open && !!assignmentId,
  });

  const r = report as any;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-primary" />
            Δελτίο Αυτοψίας — {srId}
            {r?.pdf_generated && (
              <Badge variant="default" className="text-[10px] ml-2">PDF ✓</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !r ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            Δεν έχει συμπληρωθεί δελτίο αυτοψίας για αυτό το SR.
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="form" className="gap-1.5 text-xs">
                <ClipboardList className="h-3.5 w-3.5" />
                Δεδομένα
              </TabsTrigger>
              <TabsTrigger value="pdf" className="gap-1.5 text-xs" disabled={!r.pdf_drive_url}>
                <FileText className="h-3.5 w-3.5" />
                PDF
              </TabsTrigger>
            </TabsList>

            <TabsContent value="form" className="flex-1 overflow-y-auto mt-3 space-y-4 pr-1">
              {/* Page 1 - Customer Info */}
              <div className="flex items-center gap-2 text-sm font-bold">
                <User className="h-4 w-4 text-primary" />
                Σελ. 1 — Στοιχεία Πελάτη
              </div>
              <Section title="Πελάτης">
                <Field label="Ονοματεπώνυμο" value={r.customer_name} />
                <Field label="Πατρώνυμο" value={r.customer_father_name} />
                <Field label="Κινητό" value={r.customer_mobile} />
                <Field label="Τηλέφωνο" value={r.customer_phone} />
                <Field label="Email" value={r.customer_email} />
                <Field label="Οδός" value={r.customer_street} />
                <Field label="Αριθμός" value={r.customer_number} />
                <Field label="Τ.Κ." value={r.customer_postal_code} />
                <Field label="Όροφος" value={r.customer_floor} />
                <Field label="Κωδ. Διαμερίσματος" value={r.customer_apartment_code} />
                <Field label="Νομός" value={r.customer_county} />
                <Field label="Δήμος" value={r.customer_municipality} />
                <Field label="Σημειώσεις" value={r.customer_notes} />
              </Section>
              <Section title="Διαχειριστής">
                <Field label="Ονοματεπώνυμο" value={r.manager_name} />
                <Field label="Κινητό" value={r.manager_mobile} />
                <Field label="Email" value={r.manager_email} />
              </Section>
              <Section title="Στοιχεία Παροχής">
                <Field label="Διεύθυνση" value={r.service_address} />
                <Field label="Τηλέφωνο" value={r.service_phone} />
                <Field label="Email" value={r.service_email} />
                <Field label="Τεχνικός" value={r.technician_name} />
              </Section>
              <SignaturePreview label="Υπογραφή Μηχανικού" data={r.engineer_signature} />
              <SignaturePreview label="Υπογραφή Πελάτη" data={r.customer_signature} />
              <SignaturePreview label="Υπογραφή Διαχειριστή" data={r.manager_signature} />

              <Separator />

              {/* Page 2 - Technical */}
              <div className="flex items-center gap-2 text-sm font-bold">
                <Wrench className="h-4 w-4 text-primary" />
                Σελ. 2 — Τεχνική Περιγραφή
              </div>
              <Section title="Δρομολόγηση">
                <Field label="Εσκαλίτ" value={r.routing_escalit} />
                <Field label="Εξωτ. Σωλήνα" value={r.routing_external_pipe} />
                <Field label="Εναέρια" value={r.routing_aerial} />
                <Field label="Άλλο" value={r.routing_other} />
              </Section>
              <Section title="Εκσκαφές">
                <Field label="Προς σωλήνα" value={r.excavation_to_pipe} />
                <Field label="Προς RG" value={r.excavation_to_rg} />
                <Field label="Προς κτίριο" value={r.excavation_to_building} />
              </Section>
              <Section title="Τοποθετήσεις">
                <Field label="Τοποθέτηση σωλήνα" value={r.pipe_placement} />
                <Field label="Βάση τοίχου" value={r.wall_mount} />
                <Field label="Βάση περίφραξης/κτιρίου" value={r.fence_building_mount} />
              </Section>
              <Section title="Θέση BEP & Κατακόρυφη δρομολόγηση">
                <Field label="Θέση BEP" value={r.bep_position} />
                <Field label="Κατακόρυφη δρομολόγηση" value={r.vertical_routing} />
                <Field label="Θέση οπτικής πρίζας" value={r.optical_socket_position} />
                <Field label="Σημειώσεις σκίτσου" value={r.sketch_notes} />
              </Section>

              <Separator />

              {/* Page 3 - Declaration */}
              <div className="flex items-center gap-2 text-sm font-bold">
                <ClipboardList className="h-4 w-4 text-primary" />
                Σελ. 3 — Υπεύθυνη Δήλωση
              </div>
              <Section title="Δήλωση">
                <Field label="Τύπος" value={r.declaration_type === "approve" ? "Εγκρίνω" : r.declaration_type === "reject" ? "Απορρίπτω" : r.declaration_type} />
                <Field label="Ονοματεπώνυμο" value={r.declarant_name} />
                <Field label="Αρ. Ταυτότητας" value={r.declarant_id_number} />
                <Field label="Πόλη" value={r.declarant_city} />
                <Field label="Οδός" value={r.declarant_street} />
                <Field label="Αριθμός" value={r.declarant_number} />
                <Field label="Τ.Κ." value={r.declarant_postal_code} />
                <Field label="Ημερομηνία" value={r.declaration_date} />
                <Field label="Κόστος" value={r.cost_option === "ote_covers" ? "Καλύπτεται από ΟΤΕ" : r.cost_option === "customer_pays" ? "Επιβαρύνεται ο πελάτης" : r.cost_option} />
              </Section>
              <SignaturePreview label="Υπογραφή Δήλωσης" data={r.declaration_signature} />

              <Separator />

              {/* Page 4 - BCP/BEP/BMO */}
              <div className="flex items-center gap-2 text-sm font-bold">
                <Package className="h-4 w-4 text-primary" />
                Σελ. 4 — BCP / BEP / BMO
              </div>
              <Section title="Κτίριο">
                <Field label="Building ID" value={r.building_id} />
                <Field label="Διεύθυνση" value={r.building_address} />
                <Field label="Όροφος πελάτη" value={r.customer_floor_select} />
                <Field label="Καμπίνα" value={r.cabinet} />
                <Field label="Σύνολο διαμ." value={r.total_apartments} />
                <Field label="Σύνολο καταστ." value={r.total_shops} />
                <Field label="Σύνολο χώρων" value={r.total_spaces} />
                <Field label="Σύνολο ορόφων" value={r.total_floors} />
              </Section>
              <Section title="BCP">
                <Field label="Μάρκα" value={r.bcp_brand} />
                <Field label="Μέγεθος" value={r.bcp_size} />
                <Field label="Κωδ. σωλήνα" value={r.pipe_code} />
                <Field label="Floorbox" value={r.bcp_floorbox} />
                <Field label="Drop 6" value={r.bcp_drop_6} />
                <Field label="Drop 12" value={r.bcp_drop_12} />
              </Section>
              <Section title="BEP">
                <Field label="Μάρκα" value={r.bep_brand} />
                <Field label="Μέγεθος" value={r.bep_size} />
                <Field label="Χωρητικότητα" value={r.bep_capacity} />
              </Section>
              <Section title="BMO">
                <Field label="Μάρκα" value={r.bmo_brand} />
                <Field label="Μέγεθος" value={r.bmo_size} />
                <Field label="Χωρητικότητα" value={r.bmo_capacity} />
              </Section>
            </TabsContent>

            <TabsContent value="pdf" className="flex-1 overflow-hidden mt-3">
              {r.pdf_drive_url ? (
                <div className="h-full flex flex-col gap-3">
                  <div className="flex-1 rounded-lg border overflow-hidden bg-muted/20 flex items-center justify-center min-h-[300px]">
                    <iframe
                      src={r.pdf_drive_url.replace("/view", "/preview")}
                      className="w-full h-full min-h-[400px]"
                      title="PDF Preview"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => window.open(r.pdf_drive_url, "_blank")}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Άνοιγμα PDF στο Drive
                  </Button>
                </div>
              ) : (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  Δεν έχει δημιουργηθεί PDF ακόμα.
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default InspectionReportViewer;
