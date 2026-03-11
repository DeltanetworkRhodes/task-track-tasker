import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileSpreadsheet, Download, Search, CheckCircle2, Loader2, FlaskConical, Eye, MapPin, Building2, FolderArchive } from "lucide-react";
import { useAssignments, useConstructions } from "@/hooks/useData";
import { generateAsBuilt, generateAsBuiltFromData, getDemoAsBuiltData } from "@/lib/generateAsBuilt";
import { generateConstructionZip } from "@/lib/generateConstructionZip";
import { useDemo } from "@/contexts/DemoContext";
import { toast } from "sonner";

const DocumentGenerator = () => {
  const { isDemo, demoAssignments, demoConstructions } = useDemo();
  const { data: realAssignments, isLoading: assignmentsLoading } = useAssignments();
  const { data: realConstructions } = useConstructions();

  const assignments = isDemo ? demoAssignments : (realAssignments || []);
  const constructions = isDemo
    ? Object.values(demoConstructions)
    : (realConstructions || []);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [zippingId, setZippingId] = useState<string | null>(null);
  const [selectedSrId, setSelectedSrId] = useState<string | null>(null);

  // Only show assignments that have a construction record
  const assignmentsWithConstruction = assignments.filter((a: any) =>
    constructions.some((c: any) => c.sr_id === a.sr_id)
  );

  const filteredAssignments = assignmentsWithConstruction.filter((a: any) => {
    const matchesSearch = !search ||
      a.sr_id.toLowerCase().includes(search.toLowerCase()) ||
      (a.address || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.area || "").toLowerCase().includes(search.toLowerCase());

    const construction = constructions.find((c: any) => c.sr_id === a.sr_id);
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "ready" && (construction as any)?.status === "completed") ||
      (statusFilter === "in_progress" && (construction as any)?.status === "in_progress");

    return matchesSearch && matchesStatus;
  });

  const getConstructionStatus = (srId: string) => {
    return (constructions.find((x: any) => x.sr_id === srId) as any)?.status || null;
  };

  const selectedAssignment = assignments.find((a: any) => a.sr_id === selectedSrId);
  const selectedConstruction = constructions.find((c: any) => c.sr_id === selectedSrId);

  const handleGenerate = async (srId: string) => {
    setGeneratingId(srId);
    try {
      let result;
      if (isDemo) {
        const demoData = getDemoAsBuiltData(srId);
        result = await generateAsBuiltFromData(demoData);
      } else {
        result = await generateAsBuilt(srId);
      }
      if (result.warnings.length > 0) {
        result.warnings.forEach(w => toast.warning(w));
        toast.warning(`AS-BUILD δημιουργήθηκε με ${result.warnings.length} προειδοποιήσεις`);
      } else {
        toast.success(`AS-BUILD για ${srId} δημιουργήθηκε επιτυχώς!`);
      }
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα κατά τη δημιουργία του AS-BUILD");
    } finally {
      setGeneratingId(null);
    }
  };

  const handleZipExport = async (srId: string) => {
    if (isDemo) {
      toast.error("Η εξαγωγή ZIP δεν είναι διαθέσιμη σε Demo Mode");
      return;
    }

    const assignment = assignments.find((a: any) => a.sr_id === srId);
    const construction = constructions.find((c: any) => c.sr_id === srId);
    if (!assignment || !construction) {
      toast.error("Δεν βρέθηκαν δεδομένα κατασκευής");
      return;
    }

    setZippingId(srId);
    try {
      const result = await generateConstructionZip(
        srId,
        (assignment as any).address || "",
        (construction as any).id,
        null // AS-BUILD Excel could be included separately if needed
      );

      if (result.warnings.length > 0) {
        result.warnings.forEach(w => toast.warning(w));
      }

      if (result.fileCount > 0) {
        toast.success(`ZIP εξήχθη με ${result.fileCount} αρχεία`);
      } else {
        toast.warning("Το ZIP δημιουργήθηκε αλλά δεν περιέχει αρχεία");
      }
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα κατά τη δημιουργία ZIP");
      console.error("ZIP export error:", err);
    } finally {
      setZippingId(null);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
              Document Generator
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Εξαγωγή τελικών AS-BUILD Excel αρχείων ανά SR
            </p>
          </div>
          {isDemo && (
            <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary text-xs">
              <FlaskConical className="h-3 w-3 mr-1" />
              Demo Mode
            </Badge>
          )}
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Αναζήτηση SR, διεύθυνση, περιοχή..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Κατάσταση" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Όλα</SelectItem>
                <SelectItem value="ready">Ολοκληρωμένα</SelectItem>
                <SelectItem value="in_progress">Σε εξέλιξη</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Results */}
        {assignmentsLoading && !isDemo ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredAssignments.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Δεν βρέθηκαν αναθέσεις</p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filteredAssignments.map((assignment: any) => {
              const cStatus = getConstructionStatus(assignment.sr_id);

              return (
                <Card
                  key={assignment.id}
                  className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => setSelectedSrId(assignment.sr_id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{assignment.sr_id}</span>
                      {cStatus === "completed" && (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Ολοκληρωμένο
                        </Badge>
                      )}
                      {cStatus === "in_progress" && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                          Σε εξέλιξη
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {assignment.area}{assignment.address ? ` • ${assignment.address}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSrId(assignment.sr_id);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Λεπτομέρειες
                  </Button>
                </Card>
              );
            })}
          </div>
        )}

        {/* SR Detail Dialog with Export Buttons */}
        <Dialog open={!!selectedSrId} onOpenChange={(open) => !open && setSelectedSrId(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                {selectedSrId}
              </DialogTitle>
            </DialogHeader>

            {selectedAssignment && (
              <div className="space-y-4">
                {/* SR Info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>{(selectedAssignment as any).address || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    <span>{(selectedAssignment as any).area}</span>
                  </div>
                </div>

                {/* Construction Status */}
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Κατάσταση Κατασκευής</p>
                  {selectedConstruction ? (
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          (selectedConstruction as any).status === "completed"
                            ? "bg-green-500/10 text-green-600 border-green-500/20"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                        }
                      >
                        {(selectedConstruction as any).status === "completed" ? "Ολοκληρωμένο" : "Σε εξέλιξη"}
                      </Badge>
                      {(selectedConstruction as any).cab && (
                        <span className="text-xs text-muted-foreground">CAB: {(selectedConstruction as any).cab}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Χωρίς κατασκευή</span>
                  )}
                </div>

                {/* Export Buttons */}
                <div className="space-y-2">
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={generatingId === selectedSrId}
                    onClick={() => selectedSrId && handleGenerate(selectedSrId)}
                  >
                    {generatingId === selectedSrId ? (
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    ) : (
                      <Download className="h-5 w-5 mr-2" />
                    )}
                    Εξαγωγή AS-BUILD
                  </Button>

                  {!isDemo && (
                    <Button
                      className="w-full"
                      size="lg"
                      variant="outline"
                      disabled={zippingId === selectedSrId}
                      onClick={() => selectedSrId && handleZipExport(selectedSrId)}
                    >
                      {zippingId === selectedSrId ? (
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      ) : (
                        <FolderArchive className="h-5 w-5 mr-2" />
                      )}
                      Εξαγωγή ZIP (Φωτογραφίες + Μετρήσεις)
                    </Button>
                  )}
                </div>

                {isDemo && (
                  <p className="text-[10px] text-muted-foreground text-center">
                    Demo Mode: Θα χρησιμοποιηθούν αποκλειστικά τα demo δεδομένα του {selectedSrId}
                  </p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default DocumentGenerator;
