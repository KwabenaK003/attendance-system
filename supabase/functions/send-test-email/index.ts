import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MANAGER_ROLES = new Set(["admin", "ceo", "cto", "cfo", "manager"]);
const RESEND_EMAILS_URL = "https://api.resend.com/emails";

type SendTestEmailPayload = {
  fromEmail?: string;
  fromName?: string;
  replyToAddress?: string;
  footerText?: string;
  toAddress?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n<>]/g, "").trim();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

async function requireManager(request: Request): Promise<Response | null> {
  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !supabaseAnonKey) {
    return json({ error: "You must be signed in to send email." }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return json({ error: "Your session is invalid. Please sign in again." }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !MANAGER_ROLES.has(String(profile.role).toLowerCase())) {
    return json({ error: "Only managers and administrators can send email." }, 403);
  }

  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const accessError = await requireManager(request);
    if (accessError) return accessError;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return json({ error: "Email delivery is not configured. Add RESEND_API_KEY to Supabase Edge Function secrets." }, 503);
    }

    const payload = await request.json() as SendTestEmailPayload;
    const fromEmail = payload.fromEmail?.trim() ?? "";
    const fromName = cleanHeader(payload.fromName || "Attendance Management") || "Attendance Management";
    const replyToAddress = payload.replyToAddress?.trim() ?? "";
    const toAddress = payload.toAddress?.trim() ?? "";
    const footerText = payload.footerText?.trim() ?? "";

    if (!isEmail(fromEmail) || !isEmail(toAddress) || (replyToAddress && !isEmail(replyToAddress))) {
      return json({ error: "Enter valid From, Reply-To, and recipient email addresses." }, 400);
    }

    const html = [
      '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">',
      "<h2>Test email sent successfully</h2>",
      "<p>This test was sent from your Attendance Management settings through Resend.</p>",
      footerText ? `<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0"><p style="color:#6b7280;font-size:13px">${escapeHtml(footerText)}</p>` : "",
      "</div>",
    ].join("");

    const resendResponse = await fetch(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [toAddress],
        ...(replyToAddress ? { reply_to: replyToAddress } : {}),
        subject: "Attendance Management test email",
        html,
      }),
    });

    const result = await resendResponse.json().catch(() => ({})) as { message?: string; name?: string };
    if (!resendResponse.ok) {
      return json({ error: result.message || result.name || "Resend rejected the email request." }, 502);
    }

    return json({ success: true, message: `Test email sent to ${toAddress}.` });
  } catch (error) {
    console.error("send-test-email failed", error);
    return json({ error: "Unable to send the test email. Check the Edge Function logs for details." }, 500);
  }
});
