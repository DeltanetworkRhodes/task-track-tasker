import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileSpreadsheet, Download, CheckCircle2, Loader2, Eye, MapPin, Building2, FlaskConical } from "lucide-react";
import { getDemoAsBuiltData, generateAsBuiltFromData } from "@/lib/generateAsBuilt";
import { toast } from "sonner";

const DEMO_SRS = [
  { srId: "SR-DEMO-01", area: "Ρόδος Κέντρο", address: "Λεωφ. Ελευθερίας 42", status: "pre_committed", hasConstruction: false },
  { srId: "SR-DEMO-02", area: "Ιαλυσός", address: "Οδός Ηρώων 15", status: "construction", hasConstruction: true },
  { srId: "SR-DEMO-03", area: "Φαληράκι", address: "Πλατεία Αγίας Παρασκευής 8", status: "completed", hasConstruction: true },
  { srId: "2-334066371997", area: "Αθήνα", address: "ΑΓΙΟΥ ΚΩΝΣΤΑΝΤΙΝΟΥ 58", status: "completed", hasConstruction: true },
];

const statusLabels: Record<string, string> = {
  pre_committed: "Προδέσμευση",
  construction: "Κατασκευή",
  completed: "Ολοκληρωμένο",
};

const statusColors: Record<string, string> = {
  pre_committed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  construction: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  completed: "bg-green-500/10 text-green-600 border-green-500/20",
};

const DemoDocumentsPanel = () => {
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [selectedSr, setSelectedSr] = useState<typeof DEMO_SRS[0] | null>(null);

  const handleGenerate = async (srId: string) => {
    setGeneratingId(srId);
    try {
      const data = getDemoAsBuiltData(srId);
      const result = await generateAsBuiltFromData(data);
      if (result.warnings.length > 0) {
        result.warnings.forEach(w => toast.warning(w));
      }
      toast.success(`AS-BUILD για ${srId} δημιουργήθηκε επιτυχώς!`);
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα κατά τη δημιουργία του AS-BUILD");
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Document Generator
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Εξαγωγή AS-BUILD Excel αρχείων ανά SR
          </p>
        </div>
        <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary text-xs">
          <FlaskConical className="h-3 w-3 mr-1" />
          Demo Mode
        </Badge>
      </div>

      <div className="grid gap-3">
        {DEMO_SRS.map((sr) => (
          <Card
            key={sr.srId}
            className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => setSelectedSr(sr)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground">{sr.srId}</span>
                <Badge variant="outline" className={`text-[10px] ${statusColors[sr.status] || ""}`}>
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {statusLabels[sr.status] || sr.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {sr.area} • {sr.address}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={(e) => { e.stopPropagation(); setSelectedSr(sr); }}
            >
              <Eye className="h-4 w-4 mr-1" />
              Λεπτομέρειες
            </Button>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedSr} onOpenChange={(open) => !open && setSelectedSr(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              {selectedSr?.srId}
            </DialogTitle>
          </DialogHeader>

          {selectedSr && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{selectedSr.address}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>{selectedSr.area}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">Κατάσταση</p>
                <Badge variant="outline" className={statusColors[selectedSr.status] || ""}>
                  {statusLabels[selectedSr.status] || selectedSr.status}
                </Badge>
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={generatingId === selectedSr.srId}
                onClick={() => handleGenerate(selectedSr.srId)}
              >
                {generatingId === selectedSr.srId ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <Download className="h-5 w-5 mr-2" />
                )}
                Εξαγωγή AS-BUILD
              </Button>

              <p className="text-[10px] text-muted-foreground text-center">
                Demo Mode: Θα χρησιμοποιηθούν τα demo δεδομένα με placeholder σκαρίφημα
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DemoDocumentsPanel;
