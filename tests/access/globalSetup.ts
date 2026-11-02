// Signs every fake musician in once (password grant) and hands the sessions to the test files, which keeps us well
// under the auth rate limits however many files there are.
import { execFileSync } from "node:child_process";
import type { TestProject } from "vitest/node";
import { createClient } from "@supabase/supabase-js";
import { ANON_KEY, SB_URL, assertLocal } from "../env";
import { PASSWORD, USERS, WHO, type Who } from "../fixtures";

export interface Sess { access_token: string; refresh_token: string }
declare module "vitest" {
  interface ProvidedContext { sessions: Record<Who, Sess> }
}

export default async function setup(project: TestProject) {
  assertLocal();
  // start from the seed every time: the end-to-end flows (and earlier runs) leave their own rows behind
  execFileSync("npx", ["tsx", "scripts/seed.ts"], { stdio: "inherit" });
  const sessions = {} as Record<Who, Sess>;
  for (const w of WHO) {
    const sb = createClient(SB_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.auth.signInWithPassword({ email: USERS[w].email, password: PASSWORD });
    if (error || !data.session) throw new Error(`Can't sign in ${w}: ${error?.message}. Did you run \`npm run seed\` against a running \`supabase start\`?`);
    sessions[w] = { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
  }
  project.provide("sessions", sessions);
}
