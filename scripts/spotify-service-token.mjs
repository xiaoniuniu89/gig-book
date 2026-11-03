// One-time setup: sign in as the Spotify account the site makes playlists in, and save its refresh token.
//   npm run spotify:token   (every ~6 months: Spotify refresh tokens expire 6 months after sign-in)
//   node --env-file=.env.local scripts/spotify-service-token.mjs            saves it to .env.local
//   node --env-file=.env.local scripts/spotify-service-token.mjs --vercel   also adds it to Vercel (production)
// First add http://127.0.0.1:8888/callback as a Redirect URI on the Spotify app (developer.spotify.com > your app > Settings).
// Uses SPOTIFY_SERVICE_CLIENT_ID/_SECRET when set (a separate Spotify app), else SPOTIFY_CLIENT_ID/_SECRET.
// The token is never printed.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";

const id = process.env.SPOTIFY_SERVICE_CLIENT_ID || process.env.SPOTIFY_CLIENT_ID || "84afdb072a6a4e7e80b9bf4d704b5eb2";
const secret = process.env.SPOTIFY_SERVICE_CLIENT_SECRET || process.env.SPOTIFY_CLIENT_SECRET;
if (!secret) { console.error("No SPOTIFY_CLIENT_SECRET. Run it with --env-file=.env.local."); process.exit(1); }
const REDIRECT = "http://127.0.0.1:8888/callback";
const state = randomBytes(16).toString("hex");
const url = "https://accounts.spotify.com/authorize?" + new URLSearchParams({
  client_id: id, response_type: "code", redirect_uri: REDIRECT, state, show_dialog: "true",
  scope: "playlist-modify-public playlist-modify-private",
});

const server = createServer(async (req, res) => {
  const q = new URL(req.url, REDIRECT).searchParams;
  if (!req.url.startsWith("/callback")) { res.writeHead(404).end(); return; }
  const done = (msg, code = 0) => { res.writeHead(200, { "Content-Type": "text/plain" }).end(msg); console.log(msg); server.close(); process.exitCode = code; };
  if (q.get("state") !== state) return done("State didn't match. Run the script again.", 1);
  if (q.get("error")) return done("Spotify said: " + q.get("error"), 1);
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic " + Buffer.from(id + ":" + secret).toString("base64") },
    body: new URLSearchParams({ grant_type: "authorization_code", code: q.get("code") || "", redirect_uri: REDIRECT }),
  });
  if (!r.ok) return done("Spotify refused the code (" + r.status + ").", 1);
  const { refresh_token } = await r.json();
  if (!refresh_token) return done("Spotify gave no refresh token.", 1);

  // .env.local: replace the line, or add it
  const file = ".env.local", line = "SPOTIFY_SERVICE_REFRESH_TOKEN=" + refresh_token;
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  writeFileSync(file, /^SPOTIFY_SERVICE_REFRESH_TOKEN=.*$/m.test(text)
    ? text.replace(/^SPOTIFY_SERVICE_REFRESH_TOKEN=.*$/m, line)
    : text.replace(/\n?$/, "\n") + line + "\n");
  let msg = "Saved SPOTIFY_SERVICE_REFRESH_TOKEN to .env.local.";
  if (process.argv.includes("--vercel")) {
    spawnSync("npx", ["vercel", "env", "rm", "SPOTIFY_SERVICE_REFRESH_TOKEN", "production", "--yes"], { stdio: "ignore" });
    const v = spawnSync("npx", ["vercel", "env", "add", "SPOTIFY_SERVICE_REFRESH_TOKEN", "production"], { input: refresh_token, stdio: ["pipe", "ignore", "inherit"] });
    msg += v.status === 0 ? " Added it to Vercel (production); redeploy to use it." : " Adding it to Vercel failed; add it in the Vercel dashboard.";
  }
  done(msg + " You can close this tab.");
});

server.listen(8888, "127.0.0.1", () => {
  console.log("Sign in with the Spotify account the playlists should live in:\n" + url);
  try { execFileSync(process.platform === "darwin" ? "open" : "xdg-open", [url], { stdio: "ignore" }); } catch { /* open it by hand */ }
});
