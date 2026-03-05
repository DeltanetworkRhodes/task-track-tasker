import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendGmail } from "../_shared/gmail.ts";

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

const GMAIL_SENDER = "info@deltanetwork.gr";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const alertEmail = Deno.env.get("LOW_STOCK_ALERT_EMAIL");
    if (!alertEmail) {
      throw new Error("Missing LOW_STOCK_ALERT_EMAIL");
    }

    // Get OTE materials where stock < their individual low_stock_threshold
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

    // Build email HTML
    const rows = lowStockItems.map(item => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 10px 12px; font-family: monospace; font-weight: 600; color: #e4006e;">${escapeHtml(item.code)}</td>
        <td style="padding: 10px 12px;">${escapeHtml(item.name)}</td>
        <td style="padding: 10px 12px; text-align: right; font-family: monospace; font-weight: 700; color: ${Number(item.stock) < 50 ? '#dc2626' : '#f59e0b'};">
          ${Number(item.stock).toLocaleString('el-GR')} ${escapeHtml(item.unit)}
        </td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #e4006e, #00b140); padding: 24px 32px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">⚠️ Χαμηλά Αποθέματα OTE</h1>
          <p style="color: rgba(255,255,255,0.85); margin: 4px 0 0; font-size: 13px;">${lowStockItems.length} υλικά κάτω από το όριο</p>
        </div>
        <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #f9fafb;">
                <th style="padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280;">Κωδικός</th>
                <th style="padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; color: #6b7280;">Περιγραφή</th>
                <th style="padding: 10px 12px; text-align: right; font-size: 11px; text-transform: uppercase; color: #6b7280;">Απόθεμα</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p style="color: #9ca3af; font-size: 11px; margin-top: 16px; text-align: center;">DeltaNet FTTH Ops — Αυτόματη ειδοποίηση αποθέματος</p>
      </div>
    `;

    const result = await sendGmail(GMAIL_SENDER, {
      to: [alertEmail],
      subject: `⚠️ ${lowStockItems.length} υλικά OTE σε χαμηλό απόθεμα`,
      html,
    });

    return new Response(JSON.stringify({
      success: true,
      sent: true,
      low_stock_count: lowStockItems.length,
      messageId: result.messageId,
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
