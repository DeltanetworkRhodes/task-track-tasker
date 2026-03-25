import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileSpreadsheet, Download, Search, CheckCircle2, Loader2, FlaskConical, Eye, MapPin, Building2, FolderArchive, Layers, Cable, Hash } from "lucide-react";
import { useAssignments, useConstructions, useGisDataByOrg } from "@/hooks/useData";
import { generateAsBuilt, generateAsBuiltFromData, getDemoAsBuiltData } from "@/lib/generateAsBuilt";
import { generateConstructionZip } from "@/lib/generateConstructionZip";
import { useDemo } from "@/contexts/DemoContext";
import { toast } from "sonner";

const DocumentGenerator = () => {
  const { isDemo, demoAssignments, demoConstructions } = useDemo();
  const { data: realAssignments, isLoading: assignmentsLoading } = useAssignments();
  const { data: realConstructions } = useConstructions();
  const { data: gisDataList } = useGisDataByOrg();

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

  const getGisData = (assignmentId: string) => {
    if (!gisDataList) return null;
    return gisDataList.find((g: any) => g.assignment_id === assignmentId) || null;
  };

  const selectedAssignment = assignments.find((a: any) => a.sr_id === selectedSrId);
  const selectedConstruction = constructions.find((c: any) => c.sr_id === selectedSrId);
  const selectedGis = selectedAssignment ? getGisData((selectedAssignment as any).id) : null;

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
        null
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

  const countOpticalPaths = (gis: any) => {
    if (!gis?.optical_paths) return 0;
    return Array.isArray(gis.optical_paths) ? gis.optical_paths.length : 0;
  };

  const countFloors = (gis: any) => {
    if (!gis?.floor_details) return 0;
    return Array.isArray(gis.floor_details) ? gis.floor_details.length : 0;
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
              const gis = getGisData(assignment.id);

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
                      {gis && (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px]">
                          GIS ✓
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {assignment.area}{assignment.address ? ` • ${assignment.address}` : ""}
                      {gis?.building_id ? ` • ${gis.building_id}` : ""}
                    </p>
                    {gis && (
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <Layers className="h-3 w-3" />
                          {countFloors(gis)} όροφοι
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Cable className="h-3 w-3" />
                          {countOpticalPaths(gis)} paths
                        </span>
                        {gis.conduit && (
                          <span className="flex items-center gap-0.5">
                            {gis.conduit}
                          </span>
                        )}
                      </div>
                    )}
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
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="truncate">{(selectedAssignment as any).address || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-4 w-4 shrink-0" />
                    <span>{(selectedAssignment as any).area}</span>
                  </div>
                </div>

                {/* GIS Data */}
                {selectedGis && (
                  <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10 space-y-2">
                    <p className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                      <Hash className="h-3 w-3" /> Δεδομένα GIS
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Building ID:</span>
                        <span className="font-medium">{selectedGis.building_id || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Τύπος:</span>
                        <span className="font-medium">{selectedGis.area_type || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Όροφοι:</span>
                        <span className="font-medium">{selectedGis.floors || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Conduit:</span>
                        <span className="font-medium">{selectedGis.conduit || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">BEP:</span>
                        <span className="font-medium text-[10px]">{selectedGis.bep_type || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">BMO:</span>
                        <span className="font-medium text-[10px]">{selectedGis.bmo_type || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Απόσταση CAB:</span>
                        <span className="font-medium">{selectedGis.distance_from_cabinet || 0}m</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Optical Paths:</span>
                        <span className="font-medium">{countOpticalPaths(selectedGis)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Όροφος BEP:</span>
                        <span className="font-medium">{selectedGis.bep_floor || "—"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Όροφος Πελάτη:</span>
                        <span className="font-medium">{selectedGis.customer_floor || "—"}</span>
                      </div>
                    </div>

                    {/* Optical Path Types Summary */}
                    {selectedGis.optical_paths && Array.isArray(selectedGis.optical_paths) && selectedGis.optical_paths.length > 0 && (
                      <div className="pt-1 border-t border-blue-500/10">
                        <p className="text-[10px] text-muted-foreground mb-1">Τύποι Διαδρομών:</p>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(
                            (selectedGis.optical_paths as any[]).reduce((acc: Record<string, number>, p: any) => {
                              const t = p["OPTICAL PATH TYPE"] || p.type || "?";
                              acc[t] = (acc[t] || 0) + 1;
                              return acc;
                            }, {})
                          ).map(([type, count]) => (
                            <Badge key={type} variant="outline" className="text-[9px] bg-blue-500/5">
                              {type}: {count as number}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!selectedGis && !isDemo && (
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 text-xs text-amber-700">
                    ⚠️ Δεν βρέθηκαν GIS δεδομένα — το AS-BUILD θα έχει ελλιπή δεδομένα
                  </div>
                )}

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
