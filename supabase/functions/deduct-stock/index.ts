import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type StockDeltaInput = {
  material_id: string;
  quantity: number;
  source?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const constructionId = body?.construction_id as string | undefined;
    const rawDeltas = Array.isArray(body?.material_deltas)
      ? body.material_deltas
      : Array.isArray(body?.materials)
        ? body.materials
        : [];

    const materialDeltas: StockDeltaInput[] = rawDeltas
      .map((item: any) => ({
        material_id: String(item?.material_id || ""),
        quantity: Number(item?.quantity || 0),
        source: typeof item?.source === "string" ? item.source : undefined,
      }))
      .filter((item: StockDeltaInput) => item.material_id && Number.isFinite(item.quantity) && item.quantity !== 0);

    if (!constructionId || materialDeltas.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing construction_id or material deltas" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check roles
    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (roleError) {
      return new Response(JSON.stringify({ error: "Role check failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roles = new Set((roleRows || []).map((r: any) => r.role));
    const isAdmin = roles.has("admin") || roles.has("super_admin");
    const isTechnician = roles.has("technician");

    let isAssignedTechnician = false;
    let assignmentTechnicianId: string | null = null;
    let constructionSrId: string | null = null;

    // Get construction info
    const { data: constructionRow } = await supabase
      .from("constructions")
      .select("assignment_id, sr_id")
      .eq("id", constructionId)
      .maybeSingle();

    if (constructionRow?.assignment_id) {
      constructionSrId = constructionRow.sr_id || null;
      const { data: assignmentRow } = await supabase
        .from("assignments")
        .select("technician_id, organization_id")
        .eq("id", constructionRow.assignment_id)
        .maybeSingle();

      if (assignmentRow) {
        assignmentTechnicianId = assignmentRow.technician_id;
        isAssignedTechnician = assignmentRow.technician_id === userId;
      }
    }

    if (!isAdmin && !isAssignedTechnician) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<Record<string, unknown>> = [];

    // Determine if we should deduct from technician inventory or central warehouse
    // If admin does it → deduct from central warehouse (existing behavior)
    // If technician does it → deduct from technician's personal inventory
    const deductFromTechInventory = isTechnician && isAssignedTechnician && assignmentTechnicianId;

    for (const item of materialDeltas) {
      if (deductFromTechInventory) {
        // TECHNICIAN PATH: deduct from technician_inventory
        const { data: invRow, error: invErr } = await supabase
          .from("technician_inventory")
          .select("id, quantity")
          .eq("technician_id", assignmentTechnicianId)
          .eq("material_id", item.material_id)
          .maybeSingle();

        const currentQty = Number(invRow?.quantity || 0);

        if (item.quantity > 0) {
          // Consume from technician inventory
          const newQty = Math.max(0, currentQty - item.quantity);
          if (invRow) {
            await supabase
              .from("technician_inventory")
              .update({ quantity: newQty, updated_at: new Date().toISOString() })
              .eq("id", invRow.id);
          }

          // Log history
          await supabase.from("technician_inventory_history").insert({
            technician_id: assignmentTechnicianId,
            material_id: item.material_id,
            organization_id: (await supabase.from("profiles").select("organization_id").eq("user_id", assignmentTechnicianId).maybeSingle()).data?.organization_id,
            change_amount: -item.quantity,
            reason: `Κατασκευή SR ${constructionSrId || ""}`.trim(),
            construction_sr_id: constructionSrId,
            changed_by: userId,
          });

          results.push({
            material_id: item.material_id,
            source: "technician_inventory",
            previous_qty: currentQty,
            requested_delta: item.quantity,
            new_qty: newQty,
          });
        } else if (item.quantity < 0) {
          // Return to technician inventory
          const returnQty = Math.abs(item.quantity);
          const newQty = currentQty + returnQty;
          if (invRow) {
            await supabase
              .from("technician_inventory")
              .update({ quantity: newQty, updated_at: new Date().toISOString() })
              .eq("id", invRow.id);
          } else {
            const orgData = await supabase.from("profiles").select("organization_id").eq("user_id", assignmentTechnicianId).maybeSingle();
            await supabase.from("technician_inventory").insert({
              technician_id: assignmentTechnicianId,
              material_id: item.material_id,
              organization_id: orgData.data?.organization_id,
              quantity: returnQty,
            });
          }

          await supabase.from("technician_inventory_history").insert({
            technician_id: assignmentTechnicianId,
            material_id: item.material_id,
            organization_id: (await supabase.from("profiles").select("organization_id").eq("user_id", assignmentTechnicianId).maybeSingle()).data?.organization_id,
            change_amount: returnQty,
            reason: `Επιστροφή από SR ${constructionSrId || ""}`.trim(),
            construction_sr_id: constructionSrId,
            changed_by: userId,
          });

          results.push({
            material_id: item.material_id,
            source: "technician_inventory",
            previous_qty: currentQty,
            requested_delta: item.quantity,
            new_qty: newQty,
          });
        }
      } else {
        // ADMIN PATH: deduct from central warehouse (original behavior)
        const { data: material, error: fetchErr } = await supabase
          .from("materials")
          .select("id, stock, name")
          .eq("id", item.material_id)
          .maybeSingle();

        if (fetchErr || !material) {
          results.push({ material_id: item.material_id, error: "not found" });
          continue;
        }

        const currentStock = Number(material.stock) || 0;
        let newStock = currentStock;

        if (item.quantity > 0) {
          newStock = Math.max(0, currentStock - item.quantity);
        } else if (item.quantity < 0) {
          newStock = currentStock + Math.abs(item.quantity);
        }

        const { error: updateErr } = await supabase
          .from("materials")
          .update({ stock: newStock })
          .eq("id", item.material_id);

        if (updateErr) {
          results.push({ material_id: item.material_id, error: updateErr.message });
        } else {
          results.push({
            material_id: item.material_id,
            name: material.name,
            source: "central_warehouse",
            previous_stock: currentStock,
            requested_delta: item.quantity,
            applied_delta: currentStock - newStock,
            new_stock: newStock,
          });
        }
      }
    }

    const hasErrors = results.some((r) => typeof r.error === "string");

    console.log(`Stock synchronized for construction ${constructionId}:`, results);

    return new Response(
      JSON.stringify({
        success: !hasErrors,
        construction_id: constructionId,
        processed: results.length,
        deducted_from: deductFromTechInventory ? "technician_inventory" : "central_warehouse",
        results,
      }),
      {
        status: hasErrors ? 207 : 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Deduct stock error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
