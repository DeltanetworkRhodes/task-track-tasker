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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { construction_id, materials } = await req.json();

    if (!construction_id || !materials || !Array.isArray(materials)) {
      return new Response(
        JSON.stringify({ error: "Missing construction_id or materials" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const item of materials) {
      if (item.source !== "DELTANETWORK") continue;

      const { data: material, error: fetchErr } = await supabase
        .from("materials")
        .select("id, stock, name")
        .eq("id", item.material_id)
        .single();

      if (fetchErr || !material) {
        results.push({ material_id: item.material_id, error: "not found" });
        continue;
      }

      const newStock = Math.max(0, material.stock - item.quantity);
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
          previous_stock: material.stock,
          deducted: item.quantity,
          new_stock: newStock,
        });
      }
    }

    console.log(`Stock deducted for construction ${construction_id}:`, results);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Deduct stock error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
