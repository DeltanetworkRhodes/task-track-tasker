import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useDemo } from "@/contexts/DemoContext";

interface GisUploadCardProps {
  assignment: any;
  hasExistingGis: boolean;
  onUploadSuccess?: (result: any) => void;
  compact?: boolean;
}

const GisUploadCard = ({ assignment, hasExistingGis, onUploadSuccess, compact = false }: GisUploadCardProps) => {
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { isDemo } = useDemo();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !assignment) return;

    if (!file.name.toLowerCase().endsWith(".xlsx") && !file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Μόνο αρχεία .XLSX / .CSV γίνονται δεκτά");
      return;
    }

    setUploading(true);
    setSuccess(false);

    // Demo mode: simulate parsing
    if (isDemo) {
      await new Promise((r) => setTimeout(r, 1500));
      const demoResult = {
        parsed: { floors: 5, optical_paths: 3 },
        floors: 5,
        bep_type: "BEP-8",
        floor_details: [
          { floor: 0, apartments: 2, fb_count: 1 },
          { floor: 1, apartments: 2, fb_count: 1 },
          { floor: 2, apartments: 1, fb_count: 1 },
          { floor: 3, apartments: 1, fb_count: 1 },
          { floor: 4, apartments: 1, fb_count: 1 },
        ],
        gis_works: [
          { code: "W-001", description: "Εγκατάσταση BEP", quantity: 1 },
          { code: "W-002", description: "Floor Box", quantity: 5 },
        ],
      };
      setSuccess(true);
      setUploading(false);
      toast.success(
        `✅ Το GIS αναλύθηκε επιτυχώς! ${demoResult.parsed.floors} όροφοι, ${demoResult.parsed.optical_paths} οπτικές διαδρομές (Λειτουργία Demo)`,
        { duration: 5000 }
      );
      onUploadSuccess?.(demoResult);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("assignment_id", assignment.id);
      formData.append("sr_id", assignment.sr_id);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/parse-gis-excel`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed");

      setSuccess(true);
      toast.success(
        `✅ GIS αναλύθηκε επιτυχώς! ${result.parsed.floors} όροφοι, ${result.parsed.optical_paths} οπτικές διαδρομές`,
        { duration: 5000 }
      );

      queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-gis"] });
      queryClient.invalidateQueries({ queryKey: ["gis-assignment-ids"] });

      onUploadSuccess?.(result);
    } catch (err: any) {
      console.error("GIS upload error:", err);
      toast.error("Σφάλμα: " + (err.message || "Δοκιμάστε ξανά"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (compact && hasExistingGis && !success) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          variant="outline"
          className="w-full gap-2 min-h-[44px] text-sm border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
          {uploading ? "Ανάλυση GIS..." : "Αντικατάσταση GIS"}
        </Button>
      </>
    );
  }

  // Prominent card for missing GIS
  if (!hasExistingGis && !success) {
    return (
      <Card className="border-2 border-dashed border-amber-400/60 bg-amber-50/50 dark:bg-amber-950/20 p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/15">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">Αναμονή GIS Αρχείου</p>
            <p className="text-xs text-muted-foreground">
              Ανεβάστε το αρχείο GIS Excel (.xlsx) του ΟΤΕ για να ξεκλειδώσετε την κατασκευή
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFileChange}
        />

        <Button
          className="w-full gap-3 min-h-[52px] text-base font-semibold bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-all"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Ανάλυση GIS αρχείου...</span>
            </>
          ) : (
            <>
              <Upload className="h-5 w-5" />
              <span>Εισαγωγή Αρχείου GIS ΟΤΕ</span>
            </>
          )}
        </Button>

        {uploading && (
          <div className="flex items-center gap-2 justify-center text-xs text-muted-foreground animate-pulse">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Γίνεται ανάγνωση ΟΡΟΦΩΝ και OPTICAL PATHS...
          </div>
        )}
      </Card>
    );
  }

  // Success state
  if (success) {
    return (
      <Card className="border-2 border-green-400/60 bg-green-50/50 dark:bg-green-950/20 p-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-green-500/15">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-sm text-green-700 dark:text-green-400">
              Το GIS αναλύθηκε επιτυχώς!
            </p>
            <p className="text-xs text-muted-foreground">
              Τα δεδομένα κατασκευής είναι έτοιμα. Μπορείτε να ξεκινήσετε την κατασκευή.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // Has existing GIS, non-compact (show replace option)
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        variant="outline"
        className="w-full gap-2 min-h-[44px] text-sm border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="h-4 w-4" />
        )}
        {uploading ? "Ανάλυση GIS..." : "Αντικατάσταση GIS"}
      </Button>
    </>
  );
};

export default GisUploadCard;
