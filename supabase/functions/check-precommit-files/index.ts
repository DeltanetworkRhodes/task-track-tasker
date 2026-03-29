import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const REQUIRED_FILE_TYPES = ["building_photo", "screenshot", "inspection_pdf"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all pre_committed assignments
    const { data: assignments, error: assignError } = await supabase
      .from("assignments")
      .select("id, sr_id, area, drive_folder_url, pdf_url, organization_id")
      .eq("status", "pre_committed");

    if (assignError) throw assignError;
    if (!assignments || assignments.length === 0) {
      return new Response(
        JSON.stringify({ message: "Δεν βρέθηκαν αναθέσεις σε προδέσμευση", moved: 0, pending: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get all surveys for these assignments
    const srIds = assignments.map((a) => a.sr_id);

    const { data: surveys } = await supabase
      .from("surveys")
      .select("id, sr_id")
      .in("sr_id", srIds);

    const surveyMap: Record<string, string> = {};
    for (const s of surveys || []) {
      surveyMap[s.sr_id] = s.id;
    }

    // Get survey files for all relevant surveys
    const surveyIds = Object.values(surveyMap);
    let filesBySurvey: Record<string, Set<string>> = {};

    if (surveyIds.length > 0) {
      const { data: files } = await supabase
        .from("survey_files")
        .select("survey_id, file_type")
        .in("survey_id", surveyIds);

      for (const f of files || []) {
        if (!filesBySurvey[f.survey_id]) filesBySurvey[f.survey_id] = new Set();
        filesBySurvey[f.survey_id].add(f.file_type);
      }
    }

    const movedToInspection: string[] = [];
    const movedToPending: string[] = [];

    for (const a of assignments) {
      const surveyId = surveyMap[a.sr_id];
      const fileTypes = surveyId ? filesBySurvey[surveyId] || new Set() : new Set();

      // Check all requirements
      const hasAllFiles = REQUIRED_FILE_TYPES.every((t) => fileTypes.has(t));
      const hasDriveFolder = !!a.drive_folder_url;

      if (hasAllFiles && hasDriveFolder) {
        // Move to inspection
        await supabase
          .from("assignments")
          .update({ status: "inspection" })
          .eq("id", a.id);
        movedToInspection.push(a.sr_id);
      } else {
        // Move back to pending & move Drive folder to ΑΝΑΜΟΝΗ
        await supabase
          .from("assignments")
          .update({ status: "pending" })
          .eq("id", a.id);
        movedToPending.push(a.sr_id);

        // Move folder to ΑΝΑΜΟΝΗ in Drive
        if (a.organization_id) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/move-sr-folder`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                sr_id: a.sr_id,
                target_folder: "ΑΝΑΜΟΝΗ",
                organization_id: a.organization_id,
              }),
            });
          } catch (e) {
            console.error(`Failed to move ${a.sr_id} to ΑΝΑΜΟΝΗ:`, e);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: `Ελέγχθηκαν ${assignments.length} αναθέσεις`,
        moved: movedToInspection.length,
        pending: movedToPending.length,
        details: {
          toInspection: movedToInspection,
          toPending: movedToPending,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
