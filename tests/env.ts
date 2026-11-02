// Connection settings for tests and the seed script. In CI: `supabase status -o env` exported as API_URL, ANON_KEY, SERVICE_ROLE_KEY.
// The key fallbacks are the public demo keys every local Supabase stack uses; they open nothing else.
const DEMO_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const DEMO_SERVICE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const e = process.env;
export const SB_URL = e.SUPABASE_URL || e.API_URL || e.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
export const ANON_KEY = e.SUPABASE_ANON_KEY || e.ANON_KEY || e.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEMO_ANON;
export const SERVICE_KEY = e.SUPABASE_SERVICE_ROLE_KEY || e.SERVICE_ROLE_KEY || DEMO_SERVICE;
export const MAILPIT = e.MAILPIT_URL || "http://127.0.0.1:54324";

/** The seed holds the service role key and deletes users: only ever run it against a local stack. */
export function assertLocal(): void {
  const host = new URL(SB_URL).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error(`Refusing to run against ${host}: tests and the seed only use a local Supabase (npx supabase start).`);
  }
}
