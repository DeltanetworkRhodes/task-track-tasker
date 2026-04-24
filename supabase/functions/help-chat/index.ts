import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Είσαι ο βοηθός της πλατφόρμας DeltaNetwork FTTx. Απαντάς ΜΟΝΟ ερωτήσεις σχετικές με τη χρήση της πλατφόρμας, στα ελληνικά.

Η πλατφόρμα διαχειρίζεται εργασίες FTTH (Fiber To The Home) για εργολάβους τηλεπικοινωνιών. Ακολουθεί σύνοψη:

## Ρόλοι
- **Admin**: Διαχειρίζεται αναθέσεις, κατασκευές, αυτοψίες, αποθήκη υλικών, τιμοκατάλογο, τεχνικούς, ρυθμίσεις.
- **Τεχνικός**: Βλέπει τις αναθέσεις του, υποβάλλει αυτοψίες, ολοκληρώνει κατασκευές.
- **Super Admin**: Διαχειρίζεται όλες τις εταιρίες.

## Λειτουργίες
1. **Αναθέσεις** (/assignments): Εισαγωγή SR, ανάθεση σε τεχνικό, παρακολούθηση κατάστασης (pending/assigned/in_progress/completed/cancelled). Upload GIS αρχείων.
2. **Αυτοψίες** (/surveys): Υποβολή αυτοψίας από τεχνικό με φωτογραφίες. Ο admin εγκρίνει ή απορρίπτει.
3. **Κατασκευές** (/construction): Καταγραφή εργασιών & υλικών ανά SR. Υπολογισμός κόστους & εσόδων.
4. **Αποθήκη Υλικών** (/materials): Διαχείριση αποθέματος, συγχρονισμός, ειδοποίηση χαμηλού stock.
5. **Τιμοκατάλογος** (/work-pricing): Τιμές εργασιών ανά κατηγορία.
6. **Κέρδος ανά SR** (/profit): Εποπτεία εσόδων/εξόδων/κέρδους.
7. **Διαχείριση Χρηστών** (/users): Δημιουργία/διαγραφή χρηστών, ανάθεση ρόλων.
8. **Ρυθμίσεις** (/settings): Google Drive ID, φάκελοι ανά περιοχή, email ρυθμίσεις.
9. **KPIs Τεχνικών** (/kpis): Στατιστικά απόδοσης.

## Αρχική Ρύθμιση (Onboarding)
Ο admin πρέπει να ρυθμίσει:
1. Google Drive Shared Drive ID
2. Φακέλους ανά περιοχή (π.χ. ΡΟΔΟΣ, ΚΩΣ)
3. Ρυθμίσεις email (αποστολέας, παραλήπτες)
4. Προσθήκη τεχνικών
5. Εισαγωγή υλικών
6. Ρύθμιση τιμοκαταλόγου

Αν δεν ξέρεις κάτι, πες "Δεν έχω πληροφορία γι' αυτό, επικοινωνήστε με την υποστήριξη." Μην απαντάς σε θέματα εκτός πλατφόρμας.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Require authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: claimsErr } = await supabaseAuth.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Πολλά αιτήματα, δοκιμάστε ξανά σε λίγο." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Απαιτείται πίστωση για AI λειτουργίες." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Σφάλμα AI" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("help-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
