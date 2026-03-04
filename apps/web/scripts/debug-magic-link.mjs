import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

function buildSetPasswordRedirect(baseUrl, projectId) {
  const redirect = new URL("/set-password", baseUrl);
  redirect.searchParams.set("next", "/dashboard");
  if (projectId) redirect.searchParams.set("projectId", projectId);
  return redirect.toString();
}

function buildAuthCallbackRedirect(baseUrl, options = {}) {
  const setPasswordUrl = new URL(buildSetPasswordRedirect(baseUrl, options.projectId));
  const next = `${setPasswordUrl.pathname}${setPasswordUrl.search}`;

  const callback = new URL("/auth/callback", baseUrl);
  callback.searchParams.set("next", next);
  if (options.email) {
    callback.searchParams.set("email", options.email);
  }
  return callback.toString();
}

const email = process.argv[2] ?? "debug+magic@logofountain.local";
const projectId = process.argv[3] ?? null;
const baseUrl = process.env.PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;

if (!baseUrl) {
  throw new Error("Missing PUBLIC_SITE_URL or NEXT_PUBLIC_SITE_URL");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase env vars");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const redirectTo = buildAuthCallbackRedirect(baseUrl, { projectId, email });

const result = await supabase.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo },
});

if (result.error) {
  console.error("generateLink error", result.error);
  process.exit(1);
}

const actionLink = result.data?.properties?.action_link;
const otpType = result.data?.properties?.action_type;
const emailOtp = result.data?.properties?.email_otp;
const hashedToken = result.data?.properties?.hashed_token;

console.log("Supabase action_link:", actionLink);
console.log("action_type:", otpType);
console.log("email_otp:", emailOtp);
console.log("hashed_token:", hashedToken);

console.log("Redirect target requested:", redirectTo);
console.log("Supabase redirect_to:", result.data?.properties?.redirect_to);
