import { useState, useRef, useCallback } from "react";

import { MapPin, Phone, Calendar, MessageSquare, Loader2, Eye, FileEdit, CheckCircle, Clock, HardHat, XCircle, Ban, Upload, FileSpreadsheet, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import SurveyForm from "@/components/SurveyForm";
import IncompleteSurveys from "@/components/IncompleteSurveys";
import ConstructionForm from "@/components/ConstructionForm";
import SRComments from "@/components/SRComments";

const statusFlow: { value: string; label: string }[] = [
  { value: "pending", label: "Αναμονή" },
  { value: "inspection", label: "Αυτοψία" },
  { value: "pre_committed", label: "Προδέσμευση" },
  { value: "waiting_ote", label: "Αναμονή ΟΤΕ" },
  { value: "construction", label: "Κατασκευή" },
  { value: "completed", label: "Ολοκληρώθηκε" },
  { value: "cancelled", label: "Ακυρωμένο" },
];

const statusLabels: Record<string, string> = Object.fromEntries(
  statusFlow.map((s) => [s.value, s.label])
);

const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  inspection: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  pre_committed: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  waiting_ote: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  construction: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  completed: "bg-green-500/10 text-green-600 border-green-500/20",
  cancelled: "bg-red-500/10 text-red-600 border-red-500/20",
};

interface Props {
  assignments: any[];
  loading: boolean;
}

const TechnicianAssignments = ({ assignments, loading }: Props) => {
  const { user } = useAuth();
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [showConstructionForm, setShowConstructionForm] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [uploadingGis, setUploadingGis] = useState(false);
  const gisFileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Fetch existing survey for selected assignment
  const { data: existingSurvey } = useQuery({
    queryKey: ["assignment-survey", selectedAssignment?.sr_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("surveys")
        .select("*")
        .eq("sr_id", selectedAssignment!.sr_id)
        .eq("technician_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!selectedAssignment && !!user,
  });

  // Fetch which assignments have GIS data (for card icons)
  const { data: gisAssignmentIds } = useQuery({
    queryKey: ["gis-assignment-ids", user?.id],
    queryFn: async () => {
      const ids = assignments.map((a: any) => a.id);
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("gis_data")
        .select("assignment_id")
        .in("assignment_id", ids);
      return (data || []).map((d: any) => d.assignment_id);
    },
    enabled: !!user && assignments.length > 0,
  });

  // Fetch GIS data for selected assignment
  const { data: existingGisData } = useQuery({
    queryKey: ["assignment-gis", selectedAssignment?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("gis_data")
        .select("*")
        .eq("assignment_id", selectedAssignment!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!selectedAssignment && !!user,
  });

  const handleGisUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAssignment) return;

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error("Μόνο αρχεία .XLSX γίνονται δεκτά");
      return;
    }

    setUploadingGis(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("assignment_id", selectedAssignment.id);
      formData.append("sr_id", selectedAssignment.sr_id);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/parse-gis-excel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed");

      toast.success(
        `GIS αναλύθηκε: ${result.parsed.floors} όροφοι, ${result.parsed.optical_paths} οπτικές διαδρομές`
      );
      queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-gis"] });
    } catch (err: any) {
      console.error("GIS upload error:", err);
      toast.error("Σφάλμα: " + (err.message || "Δοκιμάστε ξανά"));
    } finally {
      setUploadingGis(false);
      if (gisFileInputRef.current) gisFileInputRef.current.value = "";
    }
  };

  const handleStatusChange = async (assignmentId: string, newStatus: string, oldStatus: string) => {
    // Client-side guard: block construction without GIS
    if (newStatus === "construction") {
      const hasGis = gisAssignmentIds?.includes(assignmentId);
      if (!hasGis) {
        toast.error("Απαιτείται GIS αρχείο πριν τη μετάβαση σε Κατασκευή. Ανεβάστε πρώτα το GIS Excel.");
        return;
      }
    }

    setUpdating(assignmentId);

    // Optimistic update
    queryClient.setQueryData(["technician-assignments"], (old: any) =>
      old?.map((a: any) => a.id === assignmentId ? { ...a, status: newStatus, updated_at: new Date().toISOString() } : a)
    );

    try {
      const { error } = await supabase
        .from("assignments")
        .update({ status: newStatus })
        .eq("id", assignmentId);
      if (error) throw error;

      toast.success(`Κατάσταση → ${statusLabels[newStatus]}`);

      const assignment = assignments.find((a) => a.id === assignmentId);



      // Auto-fetch Drive folder URLs on pre_committed
      if (newStatus === "pre_committed" && assignment) {
        try {
          const { data: driveResult, error: driveErr } = await supabase.functions.invoke("google-drive-files", {
            body: { action: "sr_folder", sr_id: assignment.sr_id },
          });
          if (!driveErr && driveResult?.found) {
            const folderUrl = driveResult.folder?.webViewLink || null;
            const egrafaUrl = driveResult.subfolders?.["ΕΓΓΡΑΦΑ"]?.webViewLink || null;
            const promeletiUrl = driveResult.subfolders?.["ΠΡΟΜΕΛΕΤΗ"]?.webViewLink || null;

            await supabase
              .from("assignments")
              .update({
                drive_folder_url: folderUrl,
                drive_egrafa_url: egrafaUrl,
                drive_promeleti_url: promeletiUrl,
              })
              .eq("id", assignmentId);

            queryClient.setQueryData(["technician-assignments"], (old: any) =>
              old?.map((a: any) => a.id === assignmentId ? {
                ...a,
                drive_folder_url: folderUrl,
                drive_egrafa_url: egrafaUrl,
                drive_promeleti_url: promeletiUrl,
              } : a)
            );
            toast.success("Αρχεία Drive συνδέθηκαν αυτόματα");
          }
        } catch (driveFetchErr) {
          console.error("Drive auto-fetch error:", driveFetchErr);
        }
      }
    } catch (err: any) {
      // Rollback optimistic update
      queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
      toast.error(err.message || "Σφάλμα ενημέρωσης");
    } finally {
      setUpdating(null);
    }
  };

  const handleStartSurvey = async (assignment: any) => {
    if (assignment.status === "pending") {
      await handleStatusChange(assignment.id, "inspection", assignment.status);
    }
    setShowSurveyForm(true);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAssignment) return;
    e.target.value = "";
    setUploadingPdf(true);
    try {
      const filePath = `inspection-pdfs/${selectedAssignment.organization_id || "default"}/${selectedAssignment.sr_id}_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("surveys")
        .upload(filePath, file, { contentType: "application/pdf", upsert: true });
      if (uploadError) throw uploadError;

      const { data: signedData } = await supabase.storage
        .from("surveys")
        .createSignedUrl(filePath, 60 * 60 * 24 * 365);

      const { error: updateError } = await supabase
        .from("assignments")
        .update({ pdf_url: signedData?.signedUrl || filePath })
        .eq("id", selectedAssignment.id);
      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
      toast.success("Το δελτίο αυτοψίας ανέβηκε επιτυχώς");
    } catch (err: any) {
      console.error("PDF upload error:", err);
      toast.error("Σφάλμα κατά το ανέβασμα: " + err.message);
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleSurveyComplete = () => {
    setShowSurveyForm(false);
    setSelectedAssignment(null);
    queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
  };

  const handleCancelAssignment = async () => {
    if (!cancelReason.trim()) {
      toast.error("Παρακαλώ εισάγετε λόγο ακύρωσης");
      return;
    }
    if (!selectedAssignment) return;

    setCancelling(true);
    try {
      // 1. Update assignment status to cancelled with comment
      const { error } = await supabase
        .from("assignments")
        .update({
          status: "cancelled",
          comments: selectedAssignment.comments
            ? `${selectedAssignment.comments}\n\n[ΑΚΥΡΩΣΗ]: ${cancelReason}`
            : `[ΑΚΥΡΩΣΗ]: ${cancelReason}`,
        })
        .eq("id", selectedAssignment.id);
      if (error) throw error;

      // 2. Send cancellation email
      try {
        await supabase.functions.invoke("send-cancellation-email", {
          body: {
            assignment_id: selectedAssignment.id,
            sr_id: selectedAssignment.sr_id,
            area: selectedAssignment.area,
            customer_name: selectedAssignment.customer_name,
            address: selectedAssignment.address,
            cancellation_reason: cancelReason,
          },
        });
        toast.success("Email ακύρωσης εστάλη");
      } catch (emailErr) {
        console.error("Cancellation email error:", emailErr);
      }

      // 3. Move SR folder to ΑΚΥΡΩΜΕΝΕΣ ΚΑΤΑΣΚΕΥΕΣ in Drive
      try {
        await supabase.functions.invoke("move-cancelled-folder", {
          body: {
            sr_id: selectedAssignment.sr_id,
            area: selectedAssignment.area,
            assignment_id: selectedAssignment.id,
          },
        });
        toast.success("Ο φάκελος μεταφέρθηκε στις ΑΚΥΡΩΜΕΝΕΣ ΚΑΤΑΣΚΕΥΕΣ");
      } catch (moveErr) {
        console.error("Move folder error:", moveErr);
      }

      toast.success("Η ανάθεση ακυρώθηκε");
      queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
      setShowCancelDialog(false);
      setCancelReason("");
      setSelectedAssignment(null);
    } catch (err: any) {
      toast.error(err.message || "Σφάλμα ακύρωσης");
    } finally {
      setCancelling(false);
    }
  };

  // Prefetch survey + GIS data on card hover
  const handleCardHover = useCallback((assignment: any) => {
    queryClient.prefetchQuery({
      queryKey: ["assignment-survey", assignment.sr_id],
      queryFn: async () => {
        const { data } = await supabase
          .from("surveys")
          .select("*")
          .eq("sr_id", assignment.sr_id)
          .eq("technician_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return data;
      },
      staleTime: 30_000,
    });
    queryClient.prefetchQuery({
      queryKey: ["assignment-gis", assignment.id],
      queryFn: async () => {
        const { data } = await supabase
          .from("gis_data")
          .select("*")
          .eq("assignment_id", assignment.id)
          .maybeSingle();
        return data;
      },
      staleTime: 30_000,
    });
    queryClient.prefetchQuery({
      queryKey: ["sr_comments", assignment.id],
      queryFn: async () => {
        const { data } = await supabase
          .from("sr_comments" as any)
          .select("*")
          .eq("assignment_id", assignment.id)
          .order("created_at", { ascending: true });
        return data || [];
      },
      staleTime: 30_000,
    });
  }, [queryClient, user]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48" />
            <div className="flex gap-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="flex justify-between pt-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Δεν υπάρχουν αναθέσεις</p>
      </div>
    );
  }

  const renderStatusAction = (assignment: any) => {
    const status = assignment.status;

    if (status === "cancelled") {
      return (
        <div className="flex items-center gap-2 text-red-600 justify-center py-2">
          <Ban className="h-5 w-5" />
          <span className="text-sm font-medium">Ακυρωμένο</span>
        </div>
      );
    }

    if (status === "pending" || status === "inspection") {
      return (
        <div className="space-y-2">
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={() => handleStartSurvey(assignment)}
          >
            <FileEdit className="h-4 w-4" />
            {existingSurvey ? "Συνέχεια Αυτοψίας" : "Έναρξη Αυτοψίας"}
          </Button>
          {assignment.pdf_url && (
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-2"
              onClick={() => window.open(assignment.pdf_url, "_blank")}
            >
              <Eye className="h-4 w-4" />
              Προβολή Δελτίου
            </Button>
          )}
          {existingSurvey && (
            <div className="flex gap-2 w-full">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-2 border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => setShowSurveyForm(true)}
              >
                <FileEdit className="h-4 w-4" />
                Αρχεία Αυτοψίας
              </Button>
            </div>
          )}
          {existingSurvey && existingSurvey.status !== "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ" && (
            <>
              <input
                ref={gisFileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleGisUpload}
              />
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-2 border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
                onClick={() => gisFileInputRef.current?.click()}
                disabled={uploadingGis}
              >
                {uploadingGis ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : existingGisData ? (
                  <FileSpreadsheet className="h-4 w-4" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploadingGis ? "Ανάλυση GIS..." : existingGisData ? "Αντικατάσταση GIS" : "Upload Προδέσμευσης GIS"}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => { setShowCancelDialog(true); }}
          >
            <XCircle className="h-4 w-4" />
            Ακύρωση
          </Button>
        </div>
      );
    }

    if (status === "pre_committed") {
      return (
        <div className="space-y-2">
          <input
            ref={gisFileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleGisUpload}
          />
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-2 border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
            onClick={() => gisFileInputRef.current?.click()}
            disabled={uploadingGis}
          >
            {uploadingGis ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            {uploadingGis ? "Ανάλυση GIS..." : "Αντικατάσταση GIS"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => { setShowCancelDialog(true); }}
          >
            <XCircle className="h-4 w-4" />
            Ακύρωση
          </Button>
        </div>
      );
    }

    if (status === "waiting_ote" || status === "construction") {
      return (
        <div className="space-y-2">
          <Button size="sm" className="w-full gap-2" onClick={() => setShowConstructionForm(true)}>
            <HardHat className="h-4 w-4" />
            Φόρμα Κατασκευής
          </Button>
          <input
            ref={gisFileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleGisUpload}
          />
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-2 border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
            onClick={() => gisFileInputRef.current?.click()}
            disabled={uploadingGis}
          >
            {uploadingGis ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : existingGisData ? (
              <FileSpreadsheet className="h-4 w-4" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploadingGis ? "Ανάλυση GIS..." : existingGisData ? "Αντικατάσταση GIS" : "Upload GIS"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => { setShowCancelDialog(true); }}
          >
            <XCircle className="h-4 w-4" />
            Ακύρωση
          </Button>
        </div>
      );
    }

    if (status === "completed") {
      return (
        <div className="flex items-center gap-2 text-green-600 justify-center py-2">
          <CheckCircle className="h-5 w-5" />
          <span className="text-sm font-medium">Ολοκληρωμένο</span>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <div className="space-y-3">
        {assignments.map((a) => (
          <Card
            key={a.id}
            className="p-4 space-y-2 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => { setSelectedAssignment(a); setShowSurveyForm(false); setShowConstructionForm(false); }}
            onMouseEnter={() => handleCardHover(a)}
            onTouchStart={() => handleCardHover(a)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm text-foreground">SR {a.sr_id}</p>
                <p className="text-xs text-muted-foreground">{a.area}</p>
              </div>
              <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                {updating === a.id ? (
                  <Badge variant="outline" className="gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                  </Badge>
                ) : (
                  <Badge variant="outline" className={statusColors[a.status] || ""}>
                    {statusLabels[a.status] || a.status}
                  </Badge>
                )}
              </div>
            </div>

            {a.address && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {a.address}
              </div>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {a.customer_name && <span>{a.customer_name}</span>}
              {a.phone && (
                <a href={`tel:${a.phone}`} className="flex items-center gap-1 text-primary" onClick={(e) => e.stopPropagation()}>
                  <Phone className="h-3 w-3" />
                  {a.phone}
                </a>
              )}
            </div>

            {a.comments && (
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <MessageSquare className="h-3 w-3 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{a.comments}</span>
              </div>
            )}

            {/* GIS pending indicator for pre_committed */}
            {a.status === "pre_committed" && !gisAssignmentIds?.includes(a.id) && (
              <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 text-xs text-amber-600">
                <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium">Αναμονή GIS αρχείου</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {new Date(a.created_at).toLocaleDateString("el-GR")}
              </div>
              {gisAssignmentIds?.includes(a.id) && (
                <div className="flex items-center gap-1 text-xs text-blue-600">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span className="font-medium">GIS</span>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* SR Detail Sheet */}
      <Sheet open={!!selectedAssignment} onOpenChange={(open) => { if (!open) { setSelectedAssignment(null); setShowSurveyForm(false); setShowConstructionForm(false); } }}>
        <SheetContent side="bottom" className="h-[90vh] p-0">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="text-left">
              SR {selectedAssignment?.sr_id}
            </SheetTitle>
            <SheetDescription className="text-left">
              {selectedAssignment?.area} · {selectedAssignment?.customer_name || "—"}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(90vh-80px)] px-4 pb-6">
            {selectedAssignment && !showSurveyForm && !showConstructionForm && (
              <div className="space-y-4">
                {/* Status badge */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Κατάσταση:</span>
                  <Badge variant="outline" className={statusColors[selectedAssignment.status] || ""}>
                    {statusLabels[selectedAssignment.status] || selectedAssignment.status}
                  </Badge>
                </div>

                {/* SR Info */}
                <Card className="p-3 space-y-2 text-sm">
                  {selectedAssignment.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>{selectedAssignment.address}</span>
                    </div>
                  )}
                  {selectedAssignment.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <a href={`tel:${selectedAssignment.phone}`} className="text-primary">{selectedAssignment.phone}</a>
                    </div>
                  )}
                  {selectedAssignment.cab && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs font-medium">CAB:</span>
                      <span>{selectedAssignment.cab}</span>
                    </div>
                  )}
                  {selectedAssignment.comments && (
                    <div className="flex items-start gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{selectedAssignment.comments}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>{new Date(selectedAssignment.created_at).toLocaleDateString("el-GR")}</span>
                  </div>
                </Card>

                {/* Existing survey info */}
                {existingSurvey && (
                  <Card className="p-3 space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {existingSurvey.status === "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ"
                        ? "Αυτοψία"
                        : selectedAssignment.status === "completed"
                          ? "Ολοκλήρωση Κατασκευής"
                          : "Εντολή Κατασκευής"}
                    </p>
                    <Badge variant="outline" className={
                      existingSurvey.status === "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ"
                        ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                        : "bg-green-500/10 text-green-600 border-green-500/20"
                    }>
                      {existingSurvey.status === "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ"
                        ? existingSurvey.status
                        : selectedAssignment.status === "completed"
                          ? "Ολοκληρωμένη Κατασκευή"
                          : "Προδέσμευση Υλικών"}
                    </Badge>
                    {existingSurvey.comments && (
                      <p className="text-xs text-muted-foreground mt-1">{existingSurvey.comments}</p>
                    )}
                  </Card>
                )}

                {/* GIS Data full details */}
                {existingGisData && (
                  <Card className="p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Στοιχεία GIS
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div><span className="text-muted-foreground">Όροφοι:</span> <span className="font-medium">{existingGisData.floors}</span></div>
                      <div><span className="text-muted-foreground">BEP Τύπος:</span> <span className="font-medium">{existingGisData.bep_type || "—"}</span></div>
                      <div><span className="text-muted-foreground">BMO Τύπος:</span> <span className="font-medium">{existingGisData.bmo_type || "—"}</span></div>
                      <div><span className="text-muted-foreground">Conduit:</span> <span className="font-medium">{existingGisData.conduit || "—"}</span></div>
                      <div><span className="text-muted-foreground">Απόσταση από καμπίνα έως κτίριο:</span> <span className="font-medium">{existingGisData.distance_from_cabinet}μ</span></div>
                      {existingGisData.building_id && <div><span className="text-muted-foreground">Building ID:</span> <span className="font-medium">{existingGisData.building_id}</span></div>}
                      {existingGisData.area_type && <div><span className="text-muted-foreground">Τύπος περιοχής:</span> <span className="font-medium">{existingGisData.area_type}</span></div>}
                      {existingGisData.associated_bcp && <div><span className="text-muted-foreground">BCP:</span> <span className="font-medium">{existingGisData.associated_bcp}</span></div>}
                      {existingGisData.new_bcp && <div><span className="text-muted-foreground">Νέο BCP:</span> <span className="font-medium">{existingGisData.new_bcp}</span></div>}
                      {existingGisData.nearby_bcp && <div><span className="text-muted-foreground">Κοντινό BCP:</span> <span className="font-medium">{existingGisData.nearby_bcp}</span></div>}
                      {existingGisData.bep_floor && <div><span className="text-muted-foreground">Όροφος BEP:</span> <span className="font-medium">{existingGisData.bep_floor}</span></div>}
                      {existingGisData.bep_template && <div><span className="text-muted-foreground">Template BEP:</span> <span className="font-medium">{existingGisData.bep_template}</span></div>}
                      {existingGisData.customer_floor && <div><span className="text-muted-foreground">Όροφος πελάτη:</span> <span className="font-medium">{existingGisData.customer_floor}</span></div>}
                      {existingGisData.bep_only && <div><span className="text-muted-foreground">BEP Only:</span> <span className="font-medium">Ναι</span></div>}
                      {existingGisData.nanotronix && <div><span className="text-muted-foreground">Nanotronix:</span> <span className="font-medium">Ναι</span></div>}
                      {existingGisData.deh_nanotronix && <div><span className="text-muted-foreground">ΔΕΗ Nanotronix:</span> <span className="font-medium">Ναι</span></div>}
                      {existingGisData.smart_readiness && <div><span className="text-muted-foreground">Smart Readiness:</span> <span className="font-medium">Ναι</span></div>}
                    </div>
                    {(existingGisData.floor_details as any[])?.length > 0 && (() => {
                      // Normalize: if items have a "raw" key, use that instead
                      const rawDetails = (existingGisData.floor_details as any[]).map((fd: any) => {
                        if (fd.raw && typeof fd.raw === 'object') return fd.raw;
                        return fd;
                      });
                      const allKeysSet = new Set<string>();
                      rawDetails.forEach((d: any) => Object.keys(d).forEach((k) => allKeysSet.add(k)));
                      const allKeys = Array.from(allKeysSet);
                      
                      return (
                        <div className="text-xs space-y-1">
                          <span className="font-semibold text-foreground">📋 Στοιχεία Ορόφων:</span>
                          <div className="border border-green-300 rounded-md overflow-x-auto shadow-sm">
                            <table className="w-full text-xs whitespace-nowrap">
                              <thead>
                                <tr className="bg-gradient-to-r from-green-500 to-green-600">
                                  {allKeys.map((key) => (
                                    <th key={key} className="text-left px-2 py-1.5 font-bold text-white border-r border-green-400 last:border-r-0">
                                      {String(key)}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {rawDetails.map((fd: any, idx: number) => (
                                  <tr key={idx} className={`border-t border-green-100 hover:bg-green-100/60 ${idx % 2 === 0 ? 'bg-background' : 'bg-green-50/50'}`}>
                                    {allKeys.map((key) => (
                                      <td key={key} className="px-2 py-1 font-medium border-r border-border last:border-r-0">
                                        {fd[key] != null && fd[key] !== "" ? String(fd[key]) : "—"}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                    {(existingGisData.optical_paths as any[])?.length > 0 && (() => {
                      const paths = existingGisData.optical_paths as Record<string, any>[];
                      const opKeysSet = new Set<string>();
                      paths.forEach((p: any) => Object.keys(p).forEach((k) => opKeysSet.add(k)));
                      const opKeys = ["OPTICAL PATH TYPE", ...Array.from(opKeysSet).filter(k => k !== "OPTICAL PATH TYPE")];
                      return (
                        <div className="text-xs space-y-1">
                          <span className="font-semibold text-foreground">🔗 Οπτικές Διαδρομές ({paths.length}):</span>
                          <div className="border border-green-300 rounded-md overflow-x-auto shadow-sm">
                            <table className="w-full text-xs whitespace-nowrap">
                              <thead>
                                <tr className="bg-gradient-to-r from-green-500 to-green-600">
                                  {opKeys.map((key) => (
                                    <th key={key} className="text-left px-2 py-1.5 font-bold text-white border-r border-green-400 last:border-r-0">
                                      {String(key)}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {paths.map((p: any, idx: number) => (
                                  <tr key={idx} className={`border-t border-green-100 hover:bg-green-100/60 ${idx % 2 === 0 ? 'bg-background' : 'bg-green-50/50'}`}>
                                    {opKeys.map((key) => (
                                      <td key={key} className="px-2 py-1 font-medium border-r border-border last:border-r-0">
                                        {p[key] != null && p[key] !== "" ? String(p[key]) : "—"}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                    {existingGisData.warning && (
                      <p className="text-xs text-amber-600">⚠ {existingGisData.warning}</p>
                    )}
                    {existingGisData.failure && (
                      <p className="text-xs text-destructive">✗ {existingGisData.failure}</p>
                    )}
                    {existingGisData.notes && (
                      <p className="text-xs text-muted-foreground">📝 {existingGisData.notes}</p>
                    )}
                  </Card>
                )}

                {/* Survey file uploads - always show when survey exists (for editing/adding files) */}
                {existingSurvey && (
                  <IncompleteSurveys filterSrId={selectedAssignment.sr_id} />
                )}

                {/* Status-based action */}
                <div className="pt-2">
                  {renderStatusAction(selectedAssignment)}
                </div>

                {/* SR Comments / Chat */}
                <SRComments assignmentId={selectedAssignment.id} />
              </div>
            )}

            {/* Survey Form (inline in sheet) */}
            {selectedAssignment && showSurveyForm && (
              <SurveyForm
                assignments={assignments}
                prefillSrId={selectedAssignment.sr_id}
                prefillArea={selectedAssignment.area}
                onComplete={handleSurveyComplete}
              />
            )}

            {/* Construction Form (inline in sheet) */}
            {selectedAssignment && showConstructionForm && (
              <ConstructionForm
                assignment={selectedAssignment}
                onComplete={() => {
                  setShowConstructionForm(false);
                  setSelectedAssignment(null);
                  queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
                }}
              />
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Cancel Assignment Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={(open) => { if (!open) { setShowCancelDialog(false); setCancelReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Ακύρωση Ανάθεσης
            </DialogTitle>
            <DialogDescription>
              SR {selectedAssignment?.sr_id} — {selectedAssignment?.area}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="text-sm font-medium">
              Λόγος Ακύρωσης <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="π.χ. Ο πελάτης δεν ήταν διαθέσιμος, ακύρωσε το ραντεβού..."
              rows={4}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowCancelDialog(false); setCancelReason(""); }}>
              Πίσω
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelAssignment}
              disabled={cancelling || !cancelReason.trim()}
              className="gap-2"
            >
              {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
              Ακύρωση Ανάθεσης
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </>
  );
};

export default TechnicianAssignments;
