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
      throw new Error("Only admins can create users");
    }

    const { email, password, full_name, role, organization_id } = await req.json();
    if (!email || !password) throw new Error("email and password are required");
    if (role === "super_admin") throw new Error("Cannot create super_admin users");

    // Admins can only create users in their own org
    let targetOrgId = organization_id;
    if (isAdmin && !isSuperAdmin) {
      const { data: callerProfile } = await supabaseAdmin
        .from("profiles")
        .select("organization_id")
        .eq("user_id", callerId)
        .single();
      
      if (!callerProfile?.organization_id) throw new Error("Admin has no organization");
      targetOrgId = callerProfile.organization_id;
    }

    // Create auth user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || "" },
    });
    if (createError) throw createError;

    const userId = newUser.user.id;

    // Update profile with organization_id
    if (targetOrgId) {
      await supabaseAdmin
        .from("profiles")
        .update({ organization_id: targetOrgId })
        .eq("user_id", userId);
    }

    // Assign role
    if (role) {
      await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role });
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
