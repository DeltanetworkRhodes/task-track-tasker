import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, Download, Search, CheckCircle2, AlertCircle, Loader2, FlaskConical } from "lucide-react";
import { useAssignments, useConstructions } from "@/hooks/useData";
import { generateAsBuilt, generateAsBuiltFromData, getMockAsBuiltData } from "@/lib/generateAsBuilt";
import { toast } from "sonner";

const DocumentGenerator = () => {
  const { data: assignments, isLoading: assignmentsLoading } = useAssignments();
  const { data: constructions } = useConstructions();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [testGenerating, setTestGenerating] = useState(false);

  const filteredAssignments = (assignments || []).filter(a => {
    const matchesSearch = !search || 
      a.sr_id.toLowerCase().includes(search.toLowerCase()) ||
      (a.address || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.area || "").toLowerCase().includes(search.toLowerCase());
    
    const construction = constructions?.find(c => c.sr_id === a.sr_id);
    const hasConstruction = !!construction;
    
    const matchesStatus = statusFilter === "all" || 
      (statusFilter === "ready" && construction?.status === "completed") ||
      (statusFilter === "in_progress" && construction?.status === "in_progress") ||
      (statusFilter === "no_construction" && !hasConstruction);

    return matchesSearch && (statusFilter === "all" ? true : matchesStatus);
  });

  const handleGenerate = async (srId: string) => {
    setGeneratingId(srId);
    try {
      const result = await generateAsBuilt(srId);
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

  const handleTestGenerate = async () => {
    setTestGenerating(true);
    try {
      const mockData = getMockAsBuiltData();
      const result = await generateAsBuiltFromData(mockData);
      if (result.warnings.length > 0) {
        result.warnings.forEach(w => toast.warning(w));
      }
      toast.success("Test AS-BUILD δημιουργήθηκε με mock data!");
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα κατά το test generation");
    } finally {
      setTestGenerating(false);
    }
  };

  const getConstructionStatus = (srId: string) => {
    return constructions?.find(x => x.sr_id === srId)?.status || null;
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
          <Button
            variant="outline"
            onClick={handleTestGenerate}
            disabled={testGenerating}
            className="shrink-0"
          >
            {testGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <FlaskConical className="h-4 w-4 mr-2" />
            )}
            Test AS-BUILD (Mock Data)
          </Button>
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
                <SelectItem value="no_construction">Χωρίς κατασκευή</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Results */}
        {assignmentsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredAssignments.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Δεν βρέθηκαν αναθέσεις</p>
            <p className="text-xs mt-2">Χρησιμοποιήστε το κουμπί "Test AS-BUILD" για δοκιμαστική εξαγωγή με ψεύτικα δεδομένα</p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filteredAssignments.map(assignment => {
              const cStatus = getConstructionStatus(assignment.sr_id);
              const isGenerating = generatingId === assignment.sr_id;

              return (
                <Card key={assignment.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
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
                      {!cStatus && (
                        <Badge variant="outline" className="text-[10px]">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Χωρίς κατασκευή
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {assignment.area}{assignment.address ? ` • ${assignment.address}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={cStatus === "completed" ? "default" : "outline"}
                    disabled={isGenerating || !cStatus}
                    onClick={() => handleGenerate(assignment.sr_id)}
                    className="shrink-0"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Download className="h-4 w-4 mr-1" />
                    )}
                    Εξαγωγή AS-BUILD
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default DocumentGenerator;
