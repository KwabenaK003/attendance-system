// supabase/functions/admin-user-update/index.ts
//
// Updates an existing admin user in Supabase Auth and mirrors the display
// name into the profiles table. Deploy with:
//   supabase functions deploy admin-user-update
//
// Call from the frontend with supabase.functions.invoke("admin-user-update", { body: {...} })

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type UpdateUserPayload = {
  userId: string;
  fullName: string;
  email: string;
  password?: string;
};

type AuthUserProfile = {
  role?: string | null;
  full_name?: string | null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Supabase service credentials are not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing authorization token." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const {
      data: { user: authUser },
      error: authError,
    } = await adminClient.auth.getUser(token);

    if (authError || !authUser?.id) {
      return new Response(
        JSON.stringify({ error: "Unable to verify your session." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, full_name")
      .eq("id", authUser.id)
      .maybeSingle<AuthUserProfile>();

    if (profileError) {
      return new Response(
        JSON.stringify({ error: profileError.message || "Unable to verify permissions." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!profile || !["admin", "ceo", "cto", "cfo", "manager"].includes(profile.role || "")) {
      return new Response(
        JSON.stringify({ error: "You do not have permission to update users." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = (await req.json()) as UpdateUserPayload;
    const userId = payload.userId?.trim();
    const fullName = payload.fullName?.trim();
    const email = payload.email?.trim();
    const password = payload.password?.trim();

    if (!userId || !fullName || !email) {
      return new Response(
        JSON.stringify({ error: "User id, name, and email are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authUpdate: {
      email: string;
      user_metadata: Record<string, unknown>;
      password?: string;
    } = {
      email,
      user_metadata: {
        full_name: fullName,
        role: "admin",
      },
    };

    if (password) {
      authUpdate.password = password;
    }

    const { data: updatedUser, error: updateAuthError } = await adminClient.auth.admin.updateUserById(
      userId,
      authUpdate
    );

    if (updateAuthError) {
      return new Response(
        JSON.stringify({ error: updateAuthError.message || "Unable to update auth user." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .upsert(
        {
          id: userId,
          full_name: fullName,
          role: "admin",
        },
        { onConflict: "id" }
      );

    if (profileUpdateError) {
      return new Response(
        JSON.stringify({ error: profileUpdateError.message || "Unable to update profile." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: updatedUser?.user
          ? {
              id: updatedUser.user.id,
              email: updatedUser.user.email,
              user_metadata: updatedUser.user.user_metadata,
            }
          : { id: userId, email, user_metadata: { full_name: fullName } },
        profile: {
          id: userId,
          full_name: fullName,
          role: "admin",
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error updating user.";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
