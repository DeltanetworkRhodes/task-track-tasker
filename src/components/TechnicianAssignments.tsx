import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
  pending: "bg-warning/15 text-warning border-warning/30",
  inspection: "bg-primary/15 text-primary border-primary/30",
  pre_committed: "bg-accent/15 text-accent border-accent/30",
  construction: "bg-success/15 text-success border-success/30",
  completed: "bg-success/20 text-success border-success/40",
  cancelled: "bg-destructive/10 text-destructive border-destructive/30",
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
        <div className="flex items-center gap-2 text-destructive justify-center py-2">
          <Ban className="h-5 w-5" />
          <span className="text-sm font-medium">Ακυρωμένο</span>
        </div>
      );
    }

    if (status === "pending" || status === "inspection") {
      return (
        <div className="space-y-3">
          <Button
            className={btnClass}
            onClick={() => handleStartSurvey(assignment)}
          >
            <FileEdit className="h-4 w-4" />
            {existingSurvey ? "Συνέχεια Αυτοψίας" : "Έναρξη Αυτοψίας"}
          </Button>
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
        <div className="flex items-center gap-2 text-success justify-center py-2">
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
                ? "bg-success/15 text-success border-success/30"
                : s === "in_progress"
                ? "bg-warning/15 text-warning border-warning/30"
                : "bg-muted/50 text-muted-foreground/50 border-border/50"
            }`}
          >
            <span>{icon}</span>
            <span>{label}</span>
            {s === "completed" && <span>✓</span>}
            {s === "in_progress" && (
              <span className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse inline-block" />
            )}
          </div>
        ))}
      </div>
    );
  };

  // Status accent (left vertical bar) — 2026 minimal
  const accentColor: Record<string, string> = {
    construction: "bg-success",
    inspection: "bg-primary",
    pre_committed: "bg-accent",
    pending: "bg-warning",
  };
  const accentGlow: Record<string, string> = {
    construction: "shadow-[0_0_12px_hsl(var(--success)/0.5)]",
    inspection: "shadow-[0_0_12px_hsl(var(--primary)/0.5)]",
    pre_committed: "shadow-[0_0_12px_hsl(var(--accent)/0.5)]",
    pending: "shadow-[0_0_12px_hsl(var(--warning)/0.4)]",
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
      <motion.div
        className="space-y-3"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
        }}
      >
        {assignments.map((a, idx) => {
          const ps = phaseStatusMap?.get(a.id);
          const apptToday = a.appointment_at && isToday(a.appointment_at);
          const apptDate = a.appointment_at ? new Date(a.appointment_at) : null;
          const apptUpcoming = apptDate && apptDate.getTime() > Date.now() - 6 * 60 * 60 * 1000;
          const hasGis = gisAssignmentIds?.includes(a.id);
          return (
            <motion.div
              key={a.id}
              layout
              variants={{
                hidden: { opacity: 0, y: 24, filter: "blur(6px)" },
                visible: {
                  opacity: 1,
                  y: 0,
                  filter: "blur(0px)",
                  transition: { type: "spring", stiffness: 260, damping: 28 },
                },
              }}
              whileHover={{ y: -2, transition: { type: "spring", stiffness: 400, damping: 25 } }}
              whileTap={{ scale: 0.985 }}
              data-sr-id={a.sr_id}
              className={`group relative bg-card rounded-2xl overflow-hidden border transition-colors duration-300 cursor-pointer ${
                apptToday
                  ? "border-accent/40 shadow-[0_8px_24px_-12px_hsl(var(--accent)/0.5)]"
                  : "border-border/50 hover:border-border hover:shadow-[0_12px_32px_-16px_hsl(var(--primary)/0.35)]"
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
              {/* Cinematic gradient sweep on hover */}
              <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-primary/[0.04] via-transparent to-accent/[0.06]" />

              {/* Left vertical accent bar with reveal animation */}
              <motion.div
                className={`absolute left-0 top-0 bottom-0 w-1 ${accentColor[a.status] || "bg-muted"} ${
                  apptToday ? accentGlow[a.status] || "" : ""
                }`}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.5, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
                style={{ originY: 0 }}
              />

              <div className="pl-4 pr-3 py-3.5 space-y-2.5">
                {/* Header: SR mono + status dot + time */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Status dot */}
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${accentColor[a.status] || "bg-muted"} ${
                        a.status === "construction" || apptToday ? "animate-pulse" : ""
                      }`}
                    />
                    {/* SR code in mono pill */}
                    <span className="font-mono text-[13px] font-bold tracking-tight text-foreground truncate">
                      {a.sr_id}
                    </span>
                    {hasGis && (
                      <span className="text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0">
                        GIS
                      </span>
                    )}
                  </div>
                  {/* Time block — prominent, mono */}
                  {apptUpcoming && apptDate ? (
                    <div className={`flex flex-col items-end leading-tight shrink-0 ${apptToday ? "text-accent" : "text-foreground"}`}>
                      <span className="font-mono text-sm font-bold tabular-nums">
                        {apptDate.toLocaleTimeString("el-GR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}
                      </span>
                      <span className={`text-[9px] font-semibold uppercase tracking-wider ${apptToday ? "text-accent" : "text-muted-foreground"}`}>
                        {apptToday
                          ? "Σήμερα"
                          : apptDate.toLocaleDateString("el-GR", {
                              day: "2-digit",
                              month: "short",
                            })}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider shrink-0">
                      {statusLabels[a.status] || a.status}
                    </span>
                  )}
                </div>

                {/* Customer name — primary text */}
                {a.customer_name && (
                  <div className="text-sm font-semibold text-foreground truncate">
                    {a.customer_name}
                  </div>
                )}

                {/* Address row — subtle */}
                {a.address && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate flex-1">{a.address}</span>
                    {a.area && (
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 shrink-0">
                        · {a.area}
                      </span>
                    )}
                  </div>
                )}

                {/* Phase progress dots — minimal pills */}
                {a.status === "construction" && ps && (
                  <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {[
                      { n: 1, label: "Φ1" },
                      { n: 2, label: "Φ2" },
                      { n: 3, label: "Φ3" },
                    ].map(({ n, label }) => {
                      const s = ps[`phase${n}_status`] || "pending";
                      return (
                        <div
                          key={n}
                          className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider transition-colors ${
                            s === "completed"
                              ? "bg-success/15 text-success"
                              : s === "in_progress"
                              ? "bg-warning/15 text-warning"
                              : "bg-muted/60 text-muted-foreground/50"
                          }`}
                        >
                          <span>{label}</span>
                          {s === "completed" && <span>✓</span>}
                          {s === "in_progress" && (
                            <span className="h-1 w-1 rounded-full bg-warning animate-pulse inline-block" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* GIS missing — subtle warning chip */}
                {a.status === "pre_committed" && !hasGis && (
                  <div className="flex items-center gap-1.5 text-[11px] text-warning bg-warning/8 border border-warning/20 rounded-lg px-2.5 py-1.5">
                    <FileSpreadsheet className="h-3 w-3 shrink-0" />
                    Αναμονή GIS
                  </div>
                )}

                {/* Bottom action bar — divided */}
                <div className="flex items-center gap-1 pt-2 border-t border-border/40 -mx-1">
                  {a.address && (
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(a.address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-foreground/70 hover:text-primary hover:bg-primary/5 py-2 rounded-lg transition-colors"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      Πλοήγηση
                    </a>
                  )}
                  {a.phone && (
                    <>
                      <div className="h-5 w-px bg-border/60" />
                      <a
                        href={`tel:${a.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-foreground/70 hover:text-success hover:bg-success/5 py-2 rounded-lg transition-colors"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        Κλήση
                      </a>
                    </>
                  )}
                  {/* Status-specific primary action */}
                  {a.status === "construction" && (
                    <>
                      <div className="h-5 w-px bg-border/60" />
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
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-bold py-2 rounded-lg transition-colors ${
                          myPhase && PHASE_BTN[myPhase]
                            ? PHASE_BTN[myPhase]
                            : "bg-success/15 text-success hover:bg-success/25"
                        }`}
                      >
                        <HardHat className="h-3.5 w-3.5" />
                        {myPhase ? `Φ${myPhase}` : "Κατασκευή"}
                      </button>
                    </>
                  )}
                  {a.status === "inspection" && (
                    <>
                      <div className="h-5 w-px bg-border/60" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAssignment(a);
                          setShowSurveyForm(true);
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 text-[11px] font-bold bg-primary/15 text-primary hover:bg-primary/25 py-2 rounded-lg transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Αυτοψία
                      </button>
                    </>
                  )}
                </div>

                {updating === a.id && (
                  <div className="flex items-center justify-center text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

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
                        ? "bg-warning/15 text-warning border-warning/30"
                        : "bg-success/15 text-success border-success/30"
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
                      <p className="text-xs text-warning">⚠ {existingGisData.warning}</p>
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
