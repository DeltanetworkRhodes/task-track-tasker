import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Find incomplete surveys older than 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: staleSurveys, error: surveyError } = await adminClient
      .from("surveys")
      .select("id, sr_id, area, technician_id, created_at")
      .eq("status", "ΕΛΛΙΠΗΣ ΑΥΤΟΨΙΑ")
      .lt("created_at", twentyFourHoursAgo);

    if (surveyError) {
      console.error("Query error:", surveyError);
      throw surveyError;
    }

    if (!staleSurveys || staleSurveys.length === 0) {
      console.log("No stale incomplete surveys found");
      return new Response(
        JSON.stringify({ message: "No stale surveys", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${staleSurveys.length} stale incomplete surveys`);

    // Get all admin user IDs
    const { data: adminRoles } = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = (adminRoles || []).map((r: any) => r.user_id);

    if (adminIds.length === 0) {
      console.log("No admins found");
      return new Response(
        JSON.stringify({ message: "No admins", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get technician names
    const techIds = [...new Set(staleSurveys.map((s: any) => s.technician_id))];
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", techIds);

    const profileMap: Record<string, string> = {};
    (profiles || []).forEach((p: any) => {
      profileMap[p.user_id] = p.full_name;
    });

    // Check existing notifications to avoid duplicates (same survey_id in last 24h)
    const { data: recentNotifs } = await adminClient
      .from("notifications")
      .select("data")
      .gt("created_at", twentyFourHoursAgo)
      .eq("title", "Εκκρεμής Ελλιπής Αυτοψία");

    const alreadyNotifiedSurveyIds = new Set(
      (recentNotifs || [])
        .map((n: any) => n.data?.survey_id)
        .filter(Boolean)
    );

    // Create notifications for each admin for each stale survey
    const notifications: any[] = [];
    for (const survey of staleSurveys) {
      if (alreadyNotifiedSurveyIds.has(survey.id)) {
        console.log(`Already notified for survey ${survey.sr_id}, skipping`);
        continue;
      }

      const techName = profileMap[survey.technician_id] || "Τεχνικός";
      const hoursAgo = Math.round(
        (Date.now() - new Date(survey.created_at).getTime()) / (1000 * 60 * 60)
      );

      for (const adminId of adminIds) {
        notifications.push({
          user_id: adminId,
          title: "Εκκρεμής Ελλιπής Αυτοψία",
          message: `Η αυτοψία ${survey.sr_id} (${survey.area}) του ${techName} είναι ελλιπής εδώ και ${hoursAgo} ώρες`,
          data: {
            survey_id: survey.id,
            sr_id: survey.sr_id,
            area: survey.area,
            technician_id: survey.technician_id,
            hours_pending: hoursAgo,
          },
        });
      }
    }

    if (notifications.length > 0) {
      const { error: insertError } = await adminClient
        .from("notifications")
        .insert(notifications);

      if (insertError) {
        console.error("Insert notifications error:", insertError);
        throw insertError;
      }
      console.log(`Created ${notifications.length} notifications`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        stale_surveys: staleSurveys.length,
        notifications_created: notifications.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Check stale surveys error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
