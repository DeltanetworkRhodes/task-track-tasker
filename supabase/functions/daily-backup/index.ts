import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Verify cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    if (expectedSecret && cronSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all active organizations
    const { data: orgs, error: orgsErr } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("status", "active");

    if (orgsErr) throw orgsErr;

    const today = new Date().toISOString().split("T")[0];
    const results: any[] = [];

    for (const org of orgs || []) {
      try {
        // 1. Snapshot assignments
        const { data: assignments } = await supabase
          .from("assignments")
          .select("id, sr_id, area, status, technician_id, customer_name, address, cab, phone, call_status, work_type, created_at, updated_at, payment_amount, payment_date")
          .eq("organization_id", org.id);

        // 2. Snapshot materials (stock levels)
        const { data: materials } = await supabase
          .from("materials")
          .select("id, code, name, stock, price, source, unit, low_stock_threshold")
          .eq("organization_id", org.id);

        // 3. Compute changes since last backup
        const { data: lastBackup } = await supabase
          .from("daily_backups")
          .select("assignments_snapshot, materials_snapshot, backup_date")
          .eq("organization_id", org.id)
          .order("backup_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        const changesSummary: any = {
          assignments: { added: 0, removed: 0, status_changed: 0, details: [] as any[] },
          materials: { stock_changes: 0, details: [] as any[] },
        };

        if (lastBackup) {
          // Compare assignments
          const prevAssignments = (lastBackup.assignments_snapshot || []) as any[];
          const prevMap = new Map(prevAssignments.map((a: any) => [a.id, a]));
          const currMap = new Map((assignments || []).map((a: any) => [a.id, a]));

          // New assignments
          for (const a of assignments || []) {
            if (!prevMap.has(a.id)) {
              changesSummary.assignments.added++;
              changesSummary.assignments.details.push({
                type: "added",
                sr_id: a.sr_id,
                status: a.status,
              });
            } else {
              const prev = prevMap.get(a.id);
              if (prev.status !== a.status) {
                changesSummary.assignments.status_changed++;
                changesSummary.assignments.details.push({
                  type: "status_changed",
                  sr_id: a.sr_id,
                  from: prev.status,
                  to: a.status,
                });
              }
            }
          }

          // Removed assignments
          for (const [id, prev] of prevMap) {
            if (!currMap.has(id)) {
              changesSummary.assignments.removed++;
              changesSummary.assignments.details.push({
                type: "removed",
                sr_id: (prev as any).sr_id,
              });
            }
          }

          // Compare materials stock
          const prevMaterials = (lastBackup.materials_snapshot || []) as any[];
          const prevMatMap = new Map(prevMaterials.map((m: any) => [m.id, m]));

          for (const m of materials || []) {
            const prev = prevMatMap.get(m.id);
            if (prev && prev.stock !== m.stock) {
              changesSummary.materials.stock_changes++;
              changesSummary.materials.details.push({
                code: m.code,
                name: m.name,
                from: prev.stock,
                to: m.stock,
                diff: m.stock - prev.stock,
              });
            }
          }
        }

        // 4. Upsert backup
        const { error: upsertErr } = await supabase
          .from("daily_backups")
          .upsert(
            {
              organization_id: org.id,
              backup_date: today,
              backup_type: "full_snapshot",
              assignments_snapshot: assignments || [],
              materials_snapshot: materials || [],
              assignments_count: (assignments || []).length,
              materials_count: (materials || []).length,
              changes_summary: changesSummary,
            },
            { onConflict: "organization_id,backup_date" }
          );

        if (upsertErr) throw upsertErr;

        results.push({
          org: org.name,
          assignments: (assignments || []).length,
          materials: (materials || []).length,
          changes: {
            assignments_added: changesSummary.assignments.added,
            assignments_removed: changesSummary.assignments.removed,
            status_changed: changesSummary.assignments.status_changed,
            stock_changes: changesSummary.materials.stock_changes,
          },
        });
      } catch (e: any) {
        console.error(`Backup error for ${org.name}:`, e.message);
        results.push({ org: org.name, error: e.message });
      }
    }

    return new Response(JSON.stringify({ success: true, date: today, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Daily backup error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
