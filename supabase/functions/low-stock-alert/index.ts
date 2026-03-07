import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const alertEmail = Deno.env.get("LOW_STOCK_ALERT_EMAIL");

    if (!resendApiKey || !alertEmail) {
      throw new Error("Missing RESEND_API_KEY or LOW_STOCK_ALERT_EMAIL");
    }

    const { data: allOte, error } = await supabase
      .from("materials")
      .select("code, name, stock, unit, low_stock_threshold")
      .eq("source", "OTE")
      .order("stock", { ascending: true });

    if (error) throw error;

    const lowStockItems = (allOte || []).filter(
      (m: any) => Number(m.stock) < Number(m.low_stock_threshold)
    );

    if (!lowStockItems || lowStockItems.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No low stock OTE items", sent: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows = lowStockItems.map(item => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 14px; font-family: monospace; font-weight: 600; color: #1a9a8a;">${escapeHtml(item.code)}</td>
        <td style="padding: 10px 14px; color: #1a2332;">${escapeHtml(item.name)}</td>
        <td style="padding: 10px 14px; text-align: right; font-family: monospace; font-weight: 700; color: ${Number(item.stock) < 50 ? '#dc2626' : '#ea580c'};">
          ${Number(item.stock).toLocaleString('el-GR')} ${escapeHtml(item.unit)}
        </td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f7fa;">
        <div style="background: linear-gradient(135deg, #ea580c, #dc2626); padding: 24px 28px; border-radius: 12px 12px 0 0;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 24px;">⚠️</span>
            <div>
              <h1 style="color: white; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.3px;">Χαμηλά Αποθέματα OTE</h1>
              <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 13px;">${lowStockItems.length} υλικά κάτω από το όριο</p>
            </div>
          </div>
        </div>
        <div style="background: white; border: 1px solid #d1d9e0; border-top: none; border-radius: 0 0 12px 12px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #f0f4f8;">
                <th style="padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #718096; letter-spacing: 0.5px; font-weight: 600;">Κωδικός</th>
                <th style="padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; color: #718096; letter-spacing: 0.5px; font-weight: 600;">Περιγραφή</th>
                <th style="padding: 10px 14px; text-align: right; font-size: 11px; text-transform: uppercase; color: #718096; letter-spacing: 0.5px; font-weight: 600;">Απόθεμα</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p style="color: #718096; font-size: 11px; margin-top: 16px; text-align: center;">DeltaNet FTTH Ops — Αυτόματη ειδοποίηση αποθέματος</p>
      </div>
    `;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "DeltaNet Alerts <noreply@deltanetwork.gr>",
        to: [alertEmail],
        reply_to: "info@deltanetwork.gr",
        subject: `⚠️ ${lowStockItems.length} υλικά OTE σε χαμηλό απόθεμα`,
        html,
      }),
    });

    const emailResult = await emailRes.json();

    if (!emailRes.ok) {
      throw new Error(`Resend error: ${JSON.stringify(emailResult)}`);
    }

    return new Response(JSON.stringify({
      success: true,
      sent: true,
      low_stock_count: lowStockItems.length,
      email_id: emailResult.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Low stock alert error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
