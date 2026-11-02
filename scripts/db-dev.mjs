// npm run db:dev: apply every pending migration to the dev project (DEV_SUPABASE_REF in .env.development.local). Never the live one.
// Links the dev project in a scratch folder, so supabase/.temp (the live link) is never touched. Uses your `supabase login`, no DB password.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ref = process.env.DEV_SUPABASE_REF;
if (!ref) throw new Error("Set DEV_SUPABASE_REF in .env.development.local.");
if (ref === "lctxtseylqyxiideluth") throw new Error("DEV_SUPABASE_REF is the live project.");
const work = mkdtempSync(join(tmpdir(), "nrb-dev-"));
try {
  mkdirSync(join(work, "supabase"));
  for (const f of ["config.toml", "migrations"]) symlinkSync(resolve("supabase", f), join(work, "supabase", f));
  const sb = (...a) => execFileSync("npx", ["supabase", ...a, "--workdir", work], { stdio: "inherit" });
  sb("link", "--project-ref", ref);
  sb("db", "push", "--linked", "--yes");
} finally { rmSync(work, { recursive: true, force: true }); }
