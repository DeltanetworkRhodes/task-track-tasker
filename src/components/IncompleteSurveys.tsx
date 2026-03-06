// Survey file management component
import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Camera, Upload, X, ChevronDown, ChevronUp, Loader2, FileCheck, FileWarning, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface FileUpload {
  file: File;
  preview: string;
}

const MAX_FILES = 10;

const REQUIRED_TYPES = [
  { key: "building_photo", label: "Φωτογραφίες Κτιρίου" },
  { key: "screenshot", label: "Screenshots (ΧΕΜΔ & AutoCAD)" },
  { key: "inspection_form", label: "Έντυπο Αυτοψίας" },
];

const IncompleteSurveys = ({ filterSrId }: { filterSrId?: string }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Record<string, FileUpload[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Fetch surveys for this technician (incomplete OR completed for editing)
  const { data: surveys, isLoading } = useQuery({
    queryKey: ["incomplete-surveys", user?.id, filterSrId],
    queryFn: async () => {
      let query = supabase
        .from("surveys")
        .select("*, survey_files(*)")
        .eq("technician_id", user!.id)
        .order("created_at", { ascending: false });
      if (filterSrId) {
        query = query.eq("sr_id", filterSrId);
      } else {
        // Only show incomplete when not filtering by SR
        query = query.eq("status", "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ");
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!surveys || surveys.length === 0) {
    return null;
  }

  const getMissingTypes = (survey: any) => {
    const existingTypes = new Set(
      (survey.survey_files || []).map((f: any) => f.file_type)
    );
    return REQUIRED_TYPES.filter((t) => !existingTypes.has(t.key));
  };

  const isIncomplete = (survey: any) => survey.status === "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ";

  const handleFiles = (
    surveyId: string,
    fileType: string,
    files: FileList | null
  ) => {
    if (!files) return;
    const key = `${surveyId}_${fileType}`;
    const current = uploads[key] || [];
    const remaining = MAX_FILES - current.length;
    const newFiles = Array.from(files)
      .slice(0, remaining)
      .map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));
    setUploads((prev) => ({ ...prev, [key]: [...current, ...newFiles] }));
  };

  const removeFile = (surveyId: string, fileType: string, index: number) => {
    const key = `${surveyId}_${fileType}`;
    const current = uploads[key] || [];
    URL.revokeObjectURL(current[index].preview);
    setUploads((prev) => ({
      ...prev,
      [key]: current.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (survey: any) => {
    const filesToUpload: { fileType: string; files: FileUpload[] }[] = [];

    for (const t of REQUIRED_TYPES) {
      const key = `${survey.id}_${t.key}`;
      const f = uploads[key] || [];
      if (f.length > 0) {
        filesToUpload.push({ fileType: t.key, files: f });
      }
    }

    if (filesToUpload.length === 0) {
      toast.error("Προσθέστε τουλάχιστον ένα αρχείο");
      return;
    }

    setSubmitting(true);
    try {
      // Upload files to storage and create records
      const allFileRecords: { file_path: string; file_name: string; file_type: string; survey_id: string }[] = [];

      for (const group of filesToUpload) {
        for (const f of group.files) {
          const ext = f.file.name.split(".").pop();
          const path = `${user!.id}/${survey.id}/${group.fileType}/${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage.from("surveys").upload(path, f.file);
          if (error) {
            console.error("Upload error:", error);
            continue;
          }
          allFileRecords.push({
            file_path: path,
            file_name: f.file.name,
            file_type: group.fileType,
            survey_id: survey.id,
          });
        }
      }

      if (allFileRecords.length > 0) {
        const { error: filesError } = await supabase
          .from("survey_files")
          .insert(allFileRecords);
        if (filesError) console.error("Files record error:", filesError);
      }

      toast.success("Τα αρχεία ανέβηκαν επιτυχώς!");

      // Trigger automation to re-check completeness
      try {
        const { data: result, error: procError } = await supabase.functions.invoke(
          "process-survey-completion",
          {
            body: {
              survey_id: survey.id,
              sr_id: survey.sr_id,
              area: survey.area,
            },
          }
        );
        if (procError) {
          console.error("Process survey error:", procError);
        } else if (result) {
          if (result.is_complete) {
            toast.success(`Ολοκληρωμένη αυτοψία → ${result.drive_target || "Drive"} + email`);
            // Auto-advance assignment to construction
            try {
              const { data: assignmentData } = await supabase
                .from("assignments")
                .select("id, status")
                .eq("sr_id", survey.sr_id)
                .eq("technician_id", user!.id)
                .maybeSingle();

              if (assignmentData && assignmentData.status !== "completed" && assignmentData.status !== "cancelled") {
                await supabase
                  .from("assignments")
                  .update({ status: "construction" })
                  .eq("id", assignmentData.id);
                toast.success("Πλήρης αυτοψία → Εντολή Κατασκευής");
                queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
              }
            } catch (statusErr) {
              console.error("Auto status update error:", statusErr);
            }
          } else {
            toast.info(
              `Ακόμα ελλιπής. Λείπουν: ${(result.missing_types || []).length} τύποι αρχείων`
            );
          }
        }
      } catch (autoErr) {
        console.error("Automation error:", autoErr);
      }

      // Cleanup
      for (const key of Object.keys(uploads)) {
        if (key.startsWith(survey.id)) {
          (uploads[key] || []).forEach((f) => URL.revokeObjectURL(f.preview));
        }
      }
      setUploads((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (key.startsWith(survey.id)) delete next[key];
        }
        return next;
      });

      queryClient.invalidateQueries({ queryKey: ["incomplete-surveys"] });
      queryClient.invalidateQueries({ queryKey: ["surveys"] });
    } catch (err: any) {
      console.error(err);
      toast.error("Σφάλμα: " + (err.message || "Δοκιμάστε ξανά"));
    } finally {
      setSubmitting(false);
    }
  };

  // When filtering by SR (inside detail sheet), render content directly without Card/header wrapper
  if (filterSrId && surveys.length > 0) {
    const survey = surveys[0];
    const missingTypes = getMissingTypes(survey);
    const existingTypes = new Set(
      (survey.survey_files || []).map((f: any) => f.file_type)
    );

    return (
      <Card className="p-4 space-y-4 border-border/60 bg-card/80 backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {missingTypes.length > 0 ? (
              <div className="h-8 w-8 rounded-lg bg-warning/10 flex items-center justify-center">
                <FileWarning className="h-4 w-4 text-warning" />
              </div>
            ) : (
              <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center">
                <FileCheck className="h-4 w-4 text-accent" />
              </div>
            )}
            <div>
              <h3 className="text-sm font-bold text-foreground">Αρχεία Αυτοψίας</h3>
              <p className="text-[10px] text-muted-foreground">
                {missingTypes.length > 0 ? `${3 - missingTypes.length}/3 αρχεία` : "Όλα τα αρχεία"}
              </p>
            </div>
          </div>
          <Badge variant="outline" className={`text-[10px] font-semibold ${
            missingTypes.length > 0
              ? "bg-warning/10 text-warning border-warning/20"
              : "bg-accent/10 text-accent border-accent/20"
          }`}>
            {missingTypes.length > 0 ? `${missingTypes.length} λείπουν` : "Πλήρη ✓"}
          </Badge>
        </div>

        {/* Files checklist */}
        <div className="rounded-lg border border-border/50 overflow-hidden divide-y divide-border/50">
          {REQUIRED_TYPES.map((t) => {
            const exists = existingTypes.has(t.key);
            return (
              <div key={t.key} className={`flex items-center gap-3 px-3 py-2.5 text-xs transition-colors ${
                exists ? "bg-accent/5" : "bg-destructive/5"
              }`}>
                <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  exists
                    ? "bg-accent/20 text-accent"
                    : "bg-destructive/20 text-destructive"
                }`}>
                  {exists ? "✓" : "✗"}
                </div>
                <span className="font-bold text-foreground">
                  {t.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Upload sections for missing types */}
        {missingTypes.length > 0 && (
          <div className="space-y-3 pt-1">
            {missingTypes.map((mt) => {
              const key = `${survey.id}_${mt.key}`;
              const files = uploads[key] || [];
              const inputKey = `input_${key}`;
              const acceptsCapture = mt.key !== "screenshot";

              return (
                <div key={mt.key} className="space-y-2 rounded-lg border border-dashed border-warning/30 bg-warning/5 p-3">
                  <Label className="text-xs font-semibold text-warning flex items-center gap-1.5">
                    <ImagePlus className="h-3.5 w-3.5" />
                    {mt.label}
                  </Label>

                  {files.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {files.map((f, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={f.preview}
                            alt={f.file.name}
                            className="h-16 w-full object-cover rounded-lg border border-border"
                          />
                          <button
                            type="button"
                            onClick={() => removeFile(survey.id, mt.key, i)}
                            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs border-warning/30 text-warning hover:bg-warning/10"
                      onClick={() => inputRefs.current[inputKey]?.click()}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Αρχείο
                    </Button>
                    {acceptsCapture && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs border-warning/30 text-warning hover:bg-warning/10"
                        onClick={() => {
                          const inp = document.createElement("input");
                          inp.type = "file";
                          inp.accept = "image/*";
                          inp.capture = "environment";
                          inp.onchange = () =>
                            handleFiles(survey.id, mt.key, inp.files);
                          inp.click();
                        }}
                      >
                        <Camera className="h-3.5 w-3.5" />
                        Κάμερα
                      </Button>
                    )}
                  </div>

                  <input
                    ref={(el) => {
                      inputRefs.current[inputKey] = el;
                    }}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleFiles(survey.id, mt.key, e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
              );
            })}

            <Button
              onClick={() => handleSubmit(survey)}
              disabled={submitting}
              className="w-full text-xs font-bold py-5 gap-2"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {submitting ? "Ανέβασμα..." : "Συμπλήρωση Αρχείων"}
            </Button>
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileWarning className="h-4 w-4 text-warning" />
        <h3 className="text-sm font-bold text-foreground">
          Ελλιπείς Αυτοψίες ({surveys.length})
        </h3>
      </div>

      {surveys.map((survey: any) => {
        const isExpanded = expandedId === survey.id;
        const missingTypes = getMissingTypes(survey);
        const existingTypes = new Set(
          (survey.survey_files || []).map((f: any) => f.file_type)
        );

        return (
          <Card key={survey.id} className="overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : survey.id)}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {survey.sr_id}
                  </span>
                  {missingTypes.length > 0 ? (
                    <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-600 border-orange-500/20">
                      {missingTypes.length} λείπουν
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/20">
                      Πλήρη
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {survey.area} · {new Date(survey.created_at).toLocaleDateString("el-GR")}
                </p>
              </div>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </button>

            {isExpanded && (
              <div className="border-t border-border p-3 space-y-4">
                {/* Show existing files */}
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Υπάρχοντα αρχεία
                  </p>
                  {REQUIRED_TYPES.map((t) => (
                    <div key={t.key} className="flex items-center gap-2 text-xs">
                      {existingTypes.has(t.key) ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-destructive">✗</span>
                      )}
                      <span className={existingTypes.has(t.key) ? "text-muted-foreground" : "text-foreground font-medium"}>
                        {t.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Upload sections for missing types */}
                {missingTypes.map((mt) => {
                  const key = `${survey.id}_${mt.key}`;
                  const files = uploads[key] || [];
                  const inputKey = `input_${key}`;
                  const acceptsCapture = mt.key !== "screenshot";

                  return (
                    <div key={mt.key} className="space-y-2">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-destructive">
                        ↑ {mt.label}
                      </Label>

                      {files.length > 0 && (
                        <div className="grid grid-cols-4 gap-2">
                          {files.map((f, i) => (
                            <div key={i} className="relative group">
                              <img
                                src={f.preview}
                                alt={f.file.name}
                                className="h-16 w-full object-cover rounded-lg border border-border"
                              />
                              <button
                                type="button"
                                onClick={() => removeFile(survey.id, mt.key, i)}
                                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => inputRefs.current[inputKey]?.click()}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Αρχείο
                        </Button>
                        {acceptsCapture && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => {
                              const inp = document.createElement("input");
                              inp.type = "file";
                              inp.accept = "image/*";
                              inp.capture = "environment";
                              inp.onchange = () =>
                                handleFiles(survey.id, mt.key, inp.files);
                              inp.click();
                            }}
                          >
                            <Camera className="h-3.5 w-3.5" />
                            Κάμερα
                          </Button>
                        )}
                      </div>

                      <input
                        ref={(el) => {
                          inputRefs.current[inputKey] = el;
                        }}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          handleFiles(survey.id, mt.key, e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  );
                })}

                <Button
                  onClick={() => handleSubmit(survey)}
                  disabled={submitting}
                  className="w-full text-xs font-bold py-5"
                >
                  {submitting ? "Ανέβασμα..." : "Συμπλήρωση Αρχείων"}
                </Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default IncompleteSurveys;
