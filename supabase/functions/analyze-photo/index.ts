import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PHOTO_TYPE_PROMPTS: Record<string, string> = {
  building_photo:
    "Ελέγξτε αν η φωτογραφία δείχνει ξεκάθαρα ένα κτίριο ή είσοδο κτιρίου. Πρέπει να φαίνεται η πρόσοψη ή η είσοδος.",
  screenshot:
    "Ελέγξτε αν η φωτογραφία είναι screenshot από ΧΕΜΔ ή AutoCAD σχέδιο. Πρέπει να περιέχει τεχνικά σχέδια ή χάρτες δικτύου.",
  inspection_photo:
    "Ελέγξτε αν η φωτογραφία δείχνει εξοπλισμό FTTH (πριζάκι οπτικής ίνας, BEP, BCP, καλωδίωση, ή router).",
  construction_photo:
    "Ελέγξτε αν η φωτογραφία δείχνει εργασίες κατασκευής FTTH (σωληνώσεις, εκσκαφές, τοποθέτηση καλωδίων, εξοπλισμός).",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { imageBase64, photoType } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ isValid: false, message: "Δεν βρέθηκε εικόνα." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const typePrompt =
      PHOTO_TYPE_PROMPTS[photoType] ||
      "Ελέγξτε αν η φωτογραφία είναι σχετική με τηλεπικοινωνιακό έργο FTTH.";

    const systemPrompt = `Είστε Αυστηρός Επιθεωρητής Έργων FTTH (Fiber-To-The-Home). 
Αναλύετε φωτογραφίες από τεχνικούς πεδίου και ελέγχετε την ποιότητά τους.

Πρέπει να ελέγξετε:
1. Αν η φωτογραφία είναι θολή (blur) ή εκτός εστίασης - αν ναι, απορρίψτε τη.
2. Αν η φωτογραφία είναι πολύ σκοτεινή ή υπερεκτεθειμένη - αν ναι, απορρίψτε τη.
3. ${typePrompt}

ΣΗΜΑΝΤΙΚΟ: Να είστε αυστηρός αλλά λογικός. Αν η φωτογραφία είναι αρκετά ευκρινής και δείχνει κάτι σχετικό, εγκρίνετέ τη.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Αναλύστε αυτή τη φωτογραφία. Απαντήστε ΜΟΝΟ με ένα JSON object χωρίς markdown.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "photo_analysis_result",
                description:
                  "Return the analysis result for the photo quality check.",
                parameters: {
                  type: "object",
                  properties: {
                    isValid: {
                      type: "boolean",
                      description:
                        "true if the photo passes quality checks, false otherwise",
                    },
                    message: {
                      type: "string",
                      description:
                        "Short feedback message in Greek explaining the result",
                    },
                  },
                  required: ["isValid", "message"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "photo_analysis_result" },
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            isValid: true,
            message: "Ο έλεγχος AI δεν είναι διαθέσιμος αυτή τη στιγμή. Η φωτογραφία γίνεται δεκτή.",
            skipped: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            isValid: true,
            message: "Ο έλεγχος AI δεν είναι διαθέσιμος. Η φωτογραφία γίνεται δεκτή.",
            skipped: true,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      // Graceful degradation: accept photo if AI is unavailable
      return new Response(
        JSON.stringify({
          isValid: true,
          message: "Ο έλεγχος AI δεν ήταν δυνατός. Η φωτογραφία γίνεται δεκτή.",
          skipped: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback: try to parse from content
    const content = data.choices?.[0]?.message?.content || "";
    try {
      const parsed = JSON.parse(content);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      // If we can't parse, accept the photo
      return new Response(
        JSON.stringify({
          isValid: true,
          message: "Ο έλεγχος AI δεν ήταν δυνατός. Η φωτογραφία γίνεται δεκτή.",
          skipped: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (e) {
    console.error("analyze-photo error:", e);
    return new Response(
      JSON.stringify({
        isValid: true,
        message: "Σφάλμα ανάλυσης. Η φωτογραφία γίνεται δεκτή.",
        skipped: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
