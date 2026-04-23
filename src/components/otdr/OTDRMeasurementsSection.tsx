import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, Upload, FileDown, Trash2, Loader2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  computeExpectedOTDR,
  matchMeasurements,
  type MeasurementStatus,
} from "@/lib/otdrExpectedMeasurements";

interface OTDRMeasurementsSectionProps {
  assignmentId: string;
  constructionId?: string;
  organizationId: string;
  floors?: number;
  hasBcp?: boolean;
  floorDetails?: any[];
}

export function OTDRMeasurementsSection({
  assignmentId,
  constructionId,
  organizationId,
  floors = 0,
  hasBcp = false,
  floorDetails = [],
}: OTDRMeasurementsSectionProps) {
  const queryClient = useQueryClient();
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const { data: uploaded = [] } = useQuery({
    queryKey: ["otdr_measurements", assignmentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("otdr_measurements" as any)
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("uploaded_at", { ascending: false });
      return (data as any[]) || [];
    },
    enabled: !!assignmentId,
  });

  const expected = computeExpectedOTDR({
    floors,
    has_bcp: hasBcp,
    floor_details: floorDetails,
  });

  const statuses = matchMeasurements(expected, uploaded);
  const doneCount = statuses.filter((s) => s.status === "done").length;
  const totalCount = statuses.length;
  const percent = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  const uploadFile = async (file: File, point: MeasurementStatus["expected"]) => {
    const key = `${point.point_type}_${point.floor_number ?? ""}_${point.fb_index ?? ""}`;
    setUploadingKey(key);

    try {
      if (!file.name.toLowerCase().endsWith(".sor")) {
        toast.error("Μόνο .sor αρχεία επιτρέπονται");
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        toast.error("Δεν είσαι συνδεδεμένος");
        return;
      }

      const timestamp = Date.now();
      const filePath = `${organizationId}/${assignmentId}/${point.point_type}_${
        point.floor_number ?? "none"
      }_${point.fb_index ?? "none"}_${timestamp}.sor`;

      const { error: uploadError } = await supabase.storage
        .from("otdr-sor-files")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = await supabase.storage
        .from("otdr-sor-files")
        .createSignedUrl(filePath, 60 * 60 * 24 * 365);

      const { error: insertError } = await supabase
        .from("otdr_measurements" as any)
        .upsert(
          {
            organization_id: organizationId,
            assignment_id: assignmentId,
            construction_id: constructionId,
            point_type: point.point_type,
            floor_number: point.floor_number ?? null,
            fb_index: point.fb_index ?? null,
            label: point.label,
            sor_file_url: urlData?.signedUrl || "",
            sor_file_name: file.name,
            sor_file_size_bytes: file.size,
            uploaded_by: userId,
          },
          {
            onConflict: "assignment_id,point_type,floor_number,fb_index",
          }
        );

      if (insertError) throw insertError;

      toast.success(`✅ ${point.label} αποθηκεύτηκε`);
      if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
      queryClient.invalidateQueries({ queryKey: ["otdr_measurements", assignmentId] });
    } catch (err: any) {
      console.error("OTDR upload error:", err);
      toast.error(`Σφάλμα: ${err.message}`);
    } finally {
      setUploadingKey(null);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (measurementId: string) => {
      const { error } = await supabase
        .from("otdr_measurements" as any)
        .delete()
        .eq("id", measurementId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Η μέτρηση διαγράφηκε");
      queryClient.invalidateQueries({ queryKey: ["otdr_measurements", assignmentId] });
    },
    onError: (err: any) => {
      toast.error(`Σφάλμα διαγραφής: ${err.message}`);
    },
  });

  const grouped = {
    basic: statuses.filter((s) =>
      ["CABIN", "LIVE", "BEP", "BCP"].includes(s.expected.point_type)
    ),
    bmo: statuses.filter((s) => s.expected.point_type === "BMO"),
    fb: statuses.filter((s) => s.expected.point_type === "FLOOR_BOX"),
  };

  return (
    <div className="space-y-6">
      {/* Header με progress */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Μετρήσεις OTDR</h3>
          </div>
          <Badge variant={percent === 100 ? "default" : "secondary"}>
            {doneCount}/{totalCount} ολοκληρωμένες
          </Badge>
        </div>

        <Progress value={percent} className="h-2" />

        {percent < 100 && (
          <p className="text-sm text-muted-foreground">
            Λείπουν {totalCount - doneCount} μετρήσεις. Ανέβασε SOR αρχεία από το OTDR.
          </p>
        )}
        {percent === 100 && (
          <p className="text-sm text-primary font-medium">
            ✅ Όλες οι μετρήσεις έχουν ανέβει
          </p>
        )}
      </div>

      {/* Basic measurements */}
      <MeasurementGroup
        title="Βασικές Μετρήσεις"
        items={grouped.basic}
        onUpload={uploadFile}
        onDelete={(id) => deleteMutation.mutate(id)}
        uploadingKey={uploadingKey}
      />

      {/* BMO per floor */}
      {grouped.bmo.length > 0 && (
        <MeasurementGroup
          title={`BMO (${grouped.bmo.filter((s) => s.status === "done").length}/${
            grouped.bmo.length
          } όροφοι)`}
          items={grouped.bmo}
          onUpload={uploadFile}
          onDelete={(id) => deleteMutation.mutate(id)}
          uploadingKey={uploadingKey}
        />
      )}

      {/* Floor Boxes */}
      {grouped.fb.length > 0 && (
        <MeasurementGroup
          title={`Floor Boxes (${grouped.fb.filter((s) => s.status === "done").length}/${
            grouped.fb.length
          })`}
          items={grouped.fb}
          onUpload={uploadFile}
          onDelete={(id) => deleteMutation.mutate(id)}
          uploadingKey={uploadingKey}
        />
      )}

      {/* Help */}
      <div className="rounded-md bg-muted/50 p-4 text-sm space-y-2">
        <p className="font-medium">💡 Πώς ανεβάζω SOR από το FHO5000:</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>Στο OTDR: File → Save σε USB stick ως .sor</li>
          <li>Σύνδεσε USB → κινητό με USB-C OTG adapter</li>
          <li>Πάτα "Upload SOR" και επέλεξε το αρχείο</li>
          <li>Κάνε το ίδιο για κάθε σημείο μέτρησης</li>
        </ol>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────

interface MeasurementGroupProps {
  title: string;
  items: MeasurementStatus[];
  onUpload: (file: File, point: MeasurementStatus["expected"]) => Promise<void>;
  onDelete: (id: string) => void;
  uploadingKey: string | null;
}

function MeasurementGroup({
  title,
  items,
  onUpload,
  onDelete,
  uploadingKey,
}: MeasurementGroupProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </h4>
      </div>
      <div className="space-y-2">
        {items.map((s, idx) => {
          const key = `${s.expected.point_type}_${s.expected.floor_number ?? ""}_${
            s.expected.fb_index ?? ""
          }`;
          return (
            <MeasurementRow
              key={`${key}-${idx}`}
              status={s}
              onUpload={onUpload}
              onDelete={onDelete}
              isUploading={uploadingKey === key}
            />
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────

interface MeasurementRowProps {
  status: MeasurementStatus;
  onUpload: (file: File, point: MeasurementStatus["expected"]) => Promise<void>;
  onDelete: (id: string) => void;
  isUploading: boolean;
}

function MeasurementRow({ status, onUpload, onDelete, isUploading }: MeasurementRowProps) {
  const inputId = `otdr-${status.expected.point_type}-${
    status.expected.floor_number ?? "x"
  }-${status.expected.fb_index ?? "x"}`;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onUpload(file, status.expected);
    e.target.value = "";
  };

  return (
    <div
      className={`flex items-center gap-3 rounded-md border p-3 transition-colors ${
        status.status === "done"
          ? "bg-primary/5 border-primary/20"
          : "bg-card border-border"
      }`}
    >
      {/* Status icon */}
      {status.status === "done" ? (
        <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
      ) : (
        <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0" />
      )}

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">📊 {status.expected.label}</p>
        {status.uploaded && (
          <p className="text-xs text-muted-foreground truncate">
            {status.uploaded.sor_file_name}
          </p>
        )}
      </div>

      {/* Actions */}
      {status.status === "done" && status.uploaded ? (
        <div className="flex gap-1 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(status.uploaded!.sor_file_url, "_blank")}
            title="Λήψη"
          >
            <FileDown className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (confirm(`Διαγραφή μέτρησης "${status.expected.label}";`)) {
                onDelete(status.uploaded!.id);
              }
            }}
            title="Διαγραφή"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ) : (
        <>
          <input
            id={inputId}
            type="file"
            accept=".sor"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            size="sm"
            variant="default"
            onClick={() => document.getElementById(inputId)?.click()}
            disabled={isUploading}
            className="min-h-[40px] shrink-0"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Upload...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" /> Upload SOR
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
