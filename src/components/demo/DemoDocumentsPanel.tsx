import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileSpreadsheet, Download, CheckCircle2, Loader2, Eye, MapPin, Building2, FlaskConical, Image } from "lucide-react";
import { getDemoAsBuiltData, generateAsBuiltFromData } from "@/lib/generateAsBuilt";
import { generateOteSketch } from "@/lib/generateSketch";
import { toast } from "sonner";

const DEMO_SRS = [
  { srId: "SR-DEMO-01", area: "Ρόδος Κέντρο", address: "Λεωφ. Ελευθερίας 42", status: "pre_committed", cab: "CAB-045", floors: 3 },
  { srId: "SR-DEMO-02", area: "Ιαλυσός", address: "Οδός Ηρώων 15", status: "construction", cab: "CAB-112", floors: 5 },
  { srId: "SR-DEMO-03", area: "Φαληράκι", address: "Πλατεία Αγίας Παρασκευής 8", status: "completed", cab: "CAB-089", floors: 4 },
  { srId: "2-334066371997", area: "Αθήνα", address: "ΑΓΙΟΥ ΚΩΝΣΤΑΝΤΙΝΟΥ 58", status: "completed", cab: "G526", floors: 4 },
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
      console.error("AS-BUILD generation error:", err);
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
                {sr.area} • {sr.address} • CAB: {sr.cab} • {sr.floors} όροφοι
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

      {/* SR Detail Dialog */}
      <Dialog open={!!selectedSr} onOpenChange={(open) => !open && setSelectedSr(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              {selectedSr?.srId}
            </DialogTitle>
          </DialogHeader>

          {selectedSr && (
            <div className="space-y-4">
              {/* SR Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span>{selectedSr.address}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span>{selectedSr.area}</span>
                </div>
              </div>

              {/* Details */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-lg bg-muted/50 text-center">
                  <p className="text-[10px] text-muted-foreground">CAB</p>
                  <p className="text-sm font-semibold text-foreground">{selectedSr.cab}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/50 text-center">
                  <p className="text-[10px] text-muted-foreground">Όροφοι</p>
                  <p className="text-sm font-semibold text-foreground">{selectedSr.floors}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/50 text-center">
                  <p className="text-[10px] text-muted-foreground">Κατάσταση</p>
                  <Badge variant="outline" className={`text-[9px] ${statusColors[selectedSr.status] || ""}`}>
                    {statusLabels[selectedSr.status] || selectedSr.status}
                  </Badge>
                </div>
              </div>

              {/* Sketch Preview */}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border">
                  <Image className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">Σκαρίφημα (Preview)</span>
                  <Badge variant="outline" className="text-[9px] ml-auto">demo placeholder</Badge>
                </div>
                <div className="p-2 bg-background">
                  <img
                    src={generateOteSketch({
                      conduit: getDemoAsBuiltData(selectedSr.srId).conduit,
                      cabId: getDemoAsBuiltData(selectedSr.srId).cabId,
                      distanceFromCabinet: getDemoAsBuiltData(selectedSr.srId).distanceFromCabinet,
                      address: selectedSr.address,
                      buildingId: getDemoAsBuiltData(selectedSr.srId).buildingId,
                    })}
                    alt={`Σκαρίφημα ${selectedSr.srId}`}
                    className="w-full h-auto rounded border border-border"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground px-3 py-1.5 bg-muted/20">
                  Αυτή η εικόνα θα ενσωματωθεί στο Excel στη γραμμή 45 (6 ΟΡΙΖΟΝΤΟΓΡΑΦΙΑ)
                </p>
              </div>

              {/* Export Button */}
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
                Demo Mode: Χρησιμοποιούνται αποκλειστικά τα demo δεδομένα του {selectedSr.srId}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DemoDocumentsPanel;
