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

    // Verify caller via getClaims
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

    const isSuperAdmin = callerRole?.role === "super_admin";
    const isAdmin = callerRole?.role === "admin";

    if (!isSuperAdmin && !isAdmin) {
      throw new Error("Only admins can reset passwords");
    }

    const { user_id, new_password } = await req.json();
    if (!user_id || !new_password) throw new Error("user_id and new_password are required");
    if (new_password.length < 6) throw new Error("Password must be at least 6 characters");

    // Prevent resetting super_admin password by non-super-admins
    const { data: targetRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user_id)
      .single();

    if (targetRole?.role === "super_admin" && !isSuperAdmin) {
      throw new Error("Cannot reset super_admin password");
    }

    // Prevent self-reset (they should use normal flow)
    if (user_id === caller.id) {
      throw new Error("Use the normal password reset flow for your own account");
    }

    // Admin can only reset users in their own org
    if (isAdmin && !isSuperAdmin) {
      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("organization_id")
        .eq("user_id", caller.id)
        .single();

      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("organization_id")
        .eq("user_id", user_id)
        .single();

      if (callerProfile?.organization_id !== targetProfile?.organization_id) {
        throw new Error("Cannot reset password for users in other organizations");
      }
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
      password: new_password,
    });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
