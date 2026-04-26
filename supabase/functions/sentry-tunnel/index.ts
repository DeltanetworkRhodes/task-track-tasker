const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-sentry-auth, sentry-trace, baggage",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SENTRY_ENVELOPE_URL =
  "https://o4511287858036736.ingest.de.sentry.io/api/4511287889887312/envelope/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.arrayBuffer();
    const sentryResponse = await fetch(SENTRY_ENVELOPE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body,
    });

    return new Response(await sentryResponse.text(), {
      status: sentryResponse.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown tunnel error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});