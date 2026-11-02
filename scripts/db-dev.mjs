// npm run db:dev: apply every pending migration to the dev project (DEV_DB_URL in .env.development.local). Never the live one.
import { execFileSync } from "node:child_process";

const url = process.env.DEV_DB_URL;
if (!url) throw new Error("Set DEV_DB_URL in .env.development.local (dev project → Connect → Session pooler).");
if (url.includes("lctxtseylqyxiideluth")) throw new Error("DEV_DB_URL points at the live project.");
execFileSync("npx", ["supabase", "db", "push", "--db-url", url, "--yes"], { stdio: "inherit" });
