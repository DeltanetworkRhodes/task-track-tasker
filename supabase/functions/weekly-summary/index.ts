import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    // Get all organizations
    const { data: orgs } = await supabase.from("organizations").select("id, name").eq("status", "active");

    const results: any[] = [];

    for (const org of (orgs || [])) {
      // Get org email settings
      const { data: settings } = await supabase
        .from("org_settings")
        .select("setting_key, setting_value")
        .eq("organization_id", org.id)
        .in("setting_key", ["email_from", "email_reply_to", "report_to_emails", "weekly_summary_enabled"]);

      const settingsMap = new Map((settings || []).map((s: any) => [s.setting_key, s.setting_value]));

      // Skip if weekly summary is disabled
      if (settingsMap.get("weekly_summary_enabled") === "false") continue;

      const emailFrom = settingsMap.get("email_from");
      const reportTo = settingsMap.get("report_to_emails");
      if (!emailFrom || !reportTo) continue;

      const replyTo = settingsMap.get("email_reply_to") || emailFrom;
      const toEmails = reportTo.split(",").map((e: string) => e.trim()).filter(Boolean);
      if (toEmails.length === 0) continue;

      // Calculate date range (last 7 days)
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const weekAgoStr = weekAgo.toISOString();
      const prevWeekAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

      // This week's stats
      const { count: newAssignments } = await supabase
        .from("assignments").select("id", { count: "exact", head: true })
        .eq("organization_id", org.id).gte("created_at", weekAgoStr);

      const { count: completedAssignments } = await supabase
        .from("assignments").select("id", { count: "exact", head: true })
        .eq("organization_id", org.id).eq("status", "completed").gte("updated_at", weekAgoStr);

      const { count: newSurveys } = await supabase
        .from("surveys").select("id", { count: "exact", head: true })
        .eq("organization_id", org.id).gte("created_at", weekAgoStr);

      const { count: newConstructions } = await supabase
        .from("constructions").select("id", { count: "exact", head: true })
        .eq("organization_id", org.id).gte("created_at", weekAgoStr);

      // Revenue this week
      const { data: weekConstructions } = await supabase
        .from("constructions").select("revenue, profit")
        .eq("organization_id", org.id).gte("created_at", weekAgoStr);

      const weekRevenue = (weekConstructions || []).reduce((s: number, c: any) => s + Number(c.revenue || 0), 0);
      const weekProfit = (weekConstructions || []).reduce((s: number, c: any) => s + Number(c.profit || 0), 0);

      // Previous week for comparison
      const { count: prevCompleted } = await supabase
        .from("assignments").select("id", { count: "exact", head: true })
        .eq("organization_id", org.id).eq("status", "completed")
        .gte("updated_at", prevWeekAgo).lt("updated_at", weekAgoStr);

      // Pending assignments
      const { count: pendingCount } = await supabase
        .from("assignments").select("id", { count: "exact", head: true })
        .eq("organization_id", org.id).not("status", "in", '("completed","cancelled")');

      const completedChange = (completedAssignments || 0) - (prevCompleted || 0);
      const changeIcon = completedChange > 0 ? "📈" : completedChange < 0 ? "📉" : "➡️";

      const weekStart = weekAgo.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit" });
      const weekEnd = now.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" });

      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8f9fa;padding:32px 16px;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:24px 32px;">
    <h1 style="color:#fff;font-size:20px;margin:0;">📊 Εβδομαδιαία Σύνοψη</h1>
    <p style="color:rgba(255,255,255,0.6);font-size:13px;margin:6px 0 0;">${escapeHtml(org.name)} — ${weekStart} έως ${weekEnd}</p>
  </div>
  <div style="padding:24px 32px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <span style="color:#666;font-size:13px;">Νέες Αναθέσεις</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;font-size:18px;">
          ${newAssignments || 0}
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <span style="color:#666;font-size:13px;">Ολοκληρωμένες</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;font-size:18px;color:#22c55e;">
          ${completedAssignments || 0}
          <span style="font-size:12px;color:#888;margin-left:8px;">${changeIcon} ${completedChange >= 0 ? '+' : ''}${completedChange} vs προηγ.</span>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <span style="color:#666;font-size:13px;">Αυτοψίες</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;font-size:18px;">
          ${newSurveys || 0}
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <span style="color:#666;font-size:13px;">Κατασκευές</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;font-size:18px;">
          ${newConstructions || 0}
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <span style="color:#666;font-size:13px;">Έσοδα Εβδομάδας</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;font-size:18px;color:#3b82f6;">
          ${weekRevenue.toLocaleString("el-GR")}€
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <span style="color:#666;font-size:13px;">Κέρδος Εβδομάδας</span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700;font-size:18px;color:#22c55e;">
          ${weekProfit.toLocaleString("el-GR")}€
        </td>
      </tr>
      <tr>
        <td style="padding:12px 0;">
          <span style="color:#666;font-size:13px;">Εκκρεμείς Αναθέσεις</span>
        </td>
        <td style="padding:12px 0;text-align:right;font-weight:700;font-size:18px;color:#f59e0b;">
          ${pendingCount || 0}
        </td>
      </tr>
    </table>
  </div>
  <div style="background:#f8f9fa;padding:16px 32px;text-align:center;">
    <p style="color:#999;font-size:11px;margin:0;">Αυτό το email αποστέλλεται αυτόματα κάθε Δευτέρα.</p>
  </div>
</div>
</body></html>`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: emailFrom,
          reply_to: replyTo,
          to: toEmails,
          subject: `📊 Εβδομαδιαία Σύνοψη — ${escapeHtml(org.name)} (${weekStart}–${weekEnd})`,
          html,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error(`Resend error for org ${org.id}:`, err);
        results.push({ org: org.name, success: false, error: err });
      } else {
        results.push({ org: org.name, success: true });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Weekly summary error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
