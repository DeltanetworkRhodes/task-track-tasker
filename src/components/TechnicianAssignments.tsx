import { useState, useCallback, useMemo } from "react";

import { MapPin, Phone, Calendar, MessageSquare, Loader2, Eye, FileEdit, CheckCircle, Clock, HardHat, XCircle, Ban, Upload, FileSpreadsheet, FileText, CalendarClock, Users, Navigation } from "lucide-react";
import GisUploadCard from "@/components/GisUploadCard";
import { useMyCrewAssignments, useWorkCategories, useMyPhase, usePhaseStatus } from "@/hooks/useCrewData";
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
import { useDemo } from "@/contexts/DemoContext";
import { toast } from "sonner";
import SurveyForm from "@/components/SurveyForm";
import IncompleteSurveys from "@/components/IncompleteSurveys";
import ConstructionForm from "@/components/ConstructionForm";
import SRComments from "@/components/SRComments";
import PreWorkChecklist from "@/components/PreWorkChecklist";
import TimeTracker from "@/components/TimeTracker";

const statusFlow: { value: string; label: string }[] = [
  { value: "pending", label: "Αναμονή" },
  { value: "inspection", label: "Αυτοψία" },
  { value: "pre_committed", label: "Προδέσμευση" },
  
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
  const { isDemo, demoGisData, updateDemoAssignment, addDemoGis } = useDemo();
  const [updating, setUpdating] = useState<string | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [showConstructionForm, setShowConstructionForm] = useState(false);
  const [showCrewPanel, setShowCrewPanel] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [preWorkComplete, setPreWorkComplete] = useState(() => {
    return false; // will be synced by query + PreWorkChecklist onMount
  });
  const queryClient = useQueryClient();

  // Crew data for filtered ConstructionForm
  const { data: myCrewAssignments } = useMyCrewAssignments(selectedAssignment?.id);
  const { data: workCategoriesData } = useWorkCategories();

  const crewPhotoCatKeys = (myCrewAssignments || []).flatMap((ca: any) => {
    const cat = (workCategoriesData || []).find((c: any) => c.id === ca.category_id);
    return cat?.photo_categories || [];
  });
  const crewWorkPrefixes = (myCrewAssignments || []).flatMap((ca: any) => {
    const cat = (workCategoriesData || []).find((c: any) => c.id === ca.category_id);
    return cat?.work_prefixes || [];
  });
  const crewMaterialCodes = (myCrewAssignments || []).flatMap((ca: any) => {
    const cat = (workCategoriesData || []).find((c: any) => c.id === ca.category_id);
    return cat?.material_codes || [];
  });
  const crewAssignmentIds = (myCrewAssignments || []).map((ca: any) => ca.id);

  // 3-Phase workflow context for the open assignment
  const { phase, isAdmin } = useMyPhase(selectedAssignment?.id ?? null);
  const { data: phaseStatus } = usePhaseStatus(selectedAssignment?.id ?? null);
  // Ο Υπεύθυνος του SR ελέγχει τα πάντα → βλέπει τη φόρμα χωρίς phase filter
  const isResponsible = !!user && !!selectedAssignment?.technician_id && selectedAssignment.technician_id === user.id;
  const effectivePhase = (isAdmin || isResponsible) ? undefined : (phase ?? undefined);

  // Fetch existing survey for selected assignment
  const { data: existingSurvey } = useQuery({
    queryKey: ["assignment-survey", selectedAssignment?.sr_id, isDemo],
    queryFn: async () => {
      if (isDemo) return null;
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
    enabled: !!selectedAssignment && (isDemo || !!user),
  });

  // Fetch which assignments have GIS data (for card icons)
  const { data: gisAssignmentIds } = useQuery({
    queryKey: ["gis-assignment-ids", user?.id, isDemo],
    queryFn: async () => {
      if (isDemo) {
        return Object.keys(demoGisData);
      }
      const ids = assignments.map((a: any) => a.id);
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("gis_data")
        .select("assignment_id")
        .in("assignment_id", ids);
      return (data || []).map((d: any) => d.assignment_id);
    },
    enabled: isDemo || (!!user && assignments.length > 0),
  });

  // Fetch phase status for ALL assignments (only for construction-phase cards)
  const assignmentIds = useMemo(
    () => (assignments || []).map((a: any) => a.id),
    [assignments]
  );

  const { data: phaseStatuses } = useQuery({
    queryKey: ["phase-statuses", assignmentIds],
    queryFn: async () => {
      if (!assignmentIds.length) return [];
      const { data } = await supabase
        .from("constructions")
        .select("assignment_id, phase1_status, phase2_status, phase3_status")
        .in("assignment_id", assignmentIds);
      return (data || []) as any[];
    },
    enabled: !isDemo && assignmentIds.length > 0,
  });

  const phaseStatusMap = useMemo(() => {
    const map = new Map<string, any>();
    (phaseStatuses || []).forEach((p: any) => map.set(p.assignment_id, p));
    return map;
  }, [phaseStatuses]);

  // Fetch current user's default_phase from profile
  const { data: myProfile } = useQuery({
    queryKey: ["profile-phase", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("default_phase")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data as any;
    },
    enabled: !!user && !isDemo,
  });
  const myPhase: number | undefined = (myProfile as any)?.default_phase ?? undefined;

  // Fetch GIS data for selected assignment
  const { data: existingGisData } = useQuery({
    queryKey: ["assignment-gis", selectedAssignment?.id, isDemo],
    queryFn: async () => {
      if (isDemo) {
        return demoGisData[selectedAssignment!.id] || null;
      }
      const { data } = await supabase
        .from("gis_data")
        .select("*")
        .eq("assignment_id", selectedAssignment!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!selectedAssignment && (isDemo || !!user),
  });

  // Fetch pre-work checklist for selected assignment (to init blocker state)
  const { data: preWorkChecklist } = useQuery({
    queryKey: ["pre-work-checklist", selectedAssignment?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("pre_work_checklists" as any)
        .select("completed")
        .eq("assignment_id", selectedAssignment!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!selectedAssignment && !isDemo && !!user,
  });

  // Sync preWorkComplete from query result (avoids stale false init)
  const preWorkCompleteFromDb = !!(preWorkChecklist as any)?.completed;
  if (preWorkCompleteFromDb && !preWorkComplete) {
    setPreWorkComplete(true);
  }

  const handleGisUploadSuccess = async (result: any) => {
    if (!selectedAssignment) return;
    
    if (isDemo) {
      // Demo mode: simulate GIS upload + auto-transition
      const demoGis = {
        id: `demo-gis-${selectedAssignment.id}`,
        assignment_id: selectedAssignment.id,
        sr_id: selectedAssignment.sr_id,
        floors: result?.floors || 4,
        bep_type: result?.bep_type || "BEP-4",
        floor_details: result?.floor_details || [],
        gis_works: result?.gis_works || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      addDemoGis(selectedAssignment.id, demoGis);
      
      if (selectedAssignment.status === "pre_committed") {
        updateDemoAssignment(selectedAssignment.id, { status: "construction" });
        setSelectedAssignment({ ...selectedAssignment, status: "construction" });
        toast.success("🏗️ Η ανάθεση μετέβη αυτόματα σε Κατασκευή! (Λειτουργία Demo)", { duration: 4000 });
      }
      queryClient.invalidateQueries({ queryKey: ["gis-assignment-ids"] });
      queryClient.invalidateQueries({ queryKey: ["assignment-gis"] });
      return;
    }
    
    // Auto-transition to construction if currently pre_committed
    if (selectedAssignment.status === "pre_committed") {
      try {
        const { error } = await supabase
          .from("assignments")
          .update({ status: "construction" })
          .eq("id", selectedAssignment.id);
        
        if (error) throw error;
        
        toast.success("🏗️ Η ανάθεση μετέβη αυτόματα σε Κατασκευή!", { duration: 4000 });
        
        // Update local state
        setSelectedAssignment({ ...selectedAssignment, status: "construction" });
        queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
      } catch (err: any) {
        console.error("Auto-transition error:", err);
        toast.info("Το GIS ανέβηκε. Αλλάξτε χειροκίνητα σε Κατασκευή.");
      }
    }
  };

  const handleStatusChange = async (assignmentId: string, newStatus: string, oldStatus: string) => {
    if (isDemo) {
      updateDemoAssignment(assignmentId, { status: newStatus });
      if (selectedAssignment?.id === assignmentId) {
        setSelectedAssignment({ ...selectedAssignment, status: newStatus });
      }
      toast.success(`Κατάσταση → ${statusLabels[newStatus]} (Λειτουργία Demo)`);
      setUpdating(null);
      return;
    }
    
    // Client-side guard: block construction without GIS
    if (newStatus === "construction") {
      const hasGis = gisAssignmentIds?.includes(assignmentId);
      if (!hasGis) {
        toast.error("Απαιτείται GIS αρχείο πριν τη μετάβαση σε Κατασκευή. Ανεβάστε πρώτα το GIS Excel.");
        return;
      }
    }

    // Client-side guard: block pre_committed without all required survey files
    if (newStatus === "pre_committed") {
      const assignment = assignments.find((a) => a.id === assignmentId);
      if (assignment) {
        // If files are already in Google Drive, skip local file validation
        if (assignment.drive_folder_url) {
          // Files archived to Drive — allow transition
        } else {
        try {
          // Find survey for this SR
          const { data: surveys } = await supabase
            .from("surveys")
            .select("id")
            .eq("sr_id", assignment.sr_id)
            .order("created_at", { ascending: false })
            .limit(1);

          if (!surveys || surveys.length === 0) {
            toast.error("Αδυναμία Προδέσμευσης: Δεν βρέθηκε αυτοψία για αυτό το SR.");
            return;
          }

          const { data: files } = await supabase
            .from("survey_files")
            .select("file_type")
            .eq("survey_id", surveys[0].id);

          const uploadedTypes = new Set((files || []).map((f: any) => f.file_type));
          const requiredTypes = [
            { key: "building_photo", label: "Φωτογραφίες Κτιρίου" },
            { key: "screenshot", label: "Screenshots (ΧΕΜΔ & AutoCAD)" },
            { key: "inspection_pdf", label: "Δελτίο Αυτοψίας" },
          ];
          const missing = requiredTypes.filter((t) => !uploadedTypes.has(t.key));

          if (missing.length > 0) {
            const missingLabels = missing.map((m) => m.label).join(", ");
            toast.error(`Αδυναμία Προδέσμευσης: Λείπουν υποχρεωτικά αρχεία (${missingLabels}). Ολοκληρώστε πρώτα την αυτοψία.`);
            return;
          }
        } catch (validationErr) {
          console.error("Survey file validation error:", validationErr);
          toast.error("Σφάλμα κατά τον έλεγχο αρχείων αυτοψίας.");
          return;
        }
        }
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

      toast.success(`${statusLabels[newStatus]} →`, {
        description: `SR ${assignments.find((a) => a.id === assignmentId)?.sr_id || ""}`,
        duration: 2000,
      });

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

        // Move SR folder to ΠΡΟΔΕΣΜΕΥΣΗ ΓΙΑ ΚΑΤΑΣΚΕΥΗ in Drive (fire-and-forget)
        supabase.functions.invoke("move-sr-folder", {
          body: { sr_id: assignment.sr_id, target_folder: "ΠΡΟΔΕΣΜΕΥΣΗ ΓΙΑ ΚΑΤΑΣΚΕΥΗ", organization_id: assignment.organization_id },
        }).catch(console.error);
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
    const btnClass = "w-full gap-2 min-h-[44px] text-sm";

    if (status === "cancelled") {
      return (
        <div className="flex items-center gap-2 text-red-600 justify-center py-2">
          <Ban className="h-5 w-5" />
          <span className="text-sm font-medium">Ακυρωμένο</span>
        </div>
      );
    }

    if (status === "pending" || status === "inspection") {
      const checklistBlocks = status === "pending" && !preWorkComplete;
      return (
        <div className="space-y-3">
          <Button
            className={btnClass}
            onClick={() => handleStartSurvey(assignment)}
            disabled={checklistBlocks}
            title={checklistBlocks ? "Ολοκληρώστε πρώτα τον Έλεγχο Πριν την Έναρξη" : undefined}
          >
            <FileEdit className="h-4 w-4" />
            {existingSurvey ? "Συνέχεια Αυτοψίας" : "Έναρξη Αυτοψίας"}
          </Button>
          {checklistBlocks && (
            <p className="text-[10px] text-amber-600 text-center">
              ⚠️ Ολοκληρώστε τον Έλεγχο Πριν την Έναρξη για να συνεχίσετε
            </p>
          )}
          {existingSurvey && (
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                className={`flex-1 gap-2 min-h-[44px] text-sm border-primary/30 text-primary hover:bg-primary/10`}
                onClick={() => setShowSurveyForm(true)}
              >
                <FileEdit className="h-4 w-4" />
                Αρχεία Αυτοψίας
              </Button>
            </div>
          )}
          {existingSurvey && existingSurvey.status !== "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ" && (
            <GisUploadCard
              assignment={assignment}
              hasExistingGis={!!existingGisData}
              onUploadSuccess={handleGisUploadSuccess}
              compact={!!existingGisData}
            />
          )}
          <Button
            variant="outline"
            className={`${btnClass} text-destructive border-destructive/30 hover:bg-destructive/10`}
            onClick={() => { setShowCancelDialog(true); }}
          >
            <XCircle className="h-4 w-4" />
            Ακύρωση
          </Button>
        </div>
      );
    }

    if (status === "pre_committed") {
      const hasGis = existingGisData || gisAssignmentIds?.includes(assignment.id);
      return (
        <div className="space-y-3">
          {/* Prominent GIS upload when missing */}
          <GisUploadCard
            assignment={assignment}
            hasExistingGis={!!hasGis}
            onUploadSuccess={handleGisUploadSuccess}
          />
          {/* Show construction form button only when GIS exists */}
          {hasGis && (
            <Button className={btnClass} onClick={async () => {
              // Auto-transition to construction status
              if (assignment.status !== 'construction') {
                try {
                  if (!isDemo) {
                    const { error } = await supabase
                      .from("assignments")
                      .update({ status: "construction" })
                      .eq("id", assignment.id);
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
                    // Move SR folder to "ΣΕ ΚΑΤΑΣΚΕΥΗ" in Drive (fire-and-forget)
                    supabase.functions.invoke("move-sr-folder", {
                      body: { sr_id: assignment.sr_id, target_folder: "ΣΕ ΚΑΤΑΣΚΕΥΗ", organization_id: assignment.organization_id },
                    }).catch(console.error);
                    setSelectedAssignment({ ...assignment, status: "construction" });
                  } else {
                    updateDemoAssignment(assignment.id, { status: "construction" });
                    setSelectedAssignment({ ...assignment, status: "construction" });
                  }
                } catch (err: any) {
                  toast.error(err.message || "Σφάλμα αλλαγής κατάστασης");
                  return;
                }
              }
              // Responsible technician gets full form, crew members get filtered
              const isResponsible = assignment.technician_id === user?.id;
              if (isResponsible) {
                setShowConstructionForm(true);
              } else {
                setShowCrewPanel(true);
              }
            }}>
              <HardHat className="h-4 w-4" />
              Έναρξη Κατασκευής
            </Button>
          )}
          <Button
            variant="outline"
            className={`${btnClass} text-destructive border-destructive/30 hover:bg-destructive/10`}
            onClick={() => { setShowCancelDialog(true); }}
          >
            <XCircle className="h-4 w-4" />
            Ακύρωση
          </Button>
        </div>
      );
    }

    if (status === "construction") {
      return (
        <div className="space-y-3">
          <TimeTracker assignmentId={assignment.id} srId={assignment.sr_id} />
          <Button
            className={btnClass}
            onClick={() => {
              const isResponsible = assignment.technician_id === user?.id;
              if (isResponsible) {
                setShowConstructionForm(true);
              } else {
                setShowCrewPanel(true);
              }
            }}
          >
            {assignment.technician_id === user?.id ? <HardHat className="h-4 w-4" /> : <Users className="h-4 w-4" />}
            {assignment.technician_id === user?.id ? "Κατασκευή" : "Εργασίες Συνεργείου"}
          </Button>
          <GisUploadCard
            assignment={assignment}
            hasExistingGis={!!existingGisData}
            onUploadSuccess={handleGisUploadSuccess}
            compact
          />
          <Button
            variant="outline"
            className={`${btnClass} text-destructive border-destructive/30 hover:bg-destructive/10`}
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

  const PhaseProgress = ({
    p1 = "pending",
    p2 = "pending",
    p3 = "pending",
  }: {
    p1?: string;
    p2?: string;
    p3?: string;
  }) => {
    const phases = [
      { label: "Φ1", icon: "🚜", s: p1 },
      { label: "Φ2", icon: "🔧", s: p2 },
      { label: "Φ3", icon: "🔬", s: p3 },
    ];
    return (
      <div className="flex items-center gap-2">
        {phases.map(({ label, icon, s }) => (
          <div
            key={label}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border transition-colors ${
              s === "completed"
                ? "bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400"
                : s === "in_progress"
                ? "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400"
                : "bg-muted/50 text-muted-foreground/50 border-border/50"
            }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
            {s === "completed" && <span>✓</span>}
            {s === "in_progress" && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
            )}
          </div>
        ))}
      </div>
    );
  };

  // Stripe colors per status
  const stripeColor: Record<string, string> = {
    construction: "bg-primary",
    inspection: "bg-warning",
    pre_committed: "bg-accent",
    pending: "bg-muted-foreground/30",
  };
  // Phase button colors
  const PHASE_BTN: Record<number, string> = {
    1: "bg-warning hover:bg-warning/90 text-warning-foreground",
    2: "bg-primary hover:bg-primary/90 text-primary-foreground",
    3: "bg-accent hover:bg-accent/90 text-accent-foreground",
  };
  const isToday = (dateStr: string) => {
    const d = new Date(dateStr);
    const t = new Date();
    return (
      d.getDate() === t.getDate() &&
      d.getMonth() === t.getMonth() &&
      d.getFullYear() === t.getFullYear()
    );
  };

  return (
    <>
      <div className="space-y-3">
        {assignments.map((a) => {
          const ps = phaseStatusMap?.get(a.id);
          const apptToday = a.appointment_at && isToday(a.appointment_at);
          const hasGis = gisAssignmentIds?.includes(a.id);
          return (
            <div
              key={a.id}
              className={`bg-card rounded-2xl overflow-hidden border transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                apptToday
                  ? "border-accent/50"
                  : "border-border hover:border-border/80"
              }`}
              onClick={() => {
                setSelectedAssignment(a);
                setShowSurveyForm(false);
                setShowConstructionForm(false);
                setShowCrewPanel(false);
              }}
              onMouseEnter={() => handleCardHover(a)}
              onTouchStart={() => handleCardHover(a)}
            >
              {/* Top color stripe */}
              <div className={`h-1 ${stripeColor[a.status] || "bg-muted"}`} />

              <div className="p-4 space-y-3">
                {/* Row 1: SR + Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-primary">
                        {a.sr_id}
                      </span>
                      {apptToday && (
                        <span className="text-[10px] font-bold bg-accent/15 text-accent px-2 py-0.5 rounded-full">
                          ΣΗΜΕΡΑ{" "}
                          {new Date(a.appointment_at!).toLocaleTimeString("el-GR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                      {hasGis && (
                        <span className="text-[10px] font-bold bg-primary/15 text-primary px-2 py-0.5 rounded-full">
                          GIS ✓
                        </span>
                      )}
                    </div>
                    {a.area && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {a.area}
                      </p>
                    )}
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    {updating === a.id ? (
                      <Badge variant="outline" className="gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${statusColors[a.status] || ""}`}
                      >
                        {statusLabels[a.status] || a.status}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Row 2: Address + Nav */}
                {a.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground flex-1 truncate">
                      {a.address}
                    </span>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(a.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full shrink-0 hover:bg-primary/20 transition-colors"
                    >
                      Πλοήγηση
                    </a>
                  </div>
                )}

                {/* Row 3: Customer + Phone */}
                {(a.customer_name || a.phone) && (
                  <div className="flex items-center justify-between gap-2">
                    {a.customer_name && (
                      <span className="text-xs text-foreground truncate">
                        {a.customer_name}
                      </span>
                    )}
                    {a.phone && (
                      <a
                        href={`tel:${a.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] font-bold text-primary flex items-center gap-1 shrink-0"
                      >
                        <Phone className="h-3 w-3" />
                        Κλήση
                      </a>
                    )}
                  </div>
                )}

                {/* Phase progress dots */}
                {a.status === "construction" && ps && (
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    {[
                      { n: 1, icon: "🚜", label: "Φ1" },
                      { n: 2, icon: "🔧", label: "Φ2" },
                      { n: 3, icon: "🔬", label: "Φ3" },
                    ].map(({ n, icon, label }) => {
                      const s = ps[`phase${n}_status`] || "pending";
                      return (
                        <div
                          key={n}
                          className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                            s === "completed"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700"
                              : s === "in_progress"
                              ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700"
                              : "bg-muted/50 text-muted-foreground/50 border-border/50"
                          }`}
                        >
                          <span>{icon}</span>
                          <span>{label}</span>
                          {s === "completed" && <span>✓</span>}
                          {s === "in_progress" && (
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* GIS missing warning */}
                {a.status === "pre_committed" && !hasGis && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-2">
                    <FileSpreadsheet className="h-3.5 w-3.5 shrink-0" />
                    Αναμονή GIS αρχείου
                  </div>
                )}

                {/* Action button */}
                {a.status === "construction" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAssignment(a);
                      const isResponsible = a.technician_id === user?.id;
                      if (isResponsible) {
                        setShowConstructionForm(true);
                      } else {
                        setShowCrewPanel(true);
                      }
                    }}
                    className={`w-full py-2.5 text-xs font-bold text-white rounded-xl flex items-center justify-center gap-2 transition-colors ${
                      myPhase && PHASE_BTN[myPhase]
                        ? PHASE_BTN[myPhase]
                        : "bg-violet-600 hover:bg-violet-700"
                    }`}
                  >
                    <HardHat className="h-3.5 w-3.5" />
                    {myPhase
                      ? `Φάση ${myPhase} — ${
                          myPhase === 1
                            ? "Χωματουργικά"
                            : myPhase === 2
                            ? "Οδεύσεις"
                            : "Κόλληση"
                        }`
                      : "Φόρμα Κατασκευής"}
                  </button>
                )}

                {a.status === "inspection" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedAssignment(a);
                      setShowSurveyForm(true);
                    }}
                    className="w-full py-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl flex items-center justify-center gap-2 transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Αυτοψία
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* SR Detail Sheet */}
      <Sheet open={!!selectedAssignment} onOpenChange={(open) => { if (!open) { setSelectedAssignment(null); setShowSurveyForm(false); setShowConstructionForm(false); setShowCrewPanel(false); } }}>
        <SheetContent side="bottom" className="h-[92vh] sm:h-[90vh] p-0 rounded-t-2xl overflow-hidden">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="text-left">
              SR {selectedAssignment?.sr_id}
            </SheetTitle>
            <SheetDescription className="text-left text-xs">
              {selectedAssignment?.area} · {selectedAssignment?.customer_name}
            </SheetDescription>
          </SheetHeader>

          <div className="overflow-y-auto overscroll-contain px-4 pb-8 safe-bottom" style={{ height: 'calc(92vh - 80px)' }}>
            {selectedAssignment && !showSurveyForm && !showConstructionForm && !showCrewPanel && (
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


                {/* Pre-Work Checklist - visible for pending assignments */}
                {(selectedAssignment.status === "pending" || selectedAssignment.status === "inspection") && (
                  <PreWorkChecklist
                    assignment={selectedAssignment}
                    onChecklistComplete={setPreWorkComplete}
                  />
                )}

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

                {/* SR Comments / Chat */}
                <SRComments assignmentId={selectedAssignment.id} />


                {/* Action buttons — inside scroll */}
                <div className="pt-2 pb-4">
                  {renderStatusAction(selectedAssignment)}
                </div>
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
                phase={effectivePhase}
                phaseStatus={phaseStatus ?? null}
                onComplete={() => {
                  setShowConstructionForm(false);
                  setSelectedAssignment(null);
                  queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
                }}
              />
            )}

            {/* Crew Work Panel → Full ConstructionForm in crew mode */}
            {selectedAssignment && showCrewPanel && (
              <ConstructionForm
                assignment={selectedAssignment}
                isCrewMode
                filterPhotoCatKeys={crewPhotoCatKeys.length > 0 ? crewPhotoCatKeys : undefined}
                filterWorkPrefixes={crewWorkPrefixes.length > 0 ? crewWorkPrefixes : undefined}
                filterMaterialCodes={crewMaterialCodes.length > 0 ? crewMaterialCodes : undefined}
                crewAssignmentIds={crewAssignmentIds.length > 0 ? crewAssignmentIds : undefined}
                phase={effectivePhase}
                phaseStatus={phaseStatus ?? null}
                onComplete={() => {
                  setShowCrewPanel(false);
                  setSelectedAssignment(null);
                  queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
                }}
              />
            )}
          </div>
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
