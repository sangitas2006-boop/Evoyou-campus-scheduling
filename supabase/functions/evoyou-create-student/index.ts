import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowedOrigins = (Deno.env.get("AUTH_ALLOWED_ORIGINS") ?? "https://sangitas2006-boop.github.io,http://localhost:4173,http://127.0.0.1:4173")
  .split(",").map((value) => value.trim()).filter(Boolean);
const headersFor = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const reply = (body: unknown, status: number, origin: string | null) => new Response(JSON.stringify(body), {
  status,
  headers: { ...headersFor(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const hashCode = async (code: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.toLowerCase()));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
async function rpc(name: string, args: Record<string, unknown>, url: string, key: string) {
  return await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { "apikey": key, "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: headersFor(origin) });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405, origin);
  if (!origin || !allowedOrigins.includes(origin)) return reply({ error: "Origin not allowed" }, 403, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return reply({ error: "Campus signup service is not configured." }, 503, origin);
  const remoteIp = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown-client";
  const rateHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${serviceKey}:auth:${remoteIp}`));
  const rateClient = [...new Uint8Array(rateHash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  try {
    const rate = await rpc("check_evoyou_chat_rate_limit", { p_client_hash: rateClient }, url, serviceKey);
    if (!rate.ok) return reply({ error: "The signup service is temporarily unavailable." }, 503, origin);
    if (await rate.json() !== true) return reply({ error: "Too many requests. Please try again in a minute." }, 429, origin);
  } catch {
    return reply({ error: "The signup service is temporarily unavailable." }, 503, origin);
  }
  let body: { email?: unknown; password?: unknown; full_name?: unknown; invitation_code?: unknown; email_redirect_to?: unknown };
  try { body = await req.json(); } catch { return reply({ error: "Invalid request." }, 400, origin); }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const fullName = String(body.full_name ?? "").trim().slice(0, 120);
  const code = typeof body.invitation_code === "string" ? body.invitation_code.trim().toLowerCase() : "";
  const redirect = String(body.email_redirect_to ?? "");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128 || fullName.length < 2 || !/^[0-9a-f]{48}$/.test(code)) {
    return reply({ error: "Enter a valid campus email, full name, password, and invitation code." }, 400, origin);
  }
  let redirectUrl: URL;
  try { redirectUrl = new URL(redirect); } catch { return reply({ error: "Invalid email confirmation return URL." }, 400, origin); }
  if (redirectUrl.origin !== origin) return reply({ error: "Invalid email confirmation return URL." }, 400, origin);

  const codeHash = await hashCode(code);
  let invitationId: string | null = null;
  try {
    const claim = await rpc("claim_student_invitation", { p_email: email, p_code_hash: codeHash }, url, serviceKey);
    if (!claim.ok) return reply({ error: "This email and invitation could not be verified. Check the details with your campus administrator." }, 400, origin);
    const claimRows = await claim.json();
    invitationId = Array.isArray(claimRows) && claimRows.length ? String(claimRows[0].invitation_id) : null;
    if (!invitationId) return reply({ error: "This email and invitation could not be verified. Check the details with your campus administrator." }, 400, origin);

    const signupUrl = `${url}/auth/v1/signup?redirect_to=${encodeURIComponent(redirectUrl.toString())}`;
    const signup = await fetch(signupUrl, {
      method: "POST",
      headers: { "apikey": anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, data: { full_name: fullName, evoyou_invite_hash: codeHash } }),
    });
    if (!signup.ok) {
      await rpc("release_student_invitation_claim", { p_invitation_id: invitationId }, url, serviceKey).catch(() => undefined);
      return reply({ error: "The account request could not be completed. The invitation remains available if no account was created." }, 400, origin);
    }
    return reply({ message: "Account request received. Check your email to confirm your address, then sign in." }, 200, origin);
  } catch {
    if (invitationId) await rpc("release_student_invitation_claim", { p_invitation_id: invitationId }, url, serviceKey).catch(() => undefined);
    return reply({ error: "The invitation service is temporarily unavailable. Please try again." }, 503, origin);
  }
});
