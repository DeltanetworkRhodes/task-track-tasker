import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) throw new Error("No file uploaded");

    // Convert PDF to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

    // Use Gemini to extract materials from PDF
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are extracting material delivery data from OTE delivery note PDFs (Δελτίο Αποστολής).
Extract each material line item with its code and quantity delivered.
The codes are typically alphanumeric (e.g. "ΚΩΔ.123", "ABC-456", etc).
Return ONLY a JSON array with objects having "code" (string) and "quantity" (number).
Example: [{"code": "ABC-001", "quantity": 50}, {"code": "DEF-002", "quantity": 100}]
If you cannot find any materials, return an empty array [].
IMPORTANT: Return ONLY the JSON array, no markdown, no explanation.`
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${base64}` }
              },
              {
                type: "text",
                text: "Εξήγαγε τα υλικά και τις ποσότητες από αυτό το δελτίο αποστολής OTE. Επέστρεψε μόνο JSON array."
              }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_materials",
              description: "Extract materials and quantities from a delivery note PDF",
              parameters: {
                type: "object",
                properties: {
                  materials: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        code: { type: "string", description: "Material code" },
                        quantity: { type: "number", description: "Quantity delivered" }
                      },
                      required: ["code", "quantity"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["materials"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_materials" } }
      }),
    });

    if (!aiResponse.ok) {
      const statusCode = aiResponse.status;
      const body = await aiResponse.text();
      if (statusCode === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded, δοκιμάστε ξανά σε λίγο" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (statusCode === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error [${statusCode}]: ${body}`);
    }

    const aiData = await aiResponse.json();
    
    // Extract from tool call response
    let extractedMaterials: { code: string; quantity: number }[] = [];
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      extractedMaterials = parsed.materials || [];
    }

    // Update stock for each extracted material (ADD to existing stock)
    let updated = 0;
    const notFound: string[] = [];

    for (const item of extractedMaterials) {
      const { data: existing } = await supabase
        .from("materials")
        .select("id, code, stock")
        .eq("source", "OTE")
        .ilike("code", `%${item.code}%`)
        .limit(1);

      if (existing && existing.length > 0) {
        const newStock = Number(existing[0].stock) + item.quantity;
        const { error } = await supabase
          .from("materials")
          .update({ stock: newStock })
          .eq("id", existing[0].id);
        
        if (!error) updated++;
      } else {
        notFound.push(item.code);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      extracted: extractedMaterials,
      updated,
      not_found: notFound,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Parse delivery note error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
