import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText, ClipboardList, Loader2, Download } from "lucide-react";
import { generateInspectionPdfBytes } from "@/lib/generateInspectionPdf";

interface Props {
  assignmentId: string;
  srId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const InspectionReportViewer = ({ assignmentId, srId, open, onOpenChange }: Props) => {
  const [activeTab, setActiveTab] = useState("pdf");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

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

  // Generate PDF on-the-fly when report data is available
  useEffect(() => {
    if (!r || !open) {
      setPdfUrl(null);
      return;
    }

    let cancelled = false;
    setGenerating(true);

    generateInspectionPdfBytes(r)
      .then((bytes) => {
        if (cancelled) return;
        const blob = new Blob([bytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        setPdfUrl(url);
      })
      .catch((err) => {
        console.error("PDF generation error:", err);
      })
      .finally(() => {
        if (!cancelled) setGenerating(false);
      });

    return () => {
      cancelled = true;
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, open]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = `Deltio_Autopsias_${srId}.pdf`;
    a.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-primary" />
            Δελτίο Αυτοψίας — {srId}
            {r?.pdf_generated && (
              <Badge variant="default" className="text-[10px] ml-2">Drive ✓</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !r ? (
          <div className="text-center py-12 text-sm text-muted-foreground px-6">
            Δεν έχει συμπληρωθεί δελτίο αυτοψίας για αυτό το SR.
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col px-6 pb-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="grid grid-cols-2 w-full mb-3">
                <TabsTrigger value="pdf" className="gap-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5" />
                  PDF Preview
                </TabsTrigger>
                <TabsTrigger value="data" className="gap-1.5 text-xs">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Δεδομένα
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pdf" className="flex-1 overflow-hidden mt-0">
                {generating ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Δημιουργία PDF...</span>
                  </div>
                ) : pdfUrl ? (
                  <div className="h-full flex flex-col gap-3">
                    <div className="flex-1 rounded-lg border overflow-hidden bg-muted/20 min-h-[400px]">
                      <iframe
                        src={pdfUrl}
                        className="w-full h-full min-h-[500px]"
                        title="PDF Preview"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-2"
                        onClick={handleDownload}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Λήψη PDF
                      </Button>
                      {r.pdf_drive_url && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-2"
                          onClick={() => window.open(r.pdf_drive_url, "_blank")}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Άνοιγμα στο Drive
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    Αδυναμία δημιουργίας PDF.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="data" className="flex-1 overflow-y-auto mt-0 space-y-3 pr-1">
                <DataSection title="Στοιχεία Πελάτη">
                  <DataField label="Ονοματεπώνυμο" value={r.customer_name} />
                  <DataField label="Πατρώνυμο" value={r.customer_father_name} />
                  <DataField label="Κινητό" value={r.customer_mobile} />
                  <DataField label="Τηλέφωνο" value={r.customer_phone} />
                  <DataField label="Email" value={r.customer_email} />
                  <DataField label="Οδός" value={r.customer_street} />
                  <DataField label="Αριθμός" value={r.customer_number} />
                  <DataField label="Τ.Κ." value={r.customer_postal_code} />
                  <DataField label="Όροφος" value={r.customer_floor} />
                  <DataField label="Νομός" value={r.customer_county} />
                  <DataField label="Δήμος" value={r.customer_municipality} />
                </DataSection>
                <DataSection title="Διαχειριστής">
                  <DataField label="Ονοματεπώνυμο" value={r.manager_name} />
                  <DataField label="Κινητό" value={r.manager_mobile} />
                  <DataField label="Email" value={r.manager_email} />
                </DataSection>
                <DataSection title="Τεχνική Περιγραφή">
                  <DataField label="Εσκαλίτ" value={r.routing_escalit} />
                  <DataField label="Εξωτ. Σωλήνα" value={r.routing_external_pipe} />
                  <DataField label="Εναέρια" value={r.routing_aerial} />
                  <DataField label="Θέση BEP" value={r.bep_position} />
                  <DataField label="Κατακόρυφη δρομολόγηση" value={r.vertical_routing} />
                </DataSection>
                <DataSection title="BCP / BEP / BMO">
                  <DataField label="BCP Μάρκα" value={r.bcp_brand} />
                  <DataField label="BCP Μέγεθος" value={r.bcp_size} />
                  <DataField label="BEP Μάρκα" value={r.bep_brand} />
                  <DataField label="BEP Μέγεθος" value={r.bep_size} />
                  <DataField label="BMO Μάρκα" value={r.bmo_brand} />
                  <DataField label="BMO Μέγεθος" value={r.bmo_size} />
                </DataSection>
                {(r.engineer_signature || r.customer_signature || r.manager_signature) && (
                  <DataSection title="Υπογραφές">
                    {r.engineer_signature && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Μηχανικός</span>
                        <img src={r.engineer_signature} alt="Engineer" className="max-h-12 border rounded p-1 bg-background" />
                      </div>
                    )}
                    {r.customer_signature && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Πελάτης</span>
                        <img src={r.customer_signature} alt="Customer" className="max-h-12 border rounded p-1 bg-background" />
                      </div>
                    )}
                    {r.manager_signature && (
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Διαχειριστής</span>
                        <img src={r.manager_signature} alt="Manager" className="max-h-12 border rounded p-1 bg-background" />
                      </div>
                    )}
                  </DataSection>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Helper components
const DataSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-1">
    <h4 className="text-xs font-bold text-foreground uppercase tracking-wide">{title}</h4>
    <div className="bg-muted/30 rounded-lg p-3 space-y-0.5">{children}</div>
  </div>
);

const DataField = ({ label, value }: { label: string; value: any }) => {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-center justify-between py-0.5 gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-medium text-right">
        {typeof value === "boolean" ? (value ? "Ναι" : "Όχι") : String(value)}
      </span>
    </div>
  );
};

export default InspectionReportViewer;
