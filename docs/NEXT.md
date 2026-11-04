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

## Pending: calm mode + quieter What's new (#58)
- Built by the bot, **typecheck and lint not run** (no installed dependencies): run `npm run typecheck && npm run lint` first. No migration: `calm` is one more key in the settings JSON.
- Code: `calm` in `lib/settings.ts` (mirrored to `gigbook-calm`, sets `data-calm` on `<html>`, read by the pre-paint script), Settings > Look, `.calm` rules at the end of `globals.css`, `components/More.tsx` (inline when calm is off, a "More" button when on; used for the song page's Scales/Chord tones/Harmony toggles and the setlist's Share), calm toasts as `CalmStatus` under the top bar (`Toast.tsx`), bell dot in `Bell.tsx`.
- What's new (everyone): no popup any more. `useWhatsNew()` drives a dot on the user menu; "What's new" in that menu opens the list (Account > Help still does too).
- Choices: in calm mode Share on a setlist is under More, so the tour's "share" step has no visible target there (the tour already falls back). Setlist header has only four actions, so it hides just that one.
- Smoke test: calm on: cards don't lift, the drawer doesn't slide, spinner/bar highlight/metronome/tour still move; muted covers, picked chips still yellow; a confirmation appears under the top bar; bell shows a dot. Off: everything as before.

## Pending: choose your player, YouTube or Spotify (#59)
- Built by the bot, **typecheck and lint not run** (no installed dependencies, `npm ci` was not allowed): run `npm run typecheck && npm run lint` first.
- Needs: `YOUTUBE_API_KEY` (server env, `.env.development.local` and Vercel; YouTube Data API v3), then `npm run db:dev` for migration **0026** (`youtube_cache`; tests in `tests/access/youtube-cache.test.ts`). Settings gain `player` ("youtube" default).
- Code: `lib/youtube/` (ids/links, `client.ts` search + once-ever pick cache, `embed.ts` IFrame API, `queue.ts`), `app/api/youtube/search`, `playYoutube`/`ytStep` in `AppProvider`, Dock Record tab, Recordings panel in `SongView.tsx` (YouTube/Spotify switch, pasted links, `youtube:<id>` versions), Music section in Settings, setlist Listen panel (Play uses the chosen player; Save to Spotify is separate).
- Smoke test: switch the player in Settings; Play a setlist (videos in order, next/previous, chart follows); Find versions on YouTube, save, remove; paste a youtube.com/youtu.be/open.spotify.com link; signed out (pick cached in the browser). Add a "YouTube" line to `lib/whatsNew.ts` at release.

## Pending: right artist on YouTube (#61)
- Typecheck and lint pass. Needs `OPENROUTER_API_KEY` and `npm run db:dev` for migration **0027** (widens the `youtube_cache.key` check to 500). Optional `AI_MODEL_SMALL` (defaults to `AI_MODEL`, then haiku).
- Code: `app/api/ai/youtube/route.ts` + `lib/ai/youtube.ts` (performers per set, pick by index; each call uses one `ai_claim`), `lib/youtube/client.ts` (`performersFor`, `autoPick(…, performer)`, cache key `title|composer|performer`), `performer` on queue items (from saved versions' artists), SetView passes the set name to `playYoutube`.
- Not done: set notes aren't sent (they live in the notes table, not on the setlist object). A single song from its own page uses the saved version's artist only. Signed out: no AI, plain search. No tests added (no AI tokens); `validatePick`/`validatePerformers` are the units to test.
- Smoke test: play a "Billie Holiday" set with no saved videos; picks should be hers; replay uses the cache (no AI calls); unset `OPENROUTER_API_KEY` and playback still works.

## Pending: fill your profile from a bio or CV with AI (#60)
- Built by the bot, **typecheck and lint not run** (no installed dependencies): run `npm run typecheck && npm run lint` first. No migration: it reuses `ai_claim()` (0021). Needs `OPENROUTER_API_KEY`.
- Code: `app/api/ai/profile/route.ts`, `lib/ai/profile.ts` (prompt + validation), `lib/ai/profileClient.ts`, `components/ProfileAi.tsx` (modal + review), `.callout.warn` in `globals.css`. Requirement is **R11.8** (R11.6 was already the public page).
- PDFs go to the model as an OpenRouter `file` part (no new dependency). Check that the default model accepts PDFs; if not, set `AI_MODEL`.
- Smoke test: About you tab > Fill from my bio or CV; paste text, then a PDF and a .txt; tick/untick, switch bio length, Apply; share settings unchanged. No tests added (the suite has no AI tokens); `validate()` in `lib/ai/profile.ts` is the thing to unit test if wanted.

## Pending: chart versions, famous recorded reharms (#63, R3.5)
- Built by the bot, **typecheck, lint and tests not run** (no installed dependencies, `npm ci` was not allowed): run `npm run typecheck && npm run lint && npm test` first. Two tests I could not run: `tests/unit/versions.test.ts` (check the exact text `changesText` gives for the test tune) and `tests/access/tune-versions.test.ts`.
- Needs `OPENROUTER_API_KEY` and `npm run db:dev` for migration **0028** (`tune_versions`, `tune_version_claims`, functions `claim_tune_versions` / `release_tune_versions` / `add_ai_tune_versions`). Optional `AI_MODEL` (this route uses it, not the small model).
- Code: `lib/versions.ts` (text format, parsing, `validateVersions`), `lib/ai/versions.ts` + `app/api/ai/versions/route.ts` (claim in the database first, then the model; the claim is given back only if the model could not be reached), `components/Versions.tsx` (`useVersions` hook, tab row, editor), wired into `SongView.tsx` (`SongBody` swaps in the version's song, so scales, band and so on use it) and `ChartView.tsx` (uses the picked version, no tabs). DataStore: `listTuneVersions` / `addTuneVersion` / `updateTuneVersion` / `checkTuneVersion` / `deleteTuneVersion`; local mode has none and the tabs are hidden.
- Choices: Dan deletes any version with the service role (no admin flag). Report posts to `/api/feedback`. The 10-a-day limit counts existing rows, so deleting and re-adding gets round it. A version that doesn't fit someone's own chart (different bar count) shows a note instead of redrawing. The picked version is remembered per device. If the band is playing when you switch version it keeps the old one until restarted.
- Smoke test: Find famous versions on "Someday My Prince Will Come" (once only: the button disappears); pick a tab, scales and guide tones follow, play the band; Edit an AI version (tag goes), Mark checked; Add your own from the Original and from a picked version; Report; Delete; signed out shows no tabs. Add a "Versions" line to `lib/whatsNew.ts` at release.

## Pending: chart hits and a drummer view (#64, R3.6)
- Built by the bot, **typecheck, lint and tests not run** (no installed dependencies, `npm ci` was not allowed): run `npm run typecheck && npm run lint && npm test` first. Needs `npm run db:dev` for migration **0029** (`setlist_items.hits` / `feels`, `replace_setlist_items` redefined from 0004 with the two columns; tests in `tests/access/hits.test.ts`, unit tests in `tests/unit/hits.test.ts`).
- Code: `lib/hits.ts` (types, validation, feels), `lib/chart.ts` (draws marks, bar numbers, feel tags, drummer class), `components/Hits.tsx` (toolbar, per-section feel, bar editor), `lib/band/hitplay.ts` (accents on hits/pushes, silence on stops; called from `engine.ts`), wired in `SongView.tsx` and `ChartView.tsx` (drawing and the drummer toggle only; editing is on the tune page). `Prefs.drummer` remembers the toggle.
- Not done: **tap along** (the issue allowed skipping it); fermatas are drawn but the band doesn't hold them; the band doesn't change its feel per section (feel is a drummer-view label only); hits aren't edited in the chart view. The iReal-export caveat is in the hits Info icon (there is no iReal tune export in the UI yet). Hits print on setlist pages.
- Smoke test: on a setlist tune, Edit hits, tap bar 8, tap the "&" of 4, add Stop time through bar 12 on bar 9, Fermata; transpose (marks stay); play the band (accent, then silence); Drummer view on and off; change a section's feel; reload; as a viewer there is no Edit hits; library tune shows no editor. Add a "Hits" line to `lib/whatsNew.ts` at release.

## Pending: arrangements (#65, R13)
- Built by the bot, **typecheck, lint and tests not run** (no installed dependencies, `npm ci` was not allowed): run `npm run typecheck && npm run lint && npm test` first. Needs `npm run db:dev` for migration **0030** (`arrangements`, owner only; tests in `tests/access/arrangements.test.ts`).
- **Built without hits and section feel**: #64 wasn't on `develop` yet. When it lands, add them to `Arrangement` (types, both adapters, a migration after 0030 if it needs columns) and to `ArrangementActions.into` in `components/Arrangements.tsx` so the setlist copy carries them.
- Code: `Arrangement` + `DataStore.list/save/deleteArrangement` (IndexedDB key `arrangement:<id>` locally), state in `AppProvider` (`arrangements`, `Current` kind `"arr"`), `/arrangements` (`ArrangementsView`), `/arrangements/[id]` (+ `/chart`) reuse `SongBody` in `SongView.tsx`. Private notes and licks use the song home with key `arr:<id>`, so no shared note rules changed. "My resources" is hidden on an arrangement (resources are pinned from their own page by song).
- Smoke test: New arrangement (pick tune, optional name); Make an arrangement from a library chart; change key, save a recording, add a note; Add to setlist (copy is independent); rename, delete; signed out works on this device; tour step.

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

## Pending: band gig poster (#53, R10.11)
- Built by the bot, **typecheck and lint not run** (no installed dependencies): run `npm run typecheck && npm run lint` first. No migration.
- Code: `lib/poster.ts` (canvas drawing; templates "Cover band" and "Big stripe"; A4 1240x1754 and Instagram square 1080), `components/Poster.tsx` (Poster tab on the band page in `BandView.tsx`). PNG via `toBlob`; PDF = the picture printed from a new tab, Save as PDF.
- Photos: the band's press-kit images (pick up to 4). Members are tagged by name and what they play; with no photos they show as initials circles. Swap in members' own press photos once #52 is on develop.
- Not done: no tests (canvas), no What's new line yet (add at release).

## Open questions
- Should band invite links be multi-use or single-use?
- Later: share licks and resources with a band, AI dedupe of lead sheets, a full WhatsApp integration.
