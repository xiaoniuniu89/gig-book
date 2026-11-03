# Next steps

What's left to do, in order. Last updated 2026-11-03. Update it at the end of each session.

## Where things are
- Work happens on `develop`; `main` is live (see CLAUDE.md, Shipping).
- Vercel: project `niu-real-book` (GitHub-connected, production branch `main`, env vars set, live site uses the live Supabase). This folder is linked (`.vercel/`).
- Dev Supabase: migrations up to `0022` applied, fake musicians seeded.
- Live Supabase: up to `0022` (released 2026-11-03, chart tabs included). Live site: https://www.niurealbook.com.
- Released 2026-11-03:
  - **Make Spotify playlist** on a setlist (#45): `lib/spotify/user.ts`, `components/SpotifyPlaylist.tsx`, migration 0019.
  - **Recent collaborators** in Share and band invites (#46): migration 0018.
  - **Tools** card: metronome, drone, print (#51): `lib/tools/`, one shared audio context in `lib/audio.ts`. Drone has an optional click; print has blank manuscript paper.
  - **Niu AI** card and page (`/ai`): the AI setlist draft moved out of the New setlist dialog.
  - MusicXML upload and rendering, form clean-up, Share and Add note modals, band chat link.

## Pending: landing page + Request access (#54)
- The signed-out screen is now a landing page with Sign in and Request access cards (`components/SignIn.tsx`). Requests go through `request_access()` into `access_requests` (migration **0023**, not yet applied to dev or live: `npm run db:dev`; live with the next release). Dan reads requests in the Supabase table editor. Access tests: `tests/access/access-requests.test.ts`.

## Pending: user menu + Settings (#56)
- The user icon opens a menu (Account, Settings, Sign out). `/settings` (`components/views/SettingsView.tsx`) has theme (light/dark/match device) and text size; add new sections there (e.g. Music). Settings live in `lib/settings.ts`, are saved through `DataStore.getSettings/saveSettings` (migration **0025**, not yet applied: `npm run db:dev`; tests in `tests/access/settings.test.ts`). Text size uses CSS `zoom` on `body` because the app's sizes are px. Typecheck and lint were not run in the bot session (no installed dependencies): run them first.

## Pending: choose your player, YouTube or Spotify (#59)
- Built by the bot, **typecheck and lint not run** (no installed dependencies, `npm ci` was not allowed): run `npm run typecheck && npm run lint` first.
- Needs: `YOUTUBE_API_KEY` (server env, `.env.development.local` and Vercel; YouTube Data API v3), then `npm run db:dev` for migration **0026** (`youtube_cache`; tests in `tests/access/youtube-cache.test.ts`). Settings gain `player` ("youtube" default).
- Code: `lib/youtube/` (ids/links, `client.ts` search + once-ever pick cache, `embed.ts` IFrame API, `queue.ts`), `app/api/youtube/search`, `playYoutube`/`ytStep` in `AppProvider`, Dock Record tab, Recordings panel in `SongView.tsx` (YouTube/Spotify switch, pasted links, `youtube:<id>` versions), Music section in Settings, setlist Listen panel (Play uses the chosen player; Save to Spotify is separate).
- Smoke test: switch the player in Settings; Play a setlist (videos in order, next/previous, chart follows); Find versions on YouTube, save, remove; paste a youtube.com/youtu.be/open.spotify.com link; signed out (pick cached in the browser). Add a "YouTube" line to `lib/whatsNew.ts` at release.

## Pending: fill your profile from a bio or CV with AI (#60)
- Built by the bot, **typecheck and lint not run** (no installed dependencies): run `npm run typecheck && npm run lint` first. No migration: it reuses `ai_claim()` (0021). Needs `OPENROUTER_API_KEY`.
- Code: `app/api/ai/profile/route.ts`, `lib/ai/profile.ts` (prompt + validation), `lib/ai/profileClient.ts`, `components/ProfileAi.tsx` (modal + review), `.callout.warn` in `globals.css`. Requirement is **R11.8** (R11.6 was already the public page).
- PDFs go to the model as an OpenRouter `file` part (no new dependency). Check that the default model accepts PDFs; if not, set `AI_MODEL`.
- Smoke test: About you tab > Fill from my bio or CV; paste text, then a PDF and a .txt; tick/untick, switch bio length, Apply; share settings unchanged. No tests added (the suite has no AI tokens); `validate()` in `lib/ai/profile.ts` is the thing to unit test if wanted.

## Smoke test (Dan, on localhost)
1. **Make Spotify playlist** on one of your setlists: connect, change a recording, skip one, make it, open it in Spotify. Then **Update the linked playlist**.
2. **Share** a setlist: recent collaborators show as one-tap picks; add by email still works.
3. **Tools**: start the metronome, then the drone (the metronome should stop), then the band. Print a setlist.
4. **Add note** with a file; **Band chat** link; a MusicXML file on a lick.

## Before inviting testers (in this order)
1. ~~Own domain on Vercel~~ Done 2026-11-03: **`https://www.niurealbook.com`** (Namecheap DNS; the bare domain redirects to www). `YOUR_SITE` below means that.
2. ~~Supabase live URLs, Spotify redirect URI~~ done 2026-11-03.
3. ~~#47 Resend SMTP~~ set up 2026-11-03 (`login@mail.niurealbook.com`, Namecheap DNS). Confirmed: invite and sign-in emails arrive.
4. ~~Release~~ done 2026-11-03.
5. ~~OpenRouter monthly credit limit~~ $20/month, set 2026-11-03.
6. ~~#50 lead sheet test~~ done on localhost; it led to chart tabs (released).
7. Add testers' Spotify emails in the Spotify dashboard (5 max), then invite them in Supabase (Auth, Users, Invite).

## Before a public launch
- Apply to Spotify for extended quota. Development mode is capped at 5 users.

## Built, to verify
- **Chart tabs (R3.4)**: Upload chart on a tune page; tabs for iReal and each chart (lead sheet, intro…), each with an optional recording; share with the setlist; the last tab per song is remembered (this device). Replaces "Use as chart" on note files (chart_choices is unused now). `components/Charts.tsx`, migration 0022 (own `charts` bucket). Access tests in `tests/access/charts.test.ts` run in CI on release.
- **#49 First-run tour**: `components/Tour.tsx`; migration 0020 is on dev; local mode remembers it in `gigbook-tour`. Smoke test: a fresh sign-in starts it; Skip, Escape and Done stop it for good; "Take the tour" on the Account page replays it; try a phone and dark mode.

## Later
- #52 Import an existing press kit with Niu AI, plus 3 to 5 press photos per person (needs grooming).
- #53 Gig posters from templates on the band page (parked: Dan is collecting real posters as templates).
- #46 extras: collaborator picks for licks and resources; hide someone from the list on the account page.
- #51 extras: a tuner (microphone), ear training.

## Decided
- No in-app music notation editor: free ones are too basic and good ones cost money. MusicXML upload and rendering is enough.
- Spotify playlists use the Authorization Code flow with the app secret; the refresh token is sealed (AES-GCM) before it's stored.

## Open questions
- Should band invite links be multi-use or single-use?
- Later: share licks and resources with a band, AI dedupe of lead sheets, a full WhatsApp integration.
