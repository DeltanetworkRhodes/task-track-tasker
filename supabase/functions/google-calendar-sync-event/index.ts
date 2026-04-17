import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SyncBody {
  action: "create" | "update" | "delete";
  appointment_id: string;
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Refresh failed: ${JSON.stringify(data)}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await supabase.auth.getClaims(token);
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claims.claims.sub;

    const body: SyncBody = await req.json();
    if (!body?.action || !body?.appointment_id) {
      return new Response(JSON.stringify({ error: "Missing action or appointment_id" }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user's Google calendar token
    const { data: tokenRow } = await admin
      .from("user_google_calendar_tokens")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!tokenRow) {
      return new Response(JSON.stringify({ error: "no_calendar_connection", message: "Google Calendar not connected" }), { status: 200, headers: corsHeaders });
    }

    // Refresh access token if expired
    let accessToken = tokenRow.access_token;
    if (!accessToken || !tokenRow.token_expires_at || new Date(tokenRow.token_expires_at) <= new Date()) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token);
      accessToken = refreshed.access_token;
      const newExpires = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString();
      await admin
        .from("user_google_calendar_tokens")
        .update({ access_token: accessToken, token_expires_at: newExpires })
        .eq("user_id", userId);
    }

    const calendarId = tokenRow.calendar_id || "primary";

    // Fetch appointment
    const { data: appt } = await admin
      .from("appointments")
      .select("*")
      .eq("id", body.appointment_id)
      .maybeSingle();

    if (body.action === "delete") {
      if (appt?.google_event_id) {
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${appt.google_event_id}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
        );
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!appt) {
      return new Response(JSON.stringify({ error: "Appointment not found" }), { status: 404, headers: corsHeaders });
    }

    const startDate = new Date(appt.appointment_at);
    const endDate = new Date(startDate.getTime() + (appt.duration_minutes || 30) * 60000);

    const eventBody = {
      summary: `📞 Ραντεβού SR ${appt.sr_id}${appt.customer_name ? ` - ${appt.customer_name}` : ""}`,
      description: [
        appt.description,
        appt.area ? `Περιοχή: ${appt.area}` : null,
        `SR: ${appt.sr_id}`,
      ].filter(Boolean).join("\n"),
      start: { dateTime: startDate.toISOString(), timeZone: "Europe/Athens" },
      end: { dateTime: endDate.toISOString(), timeZone: "Europe/Athens" },
      reminders: { useDefault: true },
    };

    let eventId = appt.google_event_id;
    let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    let method: "POST" | "PUT" = "POST";

    if (eventId) {
      url = `${url}/${eventId}`;
      method = "PUT";
    }

    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(eventBody),
    });
    const data = await res.json();

    // If update failed because event was deleted, create new one
    if (!res.ok && method === "PUT" && (res.status === 404 || res.status === 410)) {
      const createRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(eventBody),
        }
      );
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(`Calendar create failed: ${JSON.stringify(createData)}`);
      eventId = createData.id;
    } else if (!res.ok) {
      throw new Error(`Calendar API ${res.status}: ${JSON.stringify(data)}`);
    } else {
      eventId = data.id;
    }

    await admin
      .from("appointments")
      .update({ google_event_id: eventId, google_calendar_user_id: userId })
      .eq("id", appt.id);

    return new Response(JSON.stringify({ ok: true, event_id: eventId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("google-calendar-sync-event error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
