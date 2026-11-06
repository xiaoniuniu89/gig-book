# Next steps

What's left to do, in order. Last updated 2026-11-05. Update it at the end of each session.

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

## Pending: Gigs (#79, R15)
- Built by the bot. **Typecheck, lint and tests not run** (the bot session couldn't install dependencies): run `npm run typecheck && npm run lint && npm test` first, esp. `tests/access/gigs.test.ts`. Needs `npm run db:dev` for migration **0040** (`gigs`, `gig_setlists`, `gig_lineup`, `gig_lineup_list`, `gig_guest_details`, `gig_photos`, `gig_file_readable`; redefines `setlist_role` and `can_read_attachment_path` keeping every earlier case; adds the `added_to_gig` notification kind).
- Code: `components/Gigs.tsx` (New/Edit dialog, rows, `SetlistGigs` "On gigs" + Add to gig, `BandGigs`), `components/views/GigsView.tsx` and `GigView.tsx`, `app/gigs/`, `GigPoster` (and a shared `PosterBuilder`) in `components/Poster.tsx`, gig methods in both adapters (local returns empty / rejects with "Sign in to plan gigs."), Home card, band Gigs tab, Bell + email for `added_to_gig`.
- Choices: "on the gig" (sees contacts) = creator, lineup or band admin; band members who aren't playing see names only. A lineup counts as a band for share settings, with no per-band overrides. Only setlists you own or can edit can go on a gig, so a gig never widens who reads a setlist you only view. The name picker's typed-email fallback isn't supported for the lineup (pick a name, or add a guest). Guest phone/email aren't selectable from the table (column grants), only through the functions.
- Smoke test: sign in as two fake musicians; New gig; add setlist, Copy for this gig (gig points at the copy, original untouched); add a person and a guest, check each sees the other's shared contacts and the guest's; setlist page shows "On gigs"; band page Gigs tab; bell shows "added you to the lineup"; poster has the date/venue and offers shared photos.
- What's new line at release: "Gigs: plan a night with its date, venue, setlists, lineup (with contacts) and a poster."

## Pending: Transcriptions (#73, R14)
- Built by the bot; `npm run typecheck` and `npm run lint` pass. **Tests not run** (no local Supabase in the bot session): run `npm test`, esp. `tests/access/transcriptions.test.ts`. Needs `npm run db:dev` for migration **0038** (`transcriptions`, `transcription_shares`, private bucket `transcriptions`, 20 uploads a day via `transcription_upload_log`). #74 uses 0039. The AI recording suggestion needs `OPENROUTER_API_KEY` (optional `AI_MODEL_SMALL`).
- Code: `components/Transcriptions.tsx` (upload/edit dialog, Share dialog, rows, Report, `TuneTranscriptions`), `components/views/TranscriptionsView.tsx` (list) and `TranscriptionView.tsx` (page), `app/transcriptions/`, `app/api/ai/recording/route.ts` + `lib/ai/recording.ts` + `recordingClient.ts`, `listTranscriptions/getTranscription/createTranscription/updateTranscription/deleteTranscription/listTranscriptionShares/addTranscriptionShare/removeTranscriptionShare` in both adapters (local rejects with "Transcriptions need an account."), SongView section, Home card (new green cover `--cover-green`).
- Choices: the row is made first and the file must match it (like practice tracks), so the cap holds. The file can't be replaced on Edit (delete and upload again). The setlist and band Share modals are untouched (#74 is changing them); Share here is its own small dialog. "Remove from my list" shows on a private one that isn't yours. Tour and What's new left alone.
- Smoke test: Transcriptions card; Upload a PDF with a tune picked (title defaults), Public and Private; tick the AI box with a player; list: search, instrument, All/Mine/Shared tabs, A–Z/Newest, per-page 10/20/50 and Next/Previous; open one: file shows, ▶ plays the YouTube link, Open the tune; Share by email (unknown email message), sign in as that person: it's under Shared with me, remove yourself; public one from a stranger: Report; Edit and Delete as owner; the tune's page lists it and Upload there has the tune filled in; signed out says it needs an account.

## Pending: name picker (#74, R4.6)
- Built by the bot, **typecheck, lint and tests not run** (no installed dependencies): run `npm run typecheck && npm run lint && npm test` first. Needs `npm run db:dev` for migration **0039** (`people_circle()`, `search_people(q)`, and `add_setlist_collaborator` now accepts anyone in the circle, not only recent collaborators). Tests: `tests/access/people-search.test.ts`.
- Code: `components/PeoplePicker.tsx` (combobox/listbox, chip, email fallback), used in the setlist Share form (`Band` in `SetView.tsx`) and band Invite (`BandView.tsx`); `DataStore.searchPeople` (local returns `[]`). The old name search in band Invite is gone; a typed email there still goes through `searchBandUsers` (its name matching reaches every user, so don't expose it to name typing). Transcription sharing still uses email (#75).
- Smoke test: Share a setlist, type 2 letters of a bandmate's name, pick with the mouse and with ↑ ↓ Enter, Esc closes, ✕ removes the chip, choose Editor, Add; a stranger's name shows "No one you play with"; type a full email and Add; band Invite: pick someone, choose the instrument, Add; signed out/local: only the email box works.

## Pending: sign in with a code (stays signed in)
- Users said signing in is annoying. Sessions already last until sign-out (localStorage + refresh token); the real problem is the email link opening in another browser (Gmail/Outlook in-app browsers), so the session lands there. The sign-in modal now takes the code from the email too (`verifyOtp`, `components/SignIn.tsx`).
- **Before releasing:** in both Supabase projects (Authentication > Emails > Magic Link) add the code to the template, e.g. `<p>Or type this code: <b>{{ .Token }}</b></p>`. Without it the email has no code. Also check Authentication > Sessions has no time-box or inactivity timeout.
- Add a What's new line at release ("Sign in with the code from the email").

## Pending: Lyrics tab for singers (work in progress)
- A **Lyrics** tab after the chart tabs on every tune page (library, setlist, arrangement; signed out too). Add lyrics (paste or type), Edit, clear to remove; "Search the web" opens a Google search for the tune's lyrics. Views: Lyrics, Side by side (stacks on phones), Over the chart (iReal chart faded behind, the playing bar still shows); the last two are tagged Work in progress. Text size A−/A+. View and size are remembered per device.
- Sections: a line like `[A]`, `[Intro]` or `[Chorus]` starts a section, drawn as a boxed label. The editor has chips to add Intro/A/B/C/Verse/Chorus/Bridge/Ending at the cursor and **Follow the form** (the chart's letters through repeats, e.g. A A B A; `formOf` in `lib/lyrics.ts`). An empty tune offers "Start from the form".
- Versions: several named lyric versions per song (e.g. "Lyrics" and "My version"), shown as chips when there's more than one. **New version** copies the one on screen to change. The name is a `# Name` first line of the note (no name line = "Lyrics").
- No migration: each version is a personal note at song key `lyrics:<songKey>` (private, 10,000 characters, both adapters), so they never show in "My notes". Code: `lib/lyrics.ts` (+ `tests/unit/lyrics.test.ts`), `components/Lyrics.tsx`, tab in `ChartTabs` (`components/Charts.tsx`; the tab row now always shows), pane in `SongView.tsx`, `.lyrics-*` in `globals.css`.
- Later (Dan's idea): shared lyrics people can correct ("that line isn't right"). For now a singer fixes them in their own version. A shared, editable copy of copyrighted lyrics would need licensing too.
- **No AI lookup on purpose**: having the model write out lyrics would reproduce copyrighted words (and it often gets them wrong). If Dan wants a one-tap fetch, it should come from a licensed lyrics API (e.g. Musixmatch), not the model.
- Not done: the full-screen Chart view has no lyrics yet; arrangements share the song's lyrics (key is the song, not `arr:`). Existing issue seen while testing: on a phone the song page is wider than the screen (the `.nav-pair` buttons), on the iReal tab too.
- What's new line at release: "Lyrics tab on every tune (work in progress): paste your lyrics in, mark sections like intro, A, B or chorus (or follow the tune's form), keep more than one version, and read them on their own, beside the chart, or over a faded chart."
- Smoke test: Lyrics tab, Start from the form, fill it, Save, reload; New version, rename, switch between versions; Side by side and Over the chart while the band plays; Edit, clear, Save (back to empty); signed in and signed out.

## Pending: Transcribe tool (/tools/transcribe)
- Slow down (speed presets, keep pitch for uploads) and A–B loop a YouTube link or an uploaded recording. Uploads: 3 per person, 25 MB each.
- Migrations **0036** + **0037** (10 uploads per 24 hours, logged by the trigger) (`practice_tracks` + private `practice` bucket; the row is made first and the upload must match it, so the cap holds). Applied to dev, not live. Tests: `tests/access/practice.test.ts` (not run locally). Local mode keeps the files in IndexedDB.
- Code: `components/views/TranscribeView.tsx`, `YtLooper` in `lib/youtube/embed.ts`, `listPracticeTracks/addPracticeTrack/deletePracticeTrack/practiceTrackUrl` in both adapters.

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

## Pending: tap along and fermatas (#67, R3.6)
- Built by the bot, **typecheck, lint and tests not run** (no installed dependencies): run `npm run typecheck && npm run lint && npm test` first. No migration.
- Tap along: `TapAlong` in `components/Hits.tsx` (Tap button, Space, Undo tap) shown in Edit hits; `Band.where()` gives the bar heard now and the nearest eighth (clamped to the bar's 8 slots); `Band.setHits()` lets new hits sound in bars not yet scheduled. Space is taken in the capture phase only while the band plays on that tune, so it taps instead of stopping.
- Fermatas: a bar with a fermata lasts twice its length in `engine.ts`; `shapeBar` keeps only its first chord, rung through the extra bar. Hits at the end of a bar can't spill into the next bar (eighth 8 rounds to 7).
- Smoke test: Edit hits, start the band, tap and press Space (hits appear, next chorus accents them), Undo tap; fermata on a bar, the chord holds two bars' length.

## Pending: arrangements (#65, R13)
- Built by the bot, **typecheck, lint and tests not run** (no installed dependencies, `npm ci` was not allowed): run `npm run typecheck && npm run lint && npm test` first. Needs `npm run db:dev` for migration **0030** (`arrangements`, owner only; tests in `tests/access/arrangements.test.ts`).
- **Built without hits and section feel**: #64 wasn't on `develop` yet. When it lands, add them to `Arrangement` (types, both adapters, a migration after 0030 if it needs columns) and to `ArrangementActions.into` in `components/Arrangements.tsx` so the setlist copy carries them.
- Code: `Arrangement` + `DataStore.list/save/deleteArrangement` (IndexedDB key `arrangement:<id>` locally), state in `AppProvider` (`arrangements`, `Current` kind `"arr"`), `/arrangements` (`ArrangementsView`), `/arrangements/[id]` (+ `/chart`) reuse `SongBody` in `SongView.tsx`. Private notes and licks use the song home with key `arr:<id>`, so no shared note rules changed. "My resources" is hidden on an arrangement (resources are pinned from their own page by song).
- Smoke test: New arrangement (pick tune, optional name); Make an arrangement from a library chart; change key, save a recording, add a note; Add to setlist (copy is independent); rename, delete; signed out works on this device; tour step.

## Pending: press kit import and press photos (#52)
- Built by the bot, **typecheck and lint not run** (no installed dependencies, `npm ci` was not allowed): run `npm run typecheck && npm run lint` first. No migration.
- Builds on #60: the AI profile fill is now "Import from a press kit" (About you tab). Added **.docx** (read in the browser, `lib/ai/docx.ts`, no dependency; sent as text) next to PDF, .txt and pasted text. No URL fetching. Same route, same `ai_claim` daily limit, same validation.
- Press photos: images among the promo files (Promo files tab), max 5 (`lib/photos.ts`, checked in the browser only), resized to 1800 px JPEG before upload, each with its own who-can-see-it setting (default Only me). Not done: a database cap on the count; band admins using "My bands" photos (that's #53, gig posters).
- Smoke test: import a .docx, a PDF, pasted text; add 6 photos at once (5 upload, a notice for the rest); check an uploaded photo is small; change a photo's visibility; a photo set to Public shows on the public page.

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
