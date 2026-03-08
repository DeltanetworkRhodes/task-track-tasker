import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Survey-phase prompts (simple quality check) ───
const SURVEY_PROMPTS: Record<string, string> = {
  building_photo:
    "Ελέγξτε αν η φωτογραφία δείχνει ξεκάθαρα ένα κτίριο ή είσοδο κτιρίου. Πρέπει να φαίνεται η πρόσοψη ή η είσοδος.",
  screenshot:
    "Ελέγξτε αν η φωτογραφία είναι screenshot από ΧΕΜΔ ή AutoCAD σχέδιο. Πρέπει να περιέχει τεχνικά σχέδια ή χάρτες δικτύου.",
  inspection_photo:
    "Ελέγξτε αν η φωτογραφία δείχνει εξοπλισμό FTTH (πριζάκι οπτικής ίνας, BEP, BCP, καλωδίωση, ή router).",
  construction_photo:
    "Ελέγξτε αν η φωτογραφία δείχνει εργασίες κατασκευής FTTH (σωληνώσεις, εκσκαφές, τοποθέτηση καλωδίων, εξοπλισμός).",
};

// ─── Construction-phase category-specific prompts (deep QA) ───
const CONSTRUCTION_CATEGORY_PROMPTS: Record<string, string> = {
  ΣΚΑΜΑ:
    "Ελέγξτε το σκάμα (εκσκαφή): Είναι ολοκληρωμένο; Έχει σωστό βάθος; Υπάρχουν σωληνώσεις τοποθετημένες; Είναι ασφαλές;",
  ΟΔΕΥΣΗ:
    "Ελέγξτε την όδευση οπτικής ίνας: Υπάρχουν απότομες τσακίσεις (γωνία μικρότερη από ακτίνα κάμψης); Είναι το καλώδιο μέσα σε κανάλι/σωλήνα ή χύμα; Είναι στερεωμένο σωστά;",
  BCP:
    "Ελέγξτε το BCP (Building Connection Point): Είναι τοποθετημένο σωστά και ίσια; Έχει ταμπελάκι σήμανσης; Είναι τα splicing καθαρά;",
  BEP:
    "Ελέγξτε το BEP (Building Entry Point): Σωστή τοποθέτηση; Στεγανοποίηση εισόδου; Σήμανση παρούσα;",
  BMO:
    "Ελέγξτε το BMO (Building Main Outlet): Σωστή τοποθέτηση στον τοίχο, ευθυγράμμιση, σήμανση, καθαρή καλωδίωση;",
  FB:
    "Ελέγξτε το Floor Box: Σωστή τοποθέτηση, κάλυμμα, σήμανση, splicing εντός;",
  ΚΑΜΠΙΝΑ:
    "Ελέγξτε την καμπίνα: Σωστή σύνδεση, τακτοποίηση καλωδίων, σήμανση πορτών;",
  Γ_ΦΑΣΗ:
    "Ελέγξτε τη Γ' Φάση (σύνδεση πελάτη): ONT/Router τοποθετημένο σωστά; Πριζάκι οπτικής ίνας σωστά στον τοίχο; Ταμπελάκι πελάτη παρόν;",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { imageBase64, photoType, phase, category } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ isValid: false, isApproved: false, message: "Δεν βρέθηκε εικόνα." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isConstruction = phase === "construction";

    // ─── Build system prompt ───
    let systemPrompt: string;
    let toolDef: any;

    if (isConstruction) {
      const catPrompt =
        CONSTRUCTION_CATEGORY_PROMPTS[category] ||
        "Ελέγξτε αν η φωτογραφία δείχνει εργασίες κατασκευής FTTH σύμφωνα με τις προδιαγραφές ΟΤΕ.";

      systemPrompt = `Είσαι ένας αυστηρός και έμπειρος Ελεγκτής Ποιότητας Έργων Οπτικών Ινών (FTTH) του ΟΤΕ για την Β' Φάση (Κατασκευή/Ολοκλήρωση).
Η δουλειά σου είναι να αναλύεις φωτογραφίες από τις εγκαταστάσεις των τεχνικών και να εγκρίνεις ή να απορρίπτεις τη δουλειά βάσει των αυστηρών προδιαγραφών του ΟΤΕ.

Κριτήρια Ελέγχου:
1. ΠΟΙΟΤΗΤΑ ΦΩΤΟΓΡΑΦΙΑΣ: Είναι καθαρή, εστιασμένη, με καλό φωτισμό; Αν είναι θολή, σκοτεινή ή υπερεκτεθειμένη → απόρριψη.
2. ΟΔΕΥΣΗ ΟΠΤΙΚΗΣ ΙΝΑΣ: Υπάρχουν απότομες τσακίσεις (απαγορεύεται γωνία μικρότερη από την επιτρεπόμενη ακτίνα κάμψης 30mm); Είναι το καλώδιο μέσα σε κανάλι/σωλήνα ή καλά στερεωμένο (και ΟΧΙ χύμα);
3. ΕΞΟΠΛΙΣΜΟΣ (Πριζάκι/ONT): Ο εξοπλισμός πρέπει να είναι τοποθετημένος σωστά και ίσια στον τοίχο, χωρίς κλίση.
4. ΣΗΜΑΝΣΗ: Πρέπει να υπάρχει διακριτό ταμπελάκι (label) με ID γραμμής/πελάτη, όπως απαιτεί ο ΟΤΕ.

Ειδικές οδηγίες για αυτή την κατηγορία: ${catPrompt}

ΣΗΜΑΝΤΙΚΟ: Να είσαι αυστηρός. Αν κάτι δεν τηρεί τις προδιαγραφές, απέρριψέ το με συγκεκριμένο feedback.`;

      toolDef = {
        type: "function",
        function: {
          name: "construction_photo_analysis",
          description: "Return the OTE Phase B quality analysis result.",
          parameters: {
            type: "object",
            properties: {
              isApproved: {
                type: "boolean",
                description: "true if photo passes OTE Phase B quality standards",
              },
              qualityScore: {
                type: "number",
                description: "Quality score from 1 to 10",
              },
              issuesFound: {
                type: "array",
                items: { type: "string" },
                description: "List of specific issues found (empty if approved)",
              },
              feedbackForTechnician: {
                type: "string",
                description: "Detailed feedback in Greek for the technician",
              },
            },
            required: ["isApproved", "qualityScore", "issuesFound", "feedbackForTechnician"],
            additionalProperties: false,
          },
        },
      };
    } else {
      // Survey-phase: permissive site-survey check
      systemPrompt = `Είστε βοηθός ελέγχου φωτογραφιών για Telecom Site Survey (Προμελέτη Χώρου FTTH).
Ο τεχνικός φωτογραφίζει τον χώρο ΠΡΙΝ την κατασκευή για να τεκμηριώσει την υπάρχουσα κατάσταση και να σχεδιάσει τη διαδρομή της οπτικής ίνας.

ΕΓΚΡΙΝΕΤΕ (isValid: true) φωτογραφίες που δείχνουν ΟΤΙΔΗΠΟΤΕ σχετικό με τον χώρο εργασίας:
- Δρόμους, πεζοδρόμια, φρεάτια, ασφάλτινες επιφάνειες (σχεδιασμός σκαπτικού/microtrenching)
- Προσόψεις κτιρίων, μάντρες, εξωτερικές εισόδους πολυκατοικιών
- Κλιμακοστάσια, διαδρόμους ορόφων, ασανσέρ, λεβητοστάσια, υπόγεια, μετρητές ρεύματος
- Εσωτερικό διαμερισμάτων: χολ, σαλόνια, τοίχους, πρίζες ρεύματος/τηλεφώνου
- Screenshots χαρτών, σχέδια ΧΕΜΔ/AutoCAD
- Οποιονδήποτε τηλεπικοινωνιακό εξοπλισμό (BEP, BCP, BMO, καμπίνα, router, ONT)
- Οποιαδήποτε φωτογραφία εξωτερικού ή εσωτερικού χώρου που θα μπορούσε να σχετίζεται με έργο τηλεπικοινωνιών

ΑΠΟΡΡΙΨΤΕ (isValid: false) ΜΟΝΟ φωτογραφίες που είναι:
- Εντελώς άσχετες (selfies, φαγητά, ζώα, τοπία διακοπών)
- Τόσο σκοτεινές που δεν διακρίνεται τίποτα
- Τόσο θολές που δεν αναγνωρίζεται κανένα αντικείμενο

ΣΗΜΑΝΤΙΚΟ: Να είστε ΠΟΛΥ ΕΛΑΣΤΙΚΟΙ. Σε περίπτωση αμφιβολίας, ΕΓΚΡΙΝΕΤΕ τη φωτογραφία. Ο τεχνικός γνωρίζει καλύτερα τι χρειάζεται για τη μελέτη.`;

      toolDef = {
        type: "function",
        function: {
          name: "photo_analysis_result",
          description: "Return the analysis result for the photo quality check.",
          parameters: {
            type: "object",
            properties: {
              isValid: {
                type: "boolean",
                description: "true if the photo passes quality checks",
              },
              message: {
                type: "string",
                description: "Short feedback message in Greek",
              },
            },
            required: ["isValid", "message"],
            additionalProperties: false,
          },
        },
      };
    }

    const toolName = toolDef.function.name;

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
                  text: isConstruction
                    ? `Αναλύστε αυτή τη φωτογραφία κατασκευής FTTH (κατηγορία: ${category || "γενική"}).`
                    : "Αναλύστε αυτή τη φωτογραφία.",
                },
                {
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
                },
              ],
            },
          ],
          tools: [toolDef],
          tool_choice: { type: "function", function: { name: toolName } },
        }),
      }
    );

    if (!response.ok) {
      const txt = await response.text();
      console.error("AI gateway error:", response.status, txt);
      // Graceful degradation
      const fallback = isConstruction
        ? { isApproved: true, qualityScore: 10, issuesFound: [], feedbackForTechnician: "Ο έλεγχος AI δεν ήταν δυνατός. Η φωτογραφία γίνεται δεκτή.", skipped: true }
        : { isValid: true, message: "Ο έλεγχος AI δεν ήταν δυνατός. Η φωτογραφία γίνεται δεκτή.", skipped: true };
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // Fallback: accept
    const fallback = isConstruction
      ? { isApproved: true, qualityScore: 10, issuesFound: [], feedbackForTechnician: "Ο έλεγχος AI δεν ήταν δυνατός.", skipped: true }
      : { isValid: true, message: "Ο έλεγχος AI δεν ήταν δυνατός.", skipped: true };
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-photo error:", e);
    return new Response(
      JSON.stringify({
        isValid: true,
        isApproved: true,
        qualityScore: 10,
        issuesFound: [],
        feedbackForTechnician: "Σφάλμα ανάλυσης. Η φωτογραφία γίνεται δεκτή.",
        message: "Σφάλμα ανάλυσης. Η φωτογραφία γίνεται δεκτή.",
        skipped: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
