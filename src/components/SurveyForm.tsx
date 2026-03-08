import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Upload, X, FileImage, CheckCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

interface Props {
  assignments?: any[];
  prefillSrId?: string;
  prefillArea?: string;
  onComplete?: () => void;
}

interface FileUpload {
  file: File;
  preview: string;
}

const MAX_FILES = 10;

const SurveyForm = ({ assignments, prefillSrId, prefillArea, onComplete }: Props) => {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [area, setArea] = useState(prefillArea || "");
  const [srId, setSrId] = useState(prefillSrId || "");
  const [comments, setComments] = useState("");
  const [buildingPhotos, setBuildingPhotos] = useState<FileUpload[]>([]);
  const [screenshots, setScreenshots] = useState<FileUpload[]>([]);
  const [inspectionPdf, setInspectionPdf] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const buildingRef = useRef<HTMLInputElement>(null);
  const screenshotRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const handleFiles = (
    files: FileList | null,
    setter: React.Dispatch<React.SetStateAction<FileUpload[]>>,
    current: FileUpload[]
  ) => {
    if (!files) return;
    const remaining = MAX_FILES - current.length;
    const newFiles = Array.from(files).slice(0, remaining).map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setter([...current, ...newFiles]);
  };

  const removeFile = (
    index: number,
    setter: React.Dispatch<React.SetStateAction<FileUpload[]>>,
    current: FileUpload[]
  ) => {
    URL.revokeObjectURL(current[index].preview);
    setter(current.filter((_, i) => i !== index));
  };

  const uploadFiles = async (files: FileUpload[], surveyId: string, type: string) => {
    const paths: { file_path: string; file_name: string; file_type: string }[] = [];
    for (const f of files) {
      const ext = f.file.name.split(".").pop();
      const path = `${user!.id}/${surveyId}/${type}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("surveys").upload(path, f.file);
      if (error) {
        console.error("Upload error:", error);
        continue;
      }
      paths.push({ file_path: path, file_name: f.file.name, file_type: type });
    }
    return paths;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!area || !srId.trim()) {
      toast.error("Συμπληρώστε Περιοχή και SR ID");
      return;
    }
    if (buildingPhotos.length === 0) {
      toast.error("Ανεβάστε τουλάχιστον 1 φωτογραφία κτιρίου");
      return;
    }

    setSubmitting(true);
    try {
      // Auto-detect completeness (inspection_form no longer required — generated as PDF)
      const hasAllFiles = buildingPhotos.length > 0 && screenshots.length > 0;
      const autoStatus = hasAllFiles ? "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ" : "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ";

      // Create survey record
      const { data: survey, error: surveyError } = await supabase
        .from("surveys")
        .insert({
          sr_id: srId.trim(),
          area,
          technician_id: user!.id,
          comments: comments.trim(),
          status: autoStatus,
          organization_id: organizationId,
        })
        .select("id")
        .single();

      if (surveyError) throw surveyError;

      // Upload all files
      const allFiles = [
        ...(await uploadFiles(buildingPhotos, survey.id, "building_photo")),
        ...(await uploadFiles(screenshots, survey.id, "screenshot")),
      ];

      // Save file records
      if (allFiles.length > 0) {
        const { error: filesError } = await supabase
          .from("survey_files")
          .insert(allFiles.map((f) => ({ ...f, survey_id: survey.id, organization_id: organizationId })));
        if (filesError) console.error("Files record error:", filesError);
      }

      // Upload inspection PDF if provided
      if (inspectionPdf) {
        try {
          const assignmentMatch = assignments?.find((a: any) => a.sr_id === srId.trim());
          if (assignmentMatch) {
            const pdfPath = `inspection-pdfs/${organizationId || "default"}/${srId.trim()}_${Date.now()}.pdf`;
            const { error: pdfUploadErr } = await supabase.storage
              .from("surveys")
              .upload(pdfPath, inspectionPdf, { contentType: "application/pdf", upsert: true });
            if (!pdfUploadErr) {
              const { data: signedData } = await supabase.storage
                .from("surveys")
                .createSignedUrl(pdfPath, 60 * 60 * 24 * 365);
              await supabase
                .from("assignments")
                .update({ pdf_url: signedData?.signedUrl || pdfPath })
                .eq("id", assignmentMatch.id);
            }
          }
        } catch (pdfErr) {
          console.error("Inspection PDF upload error:", pdfErr);
        }
      }

      toast.success("Η αυτοψία υποβλήθηκε επιτυχώς!");
      setSubmitted(true);

      // If survey is complete, auto-advance assignment to construction
      if (autoStatus === "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ") {
        try {
          // Find the assignment for this SR and update to construction
          const { data: assignmentData } = await supabase
            .from("assignments")
            .select("id, status")
            .eq("sr_id", srId.trim())
            .eq("technician_id", user!.id)
            .maybeSingle();

          if (assignmentData && assignmentData.status !== "completed" && assignmentData.status !== "cancelled" && assignmentData.status !== "pre_committed") {
            await supabase
              .from("assignments")
              .update({ status: "pre_committed" })
              .eq("id", assignmentData.id);
            toast.success("Πλήρης αυτοψία → Προδέσμευση Υλικών");
          }
        } catch (statusErr) {
          console.error("Auto status update error:", statusErr);
        }
      }

      // Always trigger automation: file check, PDF, Drive folder, email (if complete)
      try {
        const { data: result, error: procError } = await supabase.functions.invoke("process-survey-completion", {
          body: { survey_id: survey.id, sr_id: srId.trim(), area },
        });
        if (procError) {
          console.error("Process survey error:", procError);
        } else if (result) {
          if (result.is_complete) {
            toast.success(`Ολοκληρωμένη αυτοψία → ${result.drive_target || "Drive"} + email`);
          } else {
            toast.info(`Ελλιπής αυτοψία → ${result.drive_target || "ΑΝΑΜΟΝΗ"}. Λείπουν: ${(result.missing_types || []).length} τύποι αρχείων`);
          }
        }
      } catch (autoErr) {
        console.error("Automation error:", autoErr);
      }

      // Cleanup previews
      [...buildingPhotos, ...screenshots].forEach((f) =>
        URL.revokeObjectURL(f.preview)
      );

      // Reset form after delay
      setTimeout(() => {
        setArea("");
        setSrId("");
        setComments("");
        setBuildingPhotos([]);
        setScreenshots([]);
        setInspectionPdf(null);
        setSubmitted(false);
      }, 3000);

      queryClient.invalidateQueries({ queryKey: ["surveys"] });
      queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
      onComplete?.();
    } catch (err: any) {
      console.error(err);
      toast.error("Σφάλμα: " + (err.message || "Δοκιμάστε ξανά"));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
        <h2 className="text-lg font-bold text-foreground">Επιτυχής Υποβολή!</h2>
        <p className="text-sm text-muted-foreground mt-1">Η αυτοψία καταχωρήθηκε.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-8">
      <h2 className="text-lg font-bold text-foreground">Νέα Αυτοψία</h2>

      {/* ΠΕΡΙΟΧΗ */}
      <Card className="p-4 space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Περιοχή <span className="text-destructive">*</span>
        </Label>
        <RadioGroup value={area} onValueChange={setArea}>
          <div className="flex items-center gap-3">
            <RadioGroupItem value="ΡΟΔΟΣ" id="rodos" />
            <Label htmlFor="rodos" className="text-sm cursor-pointer">ΡΟΔΟΣ</Label>
          </div>
          <div className="flex items-center gap-3">
            <RadioGroupItem value="ΚΩΣ" id="kos" />
            <Label htmlFor="kos" className="text-sm cursor-pointer">ΚΩΣ</Label>
          </div>
        </RadioGroup>
      </Card>

      {/* SR ID */}
      <Card className="p-4 space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          SR ID <span className="text-destructive">*</span>
        </Label>
        <Input
          value={srId}
          onChange={(e) => setSrId(e.target.value)}
          placeholder="π.χ. 2-3399..."
          className="text-sm"
        />
      </Card>

      {/* ΦΩΤΟΓΡΑΦΙΕΣ ΚΤΙΡΙΟΥ */}
      <FileUploadSection
        label="Φωτογραφίες Κτιρίου"
        required
        files={buildingPhotos}
        inputRef={buildingRef}
        onAdd={(files) => handleFiles(files, setBuildingPhotos, buildingPhotos)}
        onRemove={(i) => removeFile(i, setBuildingPhotos, buildingPhotos)}
        accept="image/*"
        capture
      />

      {/* SCREENSHOTS */}
      <FileUploadSection
        label="Screenshots (ΧΕΜΔ & AutoCAD)"
        files={screenshots}
        inputRef={screenshotRef}
        onAdd={(files) => handleFiles(files, setScreenshots, screenshots)}
        onRemove={(i) => removeFile(i, setScreenshots, screenshots)}
        accept="image/*"
      />

      {/* ΔΕΛΤΙΟ ΑΥΤΟΨΙΑΣ PDF */}
      <Card className="p-4 space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Δελτίο Αυτοψίας (PDF)
        </Label>
        <input
          ref={pdfRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setInspectionPdf(f);
            e.target.value = "";
          }}
        />
        {inspectionPdf ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <span className="text-sm truncate flex-1">{inspectionPdf.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setInspectionPdf(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={() => pdfRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Ανέβασμα Δελτίου Αυτοψίας
          </Button>
        )}
      </Card>

      {/* ΣΧΟΛΙΑ */}
      <Card className="p-4 space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Σχόλια
        </Label>
        <p className="text-xs text-muted-foreground italic">
          "Αν δεν ανεβάσετε όλα τα αρχεία, πρέπει οπωσδήποτε να γράψετε τον λόγο στο πεδίο ΣΧΟΛΙΑ".
        </p>
        <Textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="Σχόλια αυτοψίας..."
          rows={4}
          className="text-sm"
        />
      </Card>

      {/* Submit */}
      <Button
        type="submit"
        disabled={submitting}
        className="w-full py-6 text-sm font-bold"
      >
        {submitting ? "Υποβολή..." : "Υποβολή Αυτοψίας"}
      </Button>
    </form>
  );
};

// Reusable file upload section
interface FileUploadSectionProps {
  label: string;
  required?: boolean;
  files: FileUpload[];
  inputRef: React.RefObject<HTMLInputElement>;
  onAdd: (files: FileList | null) => void;
  onRemove: (index: number) => void;
  accept?: string;
  capture?: boolean;
}

const FileUploadSection = ({
  label,
  required,
  files,
  inputRef,
  onAdd,
  onRemove,
  accept,
  capture,
}: FileUploadSectionProps) => (
  <Card className="p-4 space-y-3">
    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label} {required && <span className="text-destructive">*</span>}
    </Label>
    <p className="text-xs text-muted-foreground">
      Ανεβάστε έως {MAX_FILES} αρχεία.
    </p>

    {/* Thumbnails */}
    {files.length > 0 && (
      <div className="grid grid-cols-4 gap-2">
        {files.map((f, i) => (
          <div key={i} className="relative group">
            <img
              src={f.preview}
              alt={f.file.name}
              className="h-20 w-full object-cover rounded-lg border border-border"
            />
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    )}

    {files.length < MAX_FILES && (
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          Προσθήκη αρχείου
        </Button>
        {capture && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => {
              // Create a temp input with capture
              const inp = document.createElement("input");
              inp.type = "file";
              inp.accept = "image/*";
              inp.capture = "environment";
              inp.onchange = () => onAdd(inp.files);
              inp.click();
            }}
          >
            <Camera className="h-3.5 w-3.5" />
            Κάμερα
          </Button>
        )}
      </div>
    )}

    <input
      ref={inputRef}
      type="file"
      accept={accept}
      multiple
      className="hidden"
      onChange={(e) => {
        onAdd(e.target.files);
        e.target.value = "";
      }}
    />
  </Card>
);

export default SurveyForm;
