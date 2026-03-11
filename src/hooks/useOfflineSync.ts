import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOnlineStatus } from "./useOnlineStatus";
import {
  getPendingSurveys,
  dequeueSurvey,
  getPendingSurveyCount,
  getPendingConstructions,
  dequeueConstruction,
  getPendingConstructionCount,
  offlineFileToFile,
  type OfflineSurveyPayload,
  type OfflineConstructionPayload,
} from "@/lib/offlineQueue";

/**
 * Hook that automatically syncs offline surveys & constructions when connection returns.
 * Should be mounted once at the app level (e.g. in AppLayout).
 */
export function useOfflineSync() {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const syncing = useRef(false);
  const [pendingSurveyCount, setPendingSurveyCount] = useState(0);
  const [pendingConstructionCount, setPendingConstructionCount] = useState(0);

  const pendingCount = pendingSurveyCount + pendingConstructionCount;

  // Poll pending counts
  const refreshPendingCounts = useCallback(async () => {
    const [sc, cc] = await Promise.all([
      getPendingSurveyCount(),
      getPendingConstructionCount(),
    ]);
    setPendingSurveyCount(sc);
    setPendingConstructionCount(cc);
  }, []);

  useEffect(() => {
    refreshPendingCounts();
    const interval = setInterval(refreshPendingCounts, 5000);
    return () => clearInterval(interval);
  }, [refreshPendingCounts]);

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
      // ═══════ Sync Surveys ═══════
      const pendingSurveys = await getPendingSurveys();
      if (pendingSurveys.length > 0) {
        toast.info(`Συγχρονισμός ${pendingSurveys.length} αυτοψιών...`);
        let synced = 0;
        let failed = 0;

        for (const payload of pendingSurveys) {
          try {
            await syncSurvey(payload);
            await dequeueSurvey(payload.id);
            synced++;
          } catch (err) {
            console.error(`Offline sync failed for survey ${payload.srId}:`, err);
            failed++;
          }
        }

        if (synced > 0) {
          queryClient.invalidateQueries({ queryKey: ["surveys"] });
          queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
          toast.success(`${synced} αυτοψίες συγχρονίστηκαν!${failed > 0 ? ` (${failed} αποτυχίες)` : ""}`);
        }
      }

      // ═══════ Sync Constructions ═══════
      const pendingConstructions = await getPendingConstructions();
      if (pendingConstructions.length > 0) {
        toast.info(`Συγχρονισμός ${pendingConstructions.length} κατασκευών...`);
        let synced = 0;
        let failed = 0;

        for (const payload of pendingConstructions) {
          try {
            await syncConstruction(payload);
            await dequeueConstruction(payload.id);
            synced++;
          } catch (err) {
            console.error(`Offline sync failed for construction ${payload.srId}:`, err);
            failed++;
          }
        }

        if (synced > 0) {
          queryClient.invalidateQueries({ queryKey: ["constructions"] });
          queryClient.invalidateQueries({ queryKey: ["technician-assignments"] });
          toast.success(`${synced} κατασκευές συγχρονίστηκαν!${failed > 0 ? ` (${failed} αποτυχίες)` : ""}`);
        }
      }

      await refreshPendingCounts();
    } finally {
      syncing.current = false;
    }
  }, [queryClient, refreshPendingCounts]);

  return { pendingCount, pendingSurveyCount, pendingConstructionCount, online, syncAll };
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

/**
 * Upload a single offline construction to Supabase
 */
async function syncConstruction(payload: OfflineConstructionPayload) {
  const routesData = payload.routes
    .filter((r) => r.koi || r.fyraKoi)
    .map((r) => ({ label: r.label, koi: parseFloat(r.koi) || 0, fyra_koi: parseFloat(r.fyraKoi) || 0 }));

  // 1. Insert construction
  const { data: construction, error: constError } = await supabase
    .from("constructions")
    .insert({
      sr_id: payload.srId,
      assignment_id: payload.assignmentId,
      ses_id: payload.sesId.trim() || null,
      ak: payload.ak.trim() || null,
      cab: payload.cab.trim(),
      floors: parseInt(payload.floors) || 0,
      revenue: payload.totalRevenue,
      material_cost: payload.totalMaterialCost,
      status: "completed",
      routing_type: payload.routingType.trim() || null,
      pending_note: payload.pendingNote.trim() || null,
      routes: routesData.length > 0 ? routesData : null,
      organization_id: payload.organizationId,
    } as any)
    .select("id")
    .single();
  if (constError) throw constError;

  // 2. Insert works
  if (payload.workItems.length > 0) {
    await supabase.from("construction_works").insert(
      payload.workItems.map((w) => ({
        construction_id: construction.id,
        work_pricing_id: w.work_pricing_id,
        quantity: w.quantity,
        unit_price: w.unit_price,
        subtotal: w.unit_price * w.quantity,
        organization_id: payload.organizationId,
      }))
    );
  }

  // 3. Insert materials
  if (payload.materialItems.length > 0) {
    await supabase.from("construction_materials").insert(
      payload.materialItems.map((m) => ({
        construction_id: construction.id,
        material_id: m.material_id,
        quantity: m.quantity,
        source: m.source,
        organization_id: payload.organizationId,
      }))
    );
  }

  // 4. Deduct DELTANETWORK stock
  const deltaMats = payload.materialItems.filter((m) => m.source === "DELTANETWORK");
  if (deltaMats.length > 0) {
    await supabase.functions.invoke("deduct-stock", {
      body: {
        construction_id: construction.id,
        materials: deltaMats.map((m) => ({
          material_id: m.material_id,
          quantity: m.quantity,
          source: m.source,
        })),
      },
    }).catch((err) => console.error("Stock deduction error:", err));
  }

  // 5. Upload photos
  const safeSrId = payload.srId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const photoPaths: string[] = [];

  for (const [category, files] of Object.entries(payload.categorizedPhotos)) {
    if (!files || files.length === 0) continue;
    const folderName = payload.photoCategoryMap[category] || category.replace(/[^a-zA-Z0-9_-]/g, "_");

    for (let i = 0; i < files.length; i++) {
      const file = offlineFileToFile(files[i]);
      const ext = file.name.split(".").pop() || "jpg";
      const storagePath = `constructions/${safeSrId}/${construction.id}/${folderName}/${i + 1}.${ext}`;
      const { error } = await supabase.storage
        .from("photos")
        .upload(storagePath, file, { upsert: true });
      if (!error) photoPaths.push(storagePath);
    }
  }

  // 6. Upload OTDR files
  const otdrPaths: string[] = [];
  for (const [category, files] of Object.entries(payload.otdrFiles)) {
    if (!files || files.length === 0) continue;
    const folderName = payload.otdrCategoryMap[category] || `OTDR_${category.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    for (let i = 0; i < files.length; i++) {
      const file = offlineFileToFile(files[i]);
      const storagePath = `constructions/${safeSrId}/${construction.id}/${folderName}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error } = await supabase.storage
        .from("photos")
        .upload(storagePath, file, { upsert: true, contentType: "application/pdf" });
      if (!error) otdrPaths.push(storagePath);
    }
  }

  // 7. Calculate payment amount and update assignment status → submitted
  const paymentAmount = payload.workItems?.reduce((sum: number, w: any) => sum + (w.quantity * w.unit_price), 0) || 0;
  await supabase
    .from("assignments")
    .update({ 
      status: "submitted", 
      cab: payload.cab.trim(),
      payment_amount: paymentAmount,
      submitted_at: new Date().toISOString(),
    } as any)
    .eq("id", payload.assignmentId);

  // 8. Fire-and-forget: docs generation + email
  supabase.functions
    .invoke("generate-construction-docs", {
      body: { construction_id: construction.id, photo_paths: photoPaths, otdr_paths: otdrPaths },
    })
    .then(({ data: docsResult }) => {
      const spreadsheetFile = docsResult?.files?.find((f: any) => f.type === "spreadsheet");
      return supabase.functions.invoke("send-completion-email", {
        body: {
          construction_id: construction.id,
          sr_id: payload.srId,
          photo_paths: photoPaths,
          otdr_paths: otdrPaths,
          spreadsheet_id: spreadsheetFile?.id || null,
          drive_folder_url: docsResult?.sr_folder?.url || null,
        },
      });
    })
    .catch((err) => console.error("Background docs/email error:", err));
}
