import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all organizations and their configurable thresholds
    const { data: orgSettings } = await supabase
      .from("org_settings")
      .select("organization_id, setting_value")
      .eq("setting_key", "stale_threshold_days");

    const thresholdMap = new Map<string, number>();
    (orgSettings || []).forEach((s: any) => {
      const days = parseInt(s.setting_value, 10);
      if (!isNaN(days) && days > 0) thresholdMap.set(s.organization_id, days);
    });

    const defaultThreshold = 3; // fallback

    // Get all admin user_ids with their org
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = (admins || []).map((a: any) => a.user_id);
    const { data: adminProfiles } = await supabase
      .from("profiles")
      .select("user_id, organization_id")
      .in("user_id", adminIds);

    const adminProfileMap = new Map((adminProfiles || []).map((p: any) => [p.user_id, p.organization_id]));

    // Get unique org IDs from admins
    const orgIds = [...new Set((adminProfiles || []).map((p: any) => p.organization_id).filter(Boolean))];

    let totalStale = 0;
    let totalUnassigned = 0;
    const notifications: any[] = [];

    for (const orgId of orgIds) {
      const threshold = thresholdMap.get(orgId) || defaultThreshold;
      const cutoff = new Date(Date.now() - threshold * 24 * 60 * 60 * 1000).toISOString();

      const { data: staleAssignments, error } = await supabase
        .from("assignments")
        .select("id, sr_id, area, status, technician_id, updated_at, organization_id")
        .eq("organization_id", orgId)
        .lt("updated_at", cutoff)
        .not("status", "in", '("completed","cancelled")')
        .order("updated_at", { ascending: true });

      if (error) { console.error("Query error for org", orgId, error); continue; }
      if (!staleAssignments || staleAssignments.length === 0) continue;

      totalStale += staleAssignments.length;
      totalUnassigned += staleAssignments.filter((a: any) => !a.technician_id).length;

      // Notify admins of this org
      for (const adminId of adminIds) {
        if (adminProfileMap.get(adminId) !== orgId) continue;

        const srList = staleAssignments.slice(0, 5).map((a: any) => a.sr_id).join(", ");
        const extra = staleAssignments.length > 5 ? ` (+${staleAssignments.length - 5} ακόμα)` : "";

        notifications.push({
          user_id: adminId,
          title: `⚠️ ${staleAssignments.length} αναθέσεις σε αδράνεια`,
          message: `Οι αναθέσεις ${srList}${extra} δεν έχουν ενημερωθεί >${threshold} ημέρες`,
          data: { type: "stale_assignments", count: staleAssignments.length, threshold },
          organization_id: orgId,
        });
      }
    }

    if (notifications.length > 0) {
      const { error: notifError } = await supabase
        .from("notifications")
        .insert(notifications);
      if (notifError) console.error("Notification error:", notifError);
    }

    return new Response(JSON.stringify({
      success: true,
      stale_count: totalStale,
      unassigned_count: totalUnassigned,
      notified_admins: notifications.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Stale check error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
