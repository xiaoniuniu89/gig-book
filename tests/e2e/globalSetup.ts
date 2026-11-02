// Fresh fake musicians before every run (see scripts/seed.ts).
import { execFileSync } from "node:child_process";

export default function setup() {
  execFileSync("npx", ["tsx", "scripts/seed.ts"], { stdio: "inherit" });
}
