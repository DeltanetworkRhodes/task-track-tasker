import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is super_admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Unauthorized");
    const callerId = claimsData.claims.sub;

    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .single();

    if (callerRole?.role !== "super_admin") {
      throw new Error("Only super_admin can impersonate users");
    }

    const { organization_id, redirect_to } = await req.json();
    if (!organization_id) throw new Error("organization_id required");

    const requestOrigin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    const refererOrigin = referer ? new URL(referer).origin : null;
    const safeRedirectTo = typeof redirect_to === "string" && /^https?:\/\//.test(redirect_to)
      ? redirect_to
      : null;
    const redirectUrl = safeRedirectTo ?? ((requestOrigin || refererOrigin) ? `${requestOrigin || refererOrigin}/dashboard` : undefined);

    // Find the first admin of this organization
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, email")
      .eq("organization_id", organization_id);

    if (!profiles || profiles.length === 0) throw new Error("No users in this organization");

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", profiles.map(p => p.user_id));

    const adminUser = profiles.find(p => 
      roles?.some(r => r.user_id === p.user_id && r.role === "admin")
    );

    const targetUser = adminUser || profiles[0];
    if (!targetUser.email) throw new Error("Target user has no email");

    // Generate magic link on the same app origin the super admin is currently using
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: targetUser.email,
      options: redirectUrl ? { redirectTo: redirectUrl } : undefined,
    });

    if (linkError) throw linkError;

    return new Response(JSON.stringify({ 
      link: linkData?.properties?.action_link,
      email: targetUser.email,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("impersonate-user error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
