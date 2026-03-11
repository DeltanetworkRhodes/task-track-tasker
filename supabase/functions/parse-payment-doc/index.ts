import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { file_path, organization_id } = await req.json();
    if (!file_path) throw new Error("file_path required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Download the file from storage
    const { data: fileData, error: dlErr } = await supabase.storage
      .from("payment-docs")
      .download(file_path);
    if (dlErr) throw dlErr;

    // Convert to base64 for AI
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64 = btoa(binary);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Determine mime type
    const ext = file_path.split(".").pop()?.toLowerCase();
    const mimeType = ext === "pdf" ? "application/pdf" 
      : ext === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : ext === "csv" ? "text/csv"
      : "application/octet-stream";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are a document parser for OTE (Greek telecom) payment documents. Extract all SR IDs and their corresponding payment amounts. Return ONLY valid JSON array. Each item should have: sr_id (string), amount (number), date (string YYYY-MM-DD or null), status (always "paid"). If you cannot find SR IDs, return empty array [].`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Ανάλυσε αυτό το έγγραφο πληρωμής ΟΤΕ. Βρες όλα τα SR IDs και τα αντίστοιχα ποσά. Επέστρεψε JSON array."
              },
              ...(mimeType === "application/pdf" || mimeType.includes("spreadsheet") ? [{
                type: "image_url" as const,
                image_url: { url: `data:${mimeType};base64,${base64}` }
              }] : [{
                type: "text" as const,
                text: new TextDecoder().decode(bytes)
              }])
            ]
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_payment_data",
            description: "Extract SR payment data from the document",
            parameters: {
              type: "object",
              properties: {
                results: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      sr_id: { type: "string" },
                      amount: { type: "number" },
                      date: { type: "string" },
                      status: { type: "string", enum: ["paid"] }
                    },
                    required: ["sr_id", "amount", "status"],
                    additionalProperties: false
                  }
                }
              },
              required: ["results"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_payment_data" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required for AI credits" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const text = await response.text();
      console.error("AI error:", response.status, text);
      throw new Error("AI analysis failed");
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let results: any[] = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        results = parsed.results || [];
      } catch {
        console.error("Failed to parse tool call arguments");
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-payment-doc error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
