import { useState, useCallback } from "react";

import { MapPin, Phone, Calendar, MessageSquare, Loader2, Eye, FileEdit, CheckCircle, Clock, HardHat, XCircle, Ban, Upload, FileSpreadsheet, FileText, CalendarClock, Users } from "lucide-react";
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

const isToday = (date: Date) => {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
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
          <div key={i} className="rounded-xl border border-border overflow-hidden animate-pulse">
            <div className="h-1 bg-muted" />
            <div className="p-4 space-y-3">
              <div className="flex justify-between">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-5 w-20 bg-muted rounded-full" />
              </div>
              <div className="h-3 w-48 bg-muted rounded" />
              <div className="h-3 w-36 bg-muted rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
        <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
          <CheckCircle className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <p className="font-semibold text-foreground">Δεν υπάρχουν ενεργές αναθέσεις</p>
        <p className="text-sm text-muted-foreground">Ωραία δουλειά! 🎉</p>
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

  return (
    <>
      <div className="space-y-3">
        {assignments.map((a) => (
          <Card
            key={a.id}
            className="p-4 space-y-2 cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => { setSelectedAssignment(a); setShowSurveyForm(false); setShowConstructionForm(false); setShowCrewPanel(false); }}
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

            {/* Appointment info */}
            {a.appointment_at && (
              <div className="flex items-center gap-1.5 rounded-md bg-green-500/10 border border-green-500/20 px-2.5 py-1.5 text-xs text-green-600">
                <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium">
                  Ραντεβού: {new Date(a.appointment_at).toLocaleDateString("el-GR", { weekday: "short", day: "numeric", month: "numeric" })} στις {new Date(a.appointment_at).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
                </span>
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
                phase={isAdmin ? undefined : phase ?? undefined}
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
                phase={isAdmin ? undefined : phase ?? undefined}
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
