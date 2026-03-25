import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useWorkCategories, useMyCrewAssignments, useCrewPhotos } from "@/hooks/useCrewData";
import { compressImage } from "@/lib/imageCompression";
import { applyWatermark, type WatermarkData } from "@/lib/watermark";
import { uploadPhotoDrive } from "@/lib/driveUpload";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, Camera, FolderOpen, X, Wrench, Ruler } from "lucide-react";

interface Props {
  assignment: any;
}

const CrewWorkPanel = ({ assignment }: Props) => {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const { data: categories, isLoading: catLoading } = useWorkCategories();
  const { data: myAssignments, isLoading: crewLoading } = useMyCrewAssignments(assignment?.id);

  const [activeTab, setActiveTab] = useState<string>("");

  if (catLoading || crewLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-muted-foreground text-xs">
        <Loader2 className="h-4 w-4 animate-spin" />
        Φόρτωση εργασιών...
      </div>
    );
  }

  if (!myAssignments || myAssignments.length === 0) {
    return (
      <Card className="p-6 text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Δεν έχεις ανατεθεί σε αυτό το SR ακόμα.
        </p>
        <p className="text-xs text-muted-foreground">
          Επικοινώνησε με τον admin.
        </p>
      </Card>
    );
  }

  // Match categories to assignments
  const assignedCategories = myAssignments
    .map((ca: any) => {
      const cat = (categories || []).find((c: any) => c.id === ca.category_id);
      return cat ? { ...ca, category: cat } : null;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.category.sort_order - b.category.sort_order);

  if (assignedCategories.length === 0) return null;

  // Single category → show directly, multiple → tabs
  const defaultTab = activeTab || assignedCategories[0]?.category_id;

  if (assignedCategories.length === 1) {
    return (
      <div className="space-y-4">
        <CrewCategoryForm
          crewAssignment={assignedCategories[0]}
          assignment={assignment}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={defaultTab} onValueChange={setActiveTab}>
        <TabsList className="w-full flex-wrap h-auto gap-1 p-1">
          {assignedCategories.map((ca: any) => (
            <TabsTrigger key={ca.category_id} value={ca.category_id} className="text-[11px] gap-1 px-2 py-1.5">
              {ca.category.name}
              {ca.status === "saved" ? " ✅" : ca.status === "in_progress" ? " 🔵" : " ⏳"}
            </TabsTrigger>
          ))}
        </TabsList>
        {assignedCategories.map((ca: any) => (
          <TabsContent key={ca.category_id} value={ca.category_id}>
            <CrewCategoryForm
              crewAssignment={ca}
              assignment={assignment}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

// ═══════ Per-category form ═══════
const CrewCategoryForm = ({ crewAssignment, assignment }: { crewAssignment: any; assignment: any }) => {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const category = crewAssignment.category;
  const photoCategories: string[] = category.photo_categories || [];

  const [notes, setNotes] = useState(crewAssignment.notes || "");
  const [measurements, setMeasurements] = useState<Record<string, string>>(
    crewAssignment.measurements || {}
  );
  const [saving, setSaving] = useState(false);

  // Photos state per photo_category
  const [photos, setPhotos] = useState<Record<string, File[]>>({});
  const [previews, setPreviews] = useState<Record<string, string[]>>({});
  const [uploading, setUploading] = useState(false);
  const [activePhotoTab, setActivePhotoTab] = useState(photoCategories[0] || "");

  const galleryRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Load existing photos
  const { data: existingPhotos } = useCrewPhotos(crewAssignment.id);

  const handlePhotoSelect = async (photoCat: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);

    const wmData: WatermarkData = {
      srId: assignment?.sr_id || "—",
      address: assignment?.address || undefined,
      latitude: assignment?.latitude,
      longitude: assignment?.longitude,
      datetime: new Date(),
    };

    const processed: File[] = [];
    const newPreviews: string[] = [];

    for (const f of fileArr) {
      const compressed = await compressImage(f);
      const watermarked = await applyWatermark(compressed, wmData);
      processed.push(watermarked);
      const preview = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.readAsDataURL(watermarked);
      });
      newPreviews.push(preview);
    }

    setPhotos(prev => ({ ...prev, [photoCat]: [...(prev[photoCat] || []), ...processed] }));
    setPreviews(prev => ({ ...prev, [photoCat]: [...(prev[photoCat] || []), ...newPreviews] }));
  };

  const removePhoto = (photoCat: string, index: number) => {
    setPhotos(prev => ({ ...prev, [photoCat]: (prev[photoCat] || []).filter((_, i) => i !== index) }));
    setPreviews(prev => ({ ...prev, [photoCat]: (prev[photoCat] || []).filter((_, i) => i !== index) }));
  };

  const totalNewPhotos = Object.values(photos).reduce((sum, arr) => sum + arr.length, 0);

  const handleSave = async () => {
    if (!user || !organizationId) return;
    setSaving(true);
    try {
      // Upload photos
      if (totalNewPhotos > 0) {
        setUploading(true);
        const safeSrId = (assignment.sr_id || "").replace(/[^a-zA-Z0-9_-]/g, "_");
        const catName = (category.name || "").replace(/[^a-zA-Z0-9_-]/g, "_");

        for (const [photoCat, files] of Object.entries(photos)) {
          for (let i = 0; i < files.length; i++) {
            const photo = files[i];
            const ext = photo.name.split(".").pop() || "jpg";
            const storagePath = `sr-crews/${organizationId}/${assignment.id}/${catName}/${photoCat}_${Date.now()}_${i}.${ext}`;

            const { error: uploadErr } = await supabase.storage
              .from("photos")
              .upload(storagePath, photo, { upsert: true });
            if (uploadErr) {
              console.error("Photo upload error:", uploadErr);
              continue;
            }

            await supabase.from("sr_crew_photos" as any).insert({
              crew_assignment_id: crewAssignment.id,
              organization_id: organizationId,
              storage_path: storagePath,
              photo_category: photoCat,
              uploaded_by: user.id,
            });
          }
        }
        setUploading(false);
      }

      // Update crew assignment
      const { error } = await supabase
        .from("sr_crew_assignments" as any)
        .update({
          status: "saved",
          notes: notes.trim() || null,
          measurements: category.requires_measurements ? measurements : null,
          saved_at: new Date().toISOString(),
          saved_by: user.id,
        })
        .eq("id", crewAssignment.id);
      if (error) throw error;

      toast.success("✅ Αποθηκεύτηκε!");

      // Push notification to admin (fire and forget)
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();

      // Notify admins
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin" as any);

      for (const admin of (adminRoles || [])) {
        supabase.functions.invoke("send-push-notification", {
          body: {
            userId: admin.user_id,
            title: `SR ${assignment.sr_id}: ${category.name} ✅`,
            body: `Αποθηκεύτηκε από ${profile?.full_name || "τεχνικό"}`,
            data: { assignmentId: assignment.id },
          },
        }).catch(console.error);
      }

      // Reset local photos state
      setPhotos({});
      setPreviews({});

      queryClient.invalidateQueries({ queryKey: ["sr_crew_assignments_mine"] });
      queryClient.invalidateQueries({ queryKey: ["sr_crew_assignments"] });
      queryClient.invalidateQueries({ queryKey: ["sr_crew_photos"] });
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα αποθήκευσης");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wrench className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold">{category.name}</h3>
        {crewAssignment.status === "saved" && (
          <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-600 border-green-500/20">
            Αποθηκεύτηκε
          </Badge>
        )}
      </div>

      {/* Photos section */}
      {photoCategories.length > 0 && (
        <Card className="p-3 space-y-3">
          <div className="flex items-center gap-1.5">
            <Camera className="h-3.5 w-3.5 text-muted-foreground" />
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Φωτογραφίες
            </Label>
          </div>

          {photoCategories.length > 1 ? (
            <Tabs value={activePhotoTab} onValueChange={setActivePhotoTab}>
              <TabsList className="h-auto flex-wrap gap-1 p-1">
                {photoCategories.map((pc) => (
                  <TabsTrigger key={pc} value={pc} className="text-[10px] px-2 py-1">
                    {pc}
                    {((photos[pc] || []).length + (existingPhotos || []).filter((p: any) => p.photo_category === pc).length) > 0 && (
                      <Badge variant="secondary" className="ml-1 text-[8px] h-4 px-1">
                        {(photos[pc] || []).length + (existingPhotos || []).filter((p: any) => p.photo_category === pc).length}
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              {photoCategories.map((pc) => (
                <TabsContent key={pc} value={pc}>
                  <PhotoUploadArea
                    photoCat={pc}
                    newPhotos={photos[pc] || []}
                    newPreviews={previews[pc] || []}
                    existingPhotos={(existingPhotos || []).filter((p: any) => p.photo_category === pc)}
                    onSelect={(files) => handlePhotoSelect(pc, files)}
                    onRemove={(i) => removePhoto(pc, i)}
                    galleryRef={(el) => { galleryRefs.current[pc] = el; }}
                    cameraRef={(el) => { cameraRefs.current[pc] = el; }}
                    onGalleryClick={() => galleryRefs.current[pc]?.click()}
                    onCameraClick={() => cameraRefs.current[pc]?.click()}
                  />
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <PhotoUploadArea
              photoCat={photoCategories[0]}
              newPhotos={photos[photoCategories[0]] || []}
              newPreviews={previews[photoCategories[0]] || []}
              existingPhotos={(existingPhotos || []).filter((p: any) => p.photo_category === photoCategories[0])}
              onSelect={(files) => handlePhotoSelect(photoCategories[0], files)}
              onRemove={(i) => removePhoto(photoCategories[0], i)}
              galleryRef={(el) => { galleryRefs.current[photoCategories[0]] = el; }}
              cameraRef={(el) => { cameraRefs.current[photoCategories[0]] = el; }}
              onGalleryClick={() => galleryRefs.current[photoCategories[0]]?.click()}
              onCameraClick={() => cameraRefs.current[photoCategories[0]]?.click()}
            />
          )}
        </Card>
      )}

      {/* OTDR Measurements */}
      {category.requires_measurements && (
        <Card className="p-3 space-y-3">
          <div className="flex items-center gap-1.5">
            <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Μετρήσεις OTDR
            </Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Μήκος ίνας (μ)</Label>
              <Input
                type="number"
                step="0.1"
                value={measurements.fiber_length || ""}
                onChange={(e) => setMeasurements(prev => ({ ...prev, fiber_length: e.target.value }))}
                placeholder="0"
                className="text-sm mt-1 h-8"
              />
            </div>
            <div>
              <Label className="text-xs">Απώλεια (dB)</Label>
              <Input
                type="number"
                step="0.01"
                value={measurements.loss_db || ""}
                onChange={(e) => setMeasurements(prev => ({ ...prev, loss_db: e.target.value }))}
                placeholder="0"
                className="text-sm mt-1 h-8"
              />
            </div>
          </div>
        </Card>
      )}

      {/* Notes */}
      <Card className="p-3 space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Σημειώσεις
        </Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Σημειώσεις..."
          className="text-xs min-h-[60px]"
        />
      </Card>

      {/* Save button */}
      <Button onClick={handleSave} disabled={saving || uploading} className="w-full gap-2 py-5">
        {saving || uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {uploading ? "Ανέβασμα φωτογραφιών..." : "Αποθήκευση..."}
          </>
        ) : (
          <>
            <Save className="h-4 w-4" />
            Αποθήκευση
          </>
        )}
      </Button>
    </div>
  );
};

// ═══════ Photo upload area with gallery + camera buttons ═══════
const PhotoUploadArea = ({
  photoCat,
  newPhotos,
  newPreviews,
  existingPhotos,
  onSelect,
  onRemove,
  galleryRef,
  cameraRef,
  onGalleryClick,
  onCameraClick,
}: {
  photoCat: string;
  newPhotos: File[];
  newPreviews: string[];
  existingPhotos: any[];
  onSelect: (files: FileList | null) => void;
  onRemove: (index: number) => void;
  galleryRef: (el: HTMLInputElement | null) => void;
  cameraRef: (el: HTMLInputElement | null) => void;
  onGalleryClick: () => void;
  onCameraClick: () => void;
}) => {
  return (
    <div className="space-y-2">
      {/* Existing photos from DB */}
      {existingPhotos.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {existingPhotos.map((p: any) => (
            <div key={p.id} className="relative">
              <div className="w-full h-16 rounded border border-border bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                📸
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New photo previews */}
      {newPreviews.length > 0 && (
        <div className="grid grid-cols-4 gap-1.5">
          {newPreviews.map((preview, i) => (
            <div key={i} className="relative group">
              <img
                src={preview}
                alt={`${photoCat} ${i + 1}`}
                className="w-full h-16 object-cover rounded border border-border"
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hidden inputs */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => { onSelect(e.target.files); e.target.value = ""; }}
        className="hidden"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => { onSelect(e.target.files); e.target.value = ""; }}
        className="hidden"
      />

      {/* Buttons */}
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" className="flex-1 gap-1.5 text-[11px] h-8" onClick={onGalleryClick}>
          <FolderOpen className="h-3.5 w-3.5" />
          Από γκαλερί
        </Button>
        <Button type="button" variant="outline" size="sm" className="flex-1 gap-1.5 text-[11px] h-8" onClick={onCameraClick}>
          <Camera className="h-3.5 w-3.5" />
          Κάμερα
        </Button>
      </div>
    </div>
  );
};

export default CrewWorkPanel;
