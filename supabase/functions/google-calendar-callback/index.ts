import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      return htmlResponse(`<h2>Σφάλμα σύνδεσης</h2><p>${error}</p><p>Μπορείς να κλείσεις αυτό το παράθυρο.</p>`);
    }

    if (!code || !stateParam) {
      return htmlResponse("<h2>Λείπουν παράμετροι</h2>");
    }

    const { userId, redirectOrigin } = JSON.parse(atob(stateParam));
    if (!userId) return htmlResponse("<h2>Άκυρο state</h2>");

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const callbackUrl = `${supabaseUrl}/functions/v1/google-calendar-callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("Token exchange failed:", tokenData);
      return htmlResponse(`<h2>Αποτυχία ανταλλαγής token</h2><pre>${JSON.stringify(tokenData)}</pre>`);
    }

    const { refresh_token, access_token, expires_in } = tokenData;
    if (!refresh_token) {
      return htmlResponse("<h2>Δεν επιστράφηκε refresh_token</h2><p>Δοκίμασε ξανά αφαιρώντας πρόσβαση από το Google account.</p>");
    }

    // Get user email
    let googleEmail: string | null = null;
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const userInfo = await userRes.json();
      googleEmail = userInfo.email ?? null;
    } catch (_) {}

    const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000).toISOString();

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    await admin
      .from("user_google_calendar_tokens")
      .upsert(
        {
          user_id: userId,
          refresh_token,
          access_token,
          token_expires_at: expiresAt,
          google_email: googleEmail,
          calendar_id: "primary",
        },
        { onConflict: "user_id" }
      );

    const back = redirectOrigin || "/";
    return htmlResponse(`
      <h2>✅ Σύνδεση επιτυχής!</h2>
      <p>Συνδέθηκε το ${googleEmail ?? "Google account"} σου.</p>
      <p>Μπορείς να κλείσεις αυτό το παράθυρο.</p>
      <script>
        try { window.opener && window.opener.postMessage({ type: 'google-calendar-connected', email: ${JSON.stringify(googleEmail)} }, '*'); } catch(e){}
        setTimeout(() => { window.location.href = ${JSON.stringify(back)}; }, 1500);
      </script>
    `);
  } catch (err) {
    console.error("google-calendar-callback error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return htmlResponse(`<h2>Σφάλμα</h2><pre>${msg}</pre>`);
  }
});

function htmlResponse(body: string) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Google Calendar</title>
    <style>body{font-family:system-ui;padding:2rem;max-width:600px;margin:auto}</style></head>
    <body>${body}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
