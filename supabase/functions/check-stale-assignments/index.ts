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

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    // Find assignments that haven't been updated in 3+ days and are still active
    const { data: staleAssignments, error } = await supabase
      .from("assignments")
      .select("id, sr_id, area, status, technician_id, updated_at")
      .lt("updated_at", threeDaysAgo)
      .not("status", "in", '("completed","cancelled")')
      .order("updated_at", { ascending: true });

    if (error) throw error;

    if (!staleAssignments || staleAssignments.length === 0) {
      return new Response(JSON.stringify({ message: "No stale assignments", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all admin user_ids
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = (admins || []).map(a => a.user_id);

    // Create notifications for each admin
    const notifications = [];
    for (const admin of adminIds) {
      // Group notification
      const srList = staleAssignments.slice(0, 5).map(a => a.sr_id).join(", ");
      const extra = staleAssignments.length > 5 ? ` (+${staleAssignments.length - 5} ακόμα)` : "";

      notifications.push({
        user_id: admin,
        title: `⚠️ ${staleAssignments.length} αναθέσεις σε αδράνεια`,
        message: `Οι αναθέσεις ${srList}${extra} δεν έχουν ενημερωθεί >3 ημέρες`,
        data: { type: "stale_assignments", count: staleAssignments.length },
      });
    }

    if (notifications.length > 0) {
      const { error: notifError } = await supabase
        .from("notifications")
        .insert(notifications);
      if (notifError) console.error("Notification error:", notifError);
    }

    // Also check for unassigned assignments (no technician)
    const unassigned = staleAssignments.filter(a => !a.technician_id);

    return new Response(JSON.stringify({
      success: true,
      stale_count: staleAssignments.length,
      unassigned_count: unassigned.length,
      notified_admins: adminIds.length,
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
