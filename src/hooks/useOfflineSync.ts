import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOnlineStatus } from "./useOnlineStatus";
import {
  getPendingSurveys,
  dequeueSurvey,
  getPendingCount,
  offlineFileToFile,
  type OfflineSurveyPayload,
} from "@/lib/offlineQueue";

/**
 * Hook that automatically syncs offline surveys when connection returns.
 * Should be mounted once at the app level (e.g. in AppLayout).
 */
export function useOfflineSync() {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const syncing = useRef(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Poll pending count
  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  useEffect(() => {
    refreshPendingCount();
    const interval = setInterval(refreshPendingCount, 5000);
    return () => clearInterval(interval);
  }, [refreshPendingCount]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (online && !syncing.current) {
      syncAll();
    }
  }, [online]);

  const syncAll = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;

    try {
      const pending = await getPendingSurveys();
      if (pending.length === 0) {
        syncing.current = false;
        return;
      }

      toast.info(`Συγχρονισμός ${pending.length} αυτοψιών...`);

      let synced = 0;
      let failed = 0;

      for (const payload of pending) {
        try {
          await syncSurvey(payload);
          await dequeueSurvey(payload.id);
          synced++;
        } catch (err) {
          console.error(`Offline sync failed for ${payload.srId}:`, err);
          failed++;
        }
      }

      await refreshPendingCount();

      if (synced > 0) {
        queryClient.invalidateQueries({ queryKey: ["surveys"] });
        queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
        toast.success(`${synced} αυτοψίες συγχρονίστηκαν επιτυχώς!${failed > 0 ? ` (${failed} αποτυχίες)` : ""}`);
      }
    } finally {
      syncing.current = false;
    }
  }, [queryClient, refreshPendingCount]);

  return { pendingCount, online, syncAll };
}

/**
 * Upload a single offline survey to Supabase
 */
async function syncSurvey(payload: OfflineSurveyPayload) {
  // 1. Create survey record
  const { data: survey, error: surveyError } = await supabase
    .from("surveys")
    .insert({
      sr_id: payload.srId,
      area: payload.area,
      technician_id: payload.userId,
      comments: payload.comments,
      status: payload.autoStatus,
      organization_id: payload.organizationId,
    })
    .select("id")
    .single();

  if (surveyError) throw surveyError;

  // 2. Upload files
  const allFileRecords: { file_path: string; file_name: string; file_type: string }[] = [];

  // Building photos
  for (const of of payload.buildingPhotos) {
    const file = offlineFileToFile(of);
    const ext = file.name.split(".").pop();
    const path = `${payload.userId}/${survey.id}/building_photo/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("surveys").upload(path, file);
    if (!error) allFileRecords.push({ file_path: path, file_name: file.name, file_type: "building_photo" });
  }

  // Screenshots
  for (const of2 of payload.screenshots) {
    const file = offlineFileToFile(of2);
    const ext = file.name.split(".").pop();
    const path = `${payload.userId}/${survey.id}/screenshot/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("surveys").upload(path, file);
    if (!error) allFileRecords.push({ file_path: path, file_name: file.name, file_type: "screenshot" });
  }

  // Inspection PDF
  if (payload.inspectionPdf) {
    const file = offlineFileToFile(payload.inspectionPdf);
    const path = `${payload.userId}/${survey.id}/inspection_pdf/${crypto.randomUUID()}.pdf`;
    const { error } = await supabase.storage.from("surveys").upload(path, file, { contentType: "application/pdf" });
    if (!error) {
      allFileRecords.push({ file_path: path, file_name: file.name, file_type: "inspection_pdf" });
      // Update assignment pdf_url
      if (payload.assignmentId) {
        const { data: signedData } = await supabase.storage.from("surveys").createSignedUrl(path, 60 * 60 * 24 * 365);
        await supabase
          .from("assignments")
          .update({ pdf_url: signedData?.signedUrl || path })
          .eq("id", payload.assignmentId);
      }
    }
  }

  // 3. Save file records
  if (allFileRecords.length > 0) {
    await supabase
      .from("survey_files")
      .insert(allFileRecords.map((f) => ({ ...f, survey_id: survey.id, organization_id: payload.organizationId })));
  }

  // 4. Auto-advance assignment to pre_committed
  if (payload.autoStatus === "ΠΡΟΔΕΣΜΕΥΣΗ ΥΛΙΚΩΝ" && payload.assignmentId) {
    const validStatuses = ["inspection", "pending", "assigned"];
    if (payload.assignmentStatus && validStatuses.includes(payload.assignmentStatus)) {
      await supabase
        .from("assignments")
        .update({ status: "pre_committed" })
        .eq("id", payload.assignmentId);
    }
  }

  // 5. Fire-and-forget background processing
  supabase.functions
    .invoke("process-survey-completion", {
      body: { survey_id: survey.id, sr_id: payload.srId, area: payload.area },
    })
    .catch((err) => console.error("Background processing trigger error:", err));
}
