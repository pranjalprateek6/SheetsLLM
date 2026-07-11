import { createClient } from "@supabase/supabase-js";

// NEXT_PUBLIC_* values are inlined at build time. During static prerendering
// this module is imported but never invoked, so fall back to a syntactically
// valid placeholder when the vars are absent — otherwise createClient() throws
// "supabaseUrl is required" and the whole build fails. The real values must be
// configured in the deploy environment for auth to function at runtime.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

if (
  typeof window !== "undefined" &&
  (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
) {
  // Surfaces misconfiguration in the browser without breaking the build.
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — authentication will not work."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
