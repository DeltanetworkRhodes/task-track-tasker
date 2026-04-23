import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, context, currentFields } = await req.json();

    if (!transcript || typeof transcript !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid transcript" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = getSystemPrompt(context);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Τρέχοντα πεδία (για context): ${JSON.stringify(
              currentFields || {}
            )}\n\nΟ τεχνικός είπε: "${transcript}"\n\nΚάλεσε το tool extract_fields με τα πεδία που αναγνώρισες.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_fields",
              description:
                "Extract construction form fields from the technician's spoken input. Only include fields you're confident about.",
              parameters: {
                type: "object",
                properties: {
                  floors: { type: "number", description: "Αριθμός ορόφων" },
                  building_type: {
                    type: "string",
                    enum: ["mono", "mez", "small_apt", "medium_apt", "large_apt"],
                    description: "Τύπος κτιρίου",
                  },
                  bep_type: {
                    type: "string",
                    enum: ["SMALL", "MEDIUM", "LARGE", "X-LARGE"],
                  },
                  bmo_type: {
                    type: "string",
                    enum: ["SMALL", "MEDIUM", "LARGE", "X-LARGE"],
                  },
                  eisagogi_type: {
                    type: "string",
                    enum: ["ΝΕΑ ΥΠΟΔΟΜΗ", "ΕΣΚΑΛΗΤ", "ΕΣΚΑΛΗΤ Β1", "BCP"],
                  },
                  eisagogi_meters: { type: "number" },
                  bcp_eidos: {
                    type: "string",
                    enum: ["ΔΗΜΟΣΙΟ", "ΙΔΙΩΤΙΚΟ"],
                  },
                  bcp_ms: { type: "number", description: "Μέτρα σκάμματος προς BCP" },
                  bcp_bep_ypogeia: { type: "number" },
                  bcp_bep_enaeria: { type: "number" },
                  horizontal_meters: { type: "number" },
                  fb_same_level_as_bep: { type: "boolean" },
                  cab_to_bep_damaged: { type: "boolean" },
                  ms_skamma: { type: "number" },
                  ball_marker_bep: { type: "number" },
                  ball_marker_bcp: { type: "number" },
                  bmo_bep_distance: { type: "number" },
                },
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_fields" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Πάρα πολλά αιτήματα. Δοκίμασε ξανά σε λίγο." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error: "Έχουν τελειώσει τα credits του Lovable AI workspace.",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    let fields: Record<string, any> = {};

    if (toolCall?.function?.arguments) {
      try {
        fields = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Failed to parse tool args:", e, toolCall.function.arguments);
      }
    } else {
      // Fallback: try to extract JSON from raw content
      const text = data?.choices?.[0]?.message?.content || "";
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          fields = JSON.parse(match[0]);
        } catch {
          /* noop */
        }
      }
    }

    // Φιλτράρισμα null/undefined/empty values
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v === null || v === undefined || v === "") continue;
      cleaned[k] = v;
    }

    return new Response(JSON.stringify({ fields: cleaned }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("parse-voice-input error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getSystemPrompt(_context: string): string {
  return `Είσαι expert AI assistant για Ελληνική εφαρμογή FTTH κατασκευών.
Ο τεχνικός μιλάει στα Ελληνικά και εσύ εξάγεις δομημένα πεδία από τη φωνή του.

ΚΑΝΟΝΕΣ:
- Καλείς ΠΑΝΤΑ το tool "extract_fields" με ΜΟΝΟ τα πεδία για τα οποία είσαι σίγουρος.
- Μην βάζεις πεδίο αν δεν αναφέρθηκε ρητά.
- Ο τεχνικός χρησιμοποιεί καθομιλουμένη / συντομογραφίες — να είσαι ευέλικτος.

ΧΑΡΤΟΓΡΑΦΗΣΗ ΕΛΛΗΝΙΚΩΝ ΟΡΩΝ:
- "δημόσιο/δημοτικό/πεζοδρόμιο/στύλος" → bcp_eidos: "ΔΗΜΟΣΙΟ"
- "ιδιωτικό/αυλή/ιδιοκτησία" → bcp_eidos: "ΙΔΙΩΤΙΚΟ"
- "μικρό" → SMALL, "μεσαίο" → MEDIUM, "μεγάλο" → LARGE, "πολύ μεγάλο/τεράστιο" → X-LARGE
- "μονοκατοικία" → mono, "μεζονέτα/διπλοκατοικία" → mez
- "νέα σωλήνωση/νέα υποδομή" → eisagogi_type: "ΝΕΑ ΥΠΟΔΟΜΗ"
- "εσκαλίτ" → "ΕΣΚΑΛΗΤ", "εσκαλίτ Β1" → "ΕΣΚΑΛΗΤ Β1"
- "κατειλημμένη/βλάβη/χαλασμένη" στο cab→bep → cab_to_bep_damaged: true
- "ίδιο επίπεδο/ίδιος όροφος" για fb/bep → fb_same_level_as_bep: true

ΠΑΡΑΔΕΙΓΜΑΤΑ:
"3 όροφοι μεσαίο BEP 12 μέτρα νέα σωλήνωση"
→ floors=3, bep_type="MEDIUM", eisagogi_type="ΝΕΑ ΥΠΟΔΟΜΗ", eisagogi_meters=12

"BCP δημόσιο 2 μέτρα σκάμμα 10 μέτρα υπόγεια προς BEP"
→ eisagogi_type="BCP", bcp_eidos="ΔΗΜΟΣΙΟ", bcp_ms=2, bcp_bep_ypogeia=10

"fb στο ίδιο επίπεδο 5 μέτρα οριζόντια"
→ fb_same_level_as_bep=true, horizontal_meters=5

"μεγάλο BMO απόσταση από BEP 7 μέτρα"
→ bmo_type="LARGE", bmo_bep_distance=7
`;
}
