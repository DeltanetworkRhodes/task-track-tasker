import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Camera, CheckCircle2, Loader2, Image, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { compressImage } from "@/lib/imageCompression";
import { applyWatermark, type WatermarkData } from "@/lib/watermark";

interface PreWorkChecklistProps {
  assignment: any;
  onChecklistComplete?: (completed: boolean) => void;
}

const PreWorkChecklist = ({ assignment, onChecklistComplete }: PreWorkChecklistProps) => {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localAccessConfirmed, setLocalAccessConfirmed] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: checklist, isLoading } = useQuery({
    queryKey: ["pre-work-checklist", assignment.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("pre_work_checklists" as any)
        .select("*")
        .eq("assignment_id", assignment.id)
        .maybeSingle();
      if (data) {
        setLocalAccessConfirmed(!!(data as any).access_confirmed);
        if ((data as any).photo_path) {
          const { data: urlData } = await supabase.storage
            .from("photos")
            .createSignedUrl((data as any).photo_path, 3600);
          if (urlData?.signedUrl) setPreviewUrl(urlData.signedUrl);
        }
      }
      return data as any;
    },
    enabled: !!assignment.id && !!user,
  });

  const isCompleted = checklist?.completed === true;
  const hasPhoto = !!checklist?.photo_path;
  const accessConfirmed = checklist?.access_confirmed === true;

  // Notify parent of completion state
  const notifyParent = (completed: boolean) => {
    onChecklistComplete?.(completed);
  };

  const handleAccessToggle = async (checked: boolean) => {
    if (!user) return;
    setLocalAccessConfirmed(checked);

    try {
      if (checklist) {
        await supabase
          .from("pre_work_checklists" as any)
          .update({
            access_confirmed: checked,
            access_confirmed_at: checked ? new Date().toISOString() : null,
            completed: checked && hasPhoto,
            completed_at: checked && hasPhoto ? new Date().toISOString() : null,
          } as any)
          .eq("id", checklist.id);
      } else {
        await supabase
          .from("pre_work_checklists" as any)
          .insert({
            assignment_id: assignment.id,
            technician_id: user.id,
            organization_id: organizationId,
            access_confirmed: checked,
            access_confirmed_at: checked ? new Date().toISOString() : null,
          } as any);
      }

      queryClient.invalidateQueries({ queryKey: ["pre-work-checklist", assignment.id] });
      notifyParent(checked && hasPhoto);
    } catch (err) {
      console.error("Checklist update error:", err);
      toast.error("Σφάλμα ενημέρωσης checklist");
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      // Compress
      let processed = await compressImage(file);

      // Watermark
      const wmData: WatermarkData = {
        srId: assignment.sr_id,
        address: assignment.address || "",
        latitude: assignment.latitude || 0,
        longitude: assignment.longitude || 0,
        datetime: new Date(),
      };
      processed = await applyWatermark(processed, wmData);

      const filePath = `pre-work/${assignment.id}/${Date.now()}_condition.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("photos")
        .upload(filePath, processed, { upsert: true });

      if (uploadError) throw uploadError;

      const now = new Date().toISOString();
      const isComplete = localAccessConfirmed;

      if (checklist) {
        // Remove old photo if exists
        if (checklist.photo_path) {
          await supabase.storage.from("photos").remove([checklist.photo_path]);
        }
        await supabase
          .from("pre_work_checklists" as any)
          .update({
            photo_path: filePath,
            photo_uploaded_at: now,
            completed: isComplete,
            completed_at: isComplete ? now : null,
          } as any)
          .eq("id", checklist.id);
      } else {
        await supabase
          .from("pre_work_checklists" as any)
          .insert({
            assignment_id: assignment.id,
            technician_id: user.id,
            organization_id: organizationId,
            photo_path: filePath,
            photo_uploaded_at: now,
            access_confirmed: localAccessConfirmed,
            access_confirmed_at: localAccessConfirmed ? now : null,
            completed: isComplete,
            completed_at: isComplete ? now : null,
          } as any);
      }

      // Get preview
      const { data: urlData } = await supabase.storage
        .from("photos")
        .createSignedUrl(filePath, 3600);
      if (urlData?.signedUrl) setPreviewUrl(urlData.signedUrl);

      queryClient.invalidateQueries({ queryKey: ["pre-work-checklist", assignment.id] });
      notifyParent(isComplete);
      toast.success("Φωτογραφία κατάστασης ανέβηκε");
    } catch (err: any) {
      console.error("Photo upload error:", err);
      toast.error("Σφάλμα upload φωτογραφίας");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (isLoading) {
    return (
      <Card className="p-4 border-amber-500/30 bg-amber-500/5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Φόρτωση checklist...
        </div>
      </Card>
    );
  }

  if (isCompleted) {
    return (
      <Card className="p-4 border-green-500/30 bg-green-500/5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <div>
            <p className="text-sm font-semibold text-green-700">Έλεγχος Πριν την Έναρξη — Ολοκληρώθηκε</p>
            <p className="text-xs text-green-600/80 mt-0.5">
              {checklist?.completed_at && `Ολοκληρώθηκε: ${new Date(checklist.completed_at).toLocaleString("el-GR")}`}
            </p>
          </div>
        </div>
        {previewUrl && (
          <img src={previewUrl} alt="Κατάσταση πριν" className="mt-3 rounded-lg max-h-32 object-cover w-full" />
        )}
      </Card>
    );
  }

  return (
    <Card className="p-4 border-amber-500/30 bg-amber-500/5 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-amber-600" />
        <div>
          <p className="text-sm font-bold text-amber-700">Έλεγχος Πριν την Έναρξη</p>
          <p className="text-xs text-amber-600/80">Υποχρεωτικό πριν ξεκινήσει η εργασία</p>
        </div>
      </div>

      {/* Checkbox */}
      <div className="flex items-start gap-3">
        <Checkbox
          id="access-confirm"
          checked={localAccessConfirmed}
          onCheckedChange={(checked) => handleAccessToggle(!!checked)}
          className="mt-0.5"
        />
        <Label htmlFor="access-confirm" className="text-xs leading-relaxed cursor-pointer normal-case tracking-normal font-normal">
          Επιβεβαίωση Πρόσβασης: Ο διαχειριστής/ιδιοκτήτης είναι ενήμερος και ο χώρος είναι προσβάσιμος.
        </Label>
      </div>

      {/* Photo upload */}
      <div className="space-y-2">
        <Label className="text-xs">
          Φωτογραφία Υπάρχουσας Κατάστασης
          <span className="text-destructive ml-1">*</span>
        </Label>
        <p className="text-[10px] text-muted-foreground -mt-1">
          Ζημιές / Ρωγμές / Λεβητοστάσιο — ΠΡΙΝ την εργασία
        </p>

        {previewUrl ? (
          <div className="relative">
            <img src={previewUrl} alt="Κατάσταση" className="rounded-lg max-h-40 object-cover w-full" />
            <Button
              size="icon"
              variant="destructive"
              className="absolute top-2 right-2 h-7 w-7"
              onClick={() => fileInputRef.current?.click()}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full gap-2 min-h-[44px] border-dashed border-amber-500/40 text-amber-700 hover:bg-amber-500/10"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Ανέβασμα...
              </>
            ) : (
              <>
                <Camera className="h-4 w-4" />
                Λήψη / Ανέβασμα Φωτογραφίας
              </>
            )}
          </Button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoUpload}
        />
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1 border-t border-amber-500/20">
        <span className={localAccessConfirmed ? "text-green-600 font-medium" : ""}>
          {localAccessConfirmed ? "✓ Πρόσβαση" : "○ Πρόσβαση"}
        </span>
        <span className={hasPhoto ? "text-green-600 font-medium" : ""}>
          {hasPhoto ? "✓ Φωτογραφία" : "○ Φωτογραφία"}
        </span>
      </div>
    </Card>
  );
};

export default PreWorkChecklist;
