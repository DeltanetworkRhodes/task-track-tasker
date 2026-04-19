import { useState, useRef } from "react";
import { hapticFeedback } from "@/lib/haptics";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Upload, X, FileImage, CheckCircle, FileText, Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { compressImages, formatFileSize } from "@/lib/imageCompression";
import { applyWatermarkBatch, type WatermarkData } from "@/lib/watermark";
import { enqueueSurvey, fileToOfflineFile, isOnline } from "@/lib/offlineQueue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";


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

interface CompressionState {
  isCompressing: boolean;
  originalSize: number;
  compressedSize: number;
}
const CATEGORY_TO_PHOTO_TYPE: Record<string, string> = {
  building: "building_photo",
  screenshots: "screenshot",
};

const SurveyForm = ({ assignments, prefillSrId, prefillArea, onComplete }: Props) => {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  
  const [area, setArea] = useState(prefillArea || "");
  const [srId, setSrId] = useState(prefillSrId || "");
  const [comments, setComments] = useState("");
  const [buildingPhotos, setBuildingPhotos] = useState<FileUpload[]>([]);
  const [screenshots, setScreenshots] = useState<FileUpload[]>([]);
  const [inspectionPdf, setInspectionPdf] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const [compressing, setCompressing] = useState<Record<string, boolean>>({});
  const [compressionStats, setCompressionStats] = useState<Record<string, { original: number; compressed: number }>>({});
  const buildingRef = useRef<HTMLInputElement>(null);
  const screenshotRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (
    files: FileList | null,
    setter: React.Dispatch<React.SetStateAction<FileUpload[]>>,
    current: FileUpload[],
    category: string
  ) => {
    if (!files) return;
    const remaining = MAX_FILES - current.length;
    const rawFiles = Array.from(files).slice(0, remaining);

    // Compress images
    const hasImages = rawFiles.some((f) => f.type.startsWith("image/"));
    let processedFiles = rawFiles;
    if (hasImages) {
      setCompressing((prev) => ({ ...prev, [category]: true }));
      const originalSize = rawFiles.reduce((s, f) => s + f.size, 0);
      processedFiles = await compressImages(rawFiles);

      // Apply watermark with SR context
      const assignmentMatch = assignments?.find((a: any) => a.sr_id === srId.trim());
      const wmData: WatermarkData = {
        srId: srId.trim() || "—",
        address: assignmentMatch?.address || undefined,
        latitude: assignmentMatch?.latitude,
        longitude: assignmentMatch?.longitude,
        datetime: new Date(),
      };
      processedFiles = await applyWatermarkBatch(processedFiles, wmData);

      const compressedSize = processedFiles.reduce((s, f) => s + f.size, 0);
      setCompressionStats((prev) => ({
        ...prev,
        [category]: {
          original: (prev[category]?.original || 0) + originalSize,
          compressed: (prev[category]?.compressed || 0) + compressedSize,
        },
      }));
      setCompressing((prev) => ({ ...prev, [category]: false }));
    }

    const accepted: FileUpload[] = [];
    const photoType = CATEGORY_TO_PHOTO_TYPE[category] || "building_photo";
    const startIndex = current.length;

    for (let i = 0; i < processedFiles.length; i++) {
      const file = processedFiles[i];
      const preview = URL.createObjectURL(file);



      accepted.push({ file, preview });
    }

    if (accepted.length > 0) {
      setter([...current, ...accepted]);
    }
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
    hapticFeedback.medium();
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
      const hasAllFiles = buildingPhotos.length > 0 && screenshots.length > 0;
      const autoStatus = hasAllFiles ? "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ" : "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ";

      // === OFFLINE PATH ===
      if (!isOnline()) {
        const offlineId = crypto.randomUUID();

        // Find assignment info for later sync
        const assignmentMatch = assignments?.find((a: any) => a.sr_id === srId.trim());

        // Convert files to storable format
        const offlineBuildingPhotos = await Promise.all(
          buildingPhotos.map((f) => fileToOfflineFile(f.file))
        );
        const offlineScreenshots = await Promise.all(
          screenshots.map((f) => fileToOfflineFile(f.file))
        );
        const offlineInspectionPdf = inspectionPdf
          ? await fileToOfflineFile(inspectionPdf)
          : null;

        await enqueueSurvey({
          id: offlineId,
          timestamp: Date.now(),
          srId: srId.trim(),
          area,
          comments: comments.trim(),
          organizationId,
          userId: user!.id,
          autoStatus,
          buildingPhotos: offlineBuildingPhotos,
          screenshots: offlineScreenshots,
          inspectionPdf: offlineInspectionPdf,
          assignmentId: assignmentMatch?.id,
          assignmentStatus: assignmentMatch?.status,
        });

        toast.success("Αποθηκεύτηκε τοπικά! Θα συγχρονιστεί αυτόματα όταν βρεθεί δίκτυο.", {
          icon: "📱",
          duration: 5000,
        });

        setSavedOffline(true);

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
          setSavedOffline(false);
        }, 3000);

        onComplete?.();
        return;
      }

      // === ONLINE PATH ===
      // Check for existing incomplete survey for this SR
      let survey: { id: string };
      let mergedIntoExisting = false;

      const { data: existingSurvey } = await supabase
        .from("surveys")
        .select("id, status")
        .eq("sr_id", srId.trim())
        .eq("technician_id", user!.id)
        .eq("status", "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ")
        .maybeSingle();

      if (existingSurvey) {
        // Merge into existing incomplete survey
        survey = existingSurvey;
        mergedIntoExisting = true;

        // Update status and comments
        await supabase
          .from("surveys")
          .update({
            status: autoStatus,
            comments: comments.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingSurvey.id);

        // Delete old files from storage & DB to replace with new ones
        const { data: oldFiles } = await supabase
          .from("survey_files")
          .select("id, file_path, file_type")
          .eq("survey_id", existingSurvey.id);

        if (oldFiles && oldFiles.length > 0) {
          // Only replace file types that the user is uploading now
          const uploadingTypes = new Set<string>();
          if (buildingPhotos.length > 0) uploadingTypes.add("building_photo");
          if (screenshots.length > 0) uploadingTypes.add("screenshot");
          if (inspectionPdf) uploadingTypes.add("inspection_pdf");

          const filesToReplace = oldFiles.filter((f) => uploadingTypes.has(f.file_type));
          if (filesToReplace.length > 0) {
            // Remove from storage
            const pathsToRemove = filesToReplace.map((f) => f.file_path);
            await supabase.storage.from("surveys").remove(pathsToRemove);
            // Remove DB records
            const idsToRemove = filesToReplace.map((f) => f.id);
            await supabase.from("survey_files").delete().in("id", idsToRemove);
          }
        }

        toast.info("Βρέθηκε υπάρχων φάκελος αναμονής. Τα αρχεία ενημερώθηκαν.", {
          icon: "📂",
          duration: 5000,
        });
      } else {
        // Create new survey
        const { data: newSurvey, error: surveyError } = await supabase
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
        survey = newSurvey;
      }

      const allFiles = [
        ...(await uploadFiles(buildingPhotos, survey.id, "building_photo")),
        ...(await uploadFiles(screenshots, survey.id, "screenshot")),
      ];

      if (allFiles.length > 0) {
        const { error: filesError } = await supabase
          .from("survey_files")
          .insert(allFiles.map((f) => ({ ...f, survey_id: survey.id, organization_id: organizationId })));
        if (filesError) console.error("Files record error:", filesError);
      }

      if (inspectionPdf) {
        try {
          const pdfPath = `${user!.id}/${survey.id}/inspection_pdf/${crypto.randomUUID()}.pdf`;
          const { error: pdfUploadErr } = await supabase.storage
            .from("surveys")
            .upload(pdfPath, inspectionPdf, { contentType: "application/pdf" });
          if (!pdfUploadErr) {
            await supabase.from("survey_files").insert({
              survey_id: survey.id,
              file_path: pdfPath,
              file_name: inspectionPdf.name,
              file_type: "inspection_pdf",
              organization_id: organizationId,
            });

            const assignmentMatch = assignments?.find((a: any) => a.sr_id === srId.trim());
            if (assignmentMatch) {
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

      toast.success(
        mergedIntoExisting
          ? "Τα αρχεία ενημερώθηκαν στον υπάρχοντα φάκελο! Η επεξεργασία γίνεται στο παρασκήνιο."
          : "Η αυτοψία υποβλήθηκε! Η επεξεργασία (ZIP, Drive, email) γίνεται στο παρασκήνιο."
      );
      setSubmitted(true);

      if (autoStatus === "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ") {
        try {
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

      supabase.functions.invoke("process-survey-completion", {
        body: { survey_id: survey.id, sr_id: srId.trim(), area },
      }).catch((err) => console.error("Background processing trigger error:", err));

      [...buildingPhotos, ...screenshots].forEach((f) =>
        URL.revokeObjectURL(f.preview)
      );

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

  if (savedOffline) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <WifiOff className="h-16 w-16 text-amber-500 mb-4" />
        <h2 className="text-lg font-bold text-foreground">Αποθηκεύτηκε Τοπικά!</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Θα συγχρονιστεί αυτόματα όταν επανέλθει η σύνδεση.
        </p>
      </div>
    );
  }

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
    <form onSubmit={handleSubmit} className="space-y-5 pb-8">
      <div className="flex items-center gap-2.5 px-1">
        <span className="h-7 w-1 rounded-full bg-gradient-to-b from-primary to-accent" />
        <h2 className="text-lg font-semibold text-foreground tracking-tight">Νέα Αυτοψία</h2>
      </div>

      {/* ΠΕΡΙΟΧΗ */}
      <Card className="p-5 space-y-3.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Περιοχή <span className="text-destructive">*</span>
          </Label>
        </div>
        <RadioGroup value={area} onValueChange={setArea} className="gap-2">
          <label htmlFor="rodos" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer">
            <RadioGroupItem value="ΡΟΔΟΣ" id="rodos" />
            <span className="text-sm font-medium">ΡΟΔΟΣ</span>
          </label>
          <label htmlFor="kos" className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer">
            <RadioGroupItem value="ΚΩΣ" id="kos" />
            <span className="text-sm font-medium">ΚΩΣ</span>
          </label>
        </RadioGroup>
      </Card>

      {/* SR ID */}
      <Card className="p-5 space-y-3.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            SR ID <span className="text-destructive">*</span>
          </Label>
        </div>
        <Input
          value={srId}
          onChange={(e) => setSrId(e.target.value)}
          placeholder="π.χ. 2-3399..."
          className="text-sm h-11 rounded-xl bg-muted/30 border-border/60 focus-visible:bg-card transition-colors"
        />
      </Card>

      {/* ΦΩΤΟΓΡΑΦΙΕΣ ΚΤΙΡΙΟΥ */}
      <FileUploadSection
        label="Φωτογραφίες Κτιρίου"
        required
        files={buildingPhotos}
        inputRef={buildingRef}
        onAdd={(files) => handleFiles(files, setBuildingPhotos, buildingPhotos, "building")}
        onRemove={(i) => removeFile(i, setBuildingPhotos, buildingPhotos)}
        accept="image/*"
        capture
        isCompressing={compressing["building"]}
        compressionStats={compressionStats["building"]}
      />

      {/* SCREENSHOTS */}
      <FileUploadSection
        label="Screenshots (ΧΕΜΔ & AutoCAD)"
        files={screenshots}
        inputRef={screenshotRef}
        onAdd={(files) => handleFiles(files, setScreenshots, screenshots, "screenshots")}
        onRemove={(i) => removeFile(i, setScreenshots, screenshots)}
        accept="image/*"
        isCompressing={compressing["screenshots"]}
        compressionStats={compressionStats["screenshots"]}
      />

      {/* ΔΕΛΤΙΟ ΑΥΤΟΨΙΑΣ PDF */}
      <Card className="p-5 space-y-3.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Δελτίο Αυτοψίας (PDF)
          </Label>
        </div>
        <input
          ref={pdfRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && f.type === "application/pdf") {
              setInspectionPdf(f);
            } else if (f) {
              toast.error("Μόνο αρχεία PDF επιτρέπονται");
            }
            e.target.value = "";
          }}
        />
        {inspectionPdf ? (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/15">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <span className="text-sm truncate flex-1 font-medium">{inspectionPdf.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setInspectionPdf(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => pdfRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-primary/[0.08] text-primary text-sm font-medium hover:bg-primary/[0.12] transition-colors border border-primary/15"
          >
            <Upload className="h-4 w-4" />
            Ανέβασμα Δελτίου Αυτοψίας
          </button>
        )}
      </Card>

      {/* ΣΧΟΛΙΑ */}
      <Card className="p-5 space-y-3.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Σχόλια
          </Label>
        </div>
        <p className="text-[11px] text-muted-foreground italic leading-relaxed">
          "Αν δεν ανεβάσετε όλα τα αρχεία, πρέπει οπωσδήποτε να γράψετε τον λόγο στο πεδίο ΣΧΟΛΙΑ".
        </p>
        <Textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="Σχόλια αυτοψίας..."
          rows={4}
          className="text-sm rounded-xl bg-muted/30 border-border/60 focus-visible:bg-card transition-colors resize-none"
        />
      </Card>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full h-12 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground text-sm font-semibold tracking-wide shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.4)] hover:shadow-[0_6px_20px_-4px_hsl(var(--primary)/0.5)] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting ? "Υποβολή..." : "Υποβολή Αυτοψίας"}
      </button>
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
  isCompressing?: boolean;
  compressionStats?: { original: number; compressed: number };
  
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
  isCompressing,
  compressionStats,
  
}: FileUploadSectionProps) => {
  const savings = compressionStats
    ? Math.round((1 - compressionStats.compressed / compressionStats.original) * 100)
    : 0;

  return (
    <Card className="p-5 space-y-3.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Ανεβάστε έως {MAX_FILES} αρχεία.
      </p>

      {/* Compression loading state */}
      {isCompressing && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-xs font-medium text-muted-foreground">
            Συμπίεση φωτογραφιών...
          </span>
        </div>
      )}

      {/* Compression stats */}
      {compressionStats && !isCompressing && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-accent/8 text-xs text-muted-foreground border border-accent/15">
          <FileImage className="h-3.5 w-3.5 text-accent shrink-0" />
          <span>
            {formatFileSize(compressionStats.original)} → {formatFileSize(compressionStats.compressed)}{" "}
            <span className="font-semibold text-accent">(-{savings}%)</span>
          </span>
        </div>
      )}

      {/* Thumbnails */}
      {files.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative group">
              <img
                src={f.preview}
                alt={f.file.name}
                className="h-20 w-full object-cover rounded-xl border border-border/60 shadow-sm"
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length < MAX_FILES && !isCompressing && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-primary/[0.08] text-primary text-xs font-medium hover:bg-primary/[0.12] transition-colors border border-primary/15"
          >
            <Upload className="h-3.5 w-3.5" />
            Προσθήκη αρχείου
          </button>
          {capture && (
            <button
              type="button"
              onClick={() => {
                const inp = document.createElement("input");
                inp.type = "file";
                inp.accept = "image/*";
                inp.capture = "environment";
                inp.onchange = () => onAdd(inp.files);
                inp.click();
              }}
              className="flex-1 flex items-center justify-center gap-1.5 h-10 rounded-xl bg-accent/[0.08] text-accent text-xs font-medium hover:bg-accent/[0.12] transition-colors border border-accent/15"
            >
              <Camera className="h-3.5 w-3.5" />
              Κάμερα
            </button>
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
};

export default SurveyForm;
