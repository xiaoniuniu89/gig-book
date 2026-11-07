# Next steps

What's left to do, in order. Last updated 2026-11-06. Update it at the end of each session.

## Released 2026-11-22 (UI audit, cd2e5f4)
- Tabs over stacking everywhere: song page Notes / Licks / Resources / Transcriptions (one panel, `head` prop on each panel component); setlist Tunes / Notes / Playlist; gig, band People, Settings, Transcribe.
- One Play setlist (and Play set N) asks band or recordings. "Create Spotify playlist"; "Link one you have" opens a modal.
- Row actions in ⋯ menus, ConfirmTyped deletes, `BusyButton` for fetch/save buttons.
- Home "Next up" card (next gig); song page eyebrow links to the setlist's gig; Chart view icon; crumbs fixed on Tools, Niu AI, a transcription.
- No migrations. E2E not run locally (only typecheck + lint); CI runs on the main push. Tests touched: 02, 03, 05, 09, 10.
- Audit items left: the setlist's "On gigs" line stays a line (not a Gigs tab); iReal and Who can see it collapse under More only in calm mode.

## Recordings and lead sheets (2026-11-07, released)
- **Find a lead sheet** (Library, Work in progress): `components/FindLeadSheet.tsx`, `lib/ai/leadsheetSearch.ts`, `app/api/ai/leadsheet-search`, `lib/ai/sheetLink.ts`. It never listens to audio: the song name, YouTube title or MP3 file name is searched via OpenRouter's web plugin. The player picks a result and presses Generate; `/api/ai/leadsheet { url }` opens it (public addresses only, 3 MB) and reads a PDF, an image, a PDF linked on the page, or the page text. The sheet isn't kept. An MP3 is kept only if the song is saved. A YouTube link isn't attached to the new song yet.
- **Transcribe button**: `components/TranscribeButton.tsx`, `lib/transcribeHandoff.ts` (in memory, so signed URLs stay out of links). On the YouTube player, chart audio, original recordings and audio on notes. Not on Spotify.
- **Start and end on a saved YouTube recording**: optional `start`, `end` on `Version` (jsonb, no migration). Clock button on the row; a pasted link's t= fills the start. Not carried into Transcribe.
- **Lead sheet but no chords**: the song opens on its Lead sheet tab; **Make the iReal chart** (`components/MakeChart.tsx`) saves on the setlist's copy through `set_item_chart`, for setlist editors and people who can read a gig it's on (`gigs.lineup_can_chart`, on by default, in the gig dialog). The owner can also save it on the song. The server checks title and composer only, so someone on a gig could overwrite a full chart through the API; the page only offers it on empty ones.
- **Find a lead sheet on a song page**: on any tune with no lead sheet. Results are links; Generate only shows when the tune has no chords and you may chart it, and goes through `MakeChart` (`start`).
- **Sharing library playlists** (0051): Share on a playlist tab sets visibility and copies `/shared/playlist/<id>`; the page offers Add to my library, a copy. Bands I'm in still needs the link: there's no From your bands list like setlists have.
- 0051 also fixes `can_chart_setlist` returning null for outsiders, which let `set_item_chart` through (caught on dev, never live).
- **Opt-in updates, bell only** (migration 0050): `update_subscriptions`, `components/UpdatesToggle.tsx` on gig and band pages, Settings → Notifications for everything. Unread repeats are folded for an hour. `gig_update`/`band_update` aren't in `EMAIL_KINDS`, so no email; email is a separate issue.
- **Paste a link on the Saved tab** of Recordings attaches it at once (when you can edit the setlist or arrangement).

## Draft a setlist from a list (2026-11-07, released, marked Work in progress)
- Niu AI page: a box to type in, **Create from an upload** (photo, screenshot or PDF, kept in memory, sent with the request, never stored), and More options holding the chips. No tune count is sent unless picked; the AI defaults to about 10.
- With a file the AI matches the songs on it to the library in written order, and returns `missing` for ones it can't match. Limits go up with a file: 2500 library tunes, 60 picks. Without a file the old 600-tune cut still applies (alphabetical, so a big library loses the end of the alphabet: worth fixing).
- Tested for real: a rendered handwriting-style image and PDF through `draftSetlist`, and the page and route end to end on the dev database. Not tried: a real phone photo, or a big imported library.
- What's new line at release: "Draft a setlist from a list: add a photo, screenshot or PDF of songs, like a handwritten note, and Niu AI finds them in your library."

## Find address (2026-11-07)
- Island of Ireland only (north and south). Photon first (forgives typos), Nominatim as backup; venues rank above streets and towns. Code: `lib/venues.ts`, `app/api/venue-search/route.ts`. Photon is a free public service with a fair-use limit and no guarantee: if it throttles us, the backup still answers, but more strictly.
- Checked live against both services through the URL and cleaning functions; the route itself hasn't been called while signed in.

## Pending: one sharing model for setlists and transcriptions (#86)
- Built by the bot. **Typecheck, lint and tests not run** (dependencies couldn't be installed): run `npm run typecheck && npm run lint && npm test` first. Needs `npm run db:dev` for migration **0048** (also 0047 if not yet applied).
- Deviation from the issue: `setlist_readable()` is left as it was, because the notes, files, licks and charts SELECT rules use it, and widening it would show them to visibility readers. A new `setlist_visible()` (role, or `bands` + `shares_band(owner)`, or `public`) is used only by `setlists_select` and `setlist_items_select`. Header of the migration lists which policy uses which.
- Hits are a column on `setlist_items`, so visibility readers see them with the tunes.
- App: Share dialog is now **Who can see it** (Private / Bands I'm in / Public) + Band; old `setlist_members` and `transcription_shares` show as "Also shared with" with ✕. Setlists page has **From your bands** (`listBandmateSetlists()`). A setlist read only by visibility comes back with `viewOnly: true` and role `viewer`: no edits, notes, gigs or Share; **Save to my setlists** copies it. Settings no longer shows "Someone adds me to a setlist" (setting kept).
- Tests: `tests/access/sharing.test.ts`, `tests/e2e/10-sharing.spec.ts`. No existing e2e used per-person sharing. Not done: What's new line; "Add to gig" stays on the setlist page, not inside the dialog.

## State on 2026-11-06 (paused here)
- Dev and live databases both have migrations up to **0046**. Everything below is released.
- **Released this session:**
  - Gigs (#79), with New gig from a setlist and from a band, and venue suggestions.
  - Setlist to iReal Pro export.
  - Transcriptions upload with AI.
  - Originals with an AI chart from a lead sheet (#80).
  - Calendar feed in Account → Connections (#81).
  - Form validation sweep (#82).
  - Press kit: one editor, rich bio, PDF, upload, Include the musicians (#84).
  - Install the app (Account → Help).
  - Band Settings tab: Privacy, typed "approve" confirms.
  - Home page groups.
- **Marked Work in progress** (Dan won't test these for now): Transcribe tool, Lyrics tab, Poster, Press kit editor.
- **Open issues:** #75 (ratings and comments, later), #76 (musician pages, later), #77 (e2e hydration error), #78 (Magic Link email template: Dan's dashboard task), #83 (Find address + Open in Google Maps: built on branch claude/issue-83-20261106-1830, needs a smoke test; search limits are in memory per server instance).
- **Not tested:** the new `band_kit_members` and `public_band_members` functions (0045) have no access tests yet. Add them to `tests/access/bands.test.ts`.
- **Tests:** everything passes on CI (release 4778b33): unit, access (incl. sharing.test.ts for 0048) and all end-to-end flows. Watch for the intermittent React #418 on phone band pages (#77).

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

## Pending: one press kit editor, formatted bio, PDF (#84, R11, R10.8)
- Built by the bot. `npm run typecheck` and `npm run lint` pass; `tests/unit/richtext.test.ts` passes. One unrelated unit test failed in the bot session (a chord-parsing "reports instead of fixing" test); access tests not run. Needs `npm run db:dev` for migration **0044** (bio columns allow 20,000 characters; the app limits visible text to 5,000).
- New dependency: Tiptap (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, v3, which includes Link). `components/RichBio.tsx` is lazy-loaded from `components/PressKit.tsx` (`next/dynamic`).
- Code: `components/PressKit.tsx` (shared by Account and the band Press kit tab; sub-tabs Bio, Contact and links, Photos and PDF, Public page; `kind` person/band, `canEdit`; Who can see it only for people), `lib/richtext.ts` (`sanitizeBio`, `bioToHtml`, `bioToText`), `components/Bio.tsx` (sanitises on render, also used by `/epk/<slug>`), `lib/kitPdf.ts` (print window, no PDF library). Account tabs are now Press kit, Connections, Help.
- Choices: the PDF opens a print-styled window (Save as PDF); people's PDF has only Public items unless "Include private contact details" is ticked; bands include everything. Old plain-text bios show as paragraphs and are converted when next saved. The AI import is people-only for now (not on the band kit). Band photos have no 6-photo cap.
- Smoke test: Account > Press kit > Bio > edit: format, paste from Word/Docs, add a link, Save; open `/epk/<slug>`; Download PDF with and without the box; Copy bio; same on a band's Press kit tab as admin and as member (read only).
- Not done: What's new line ("Press kits: formatted bio, Download PDF and Copy bio") for release.

## Pending: form validation sweep (#82)
- Built by the bot, **typecheck, lint and tests not run** (dependencies couldn't be installed): run `npm run typecheck && npm run lint` first.
- New: `lib/validate.ts` (`checkFile`, `isEmail`, `tidyContact`, `contactProblem`, `plainError`); `Modal` takes `dirty` and asks before closing; `fail()` in `lib/data/supabase.ts` now gives plain sentences (raw error goes to the console).
- Not done: Request access / sign-in dialogs have no unsaved-changes prompt (nothing worth keeping); inline (non-dialog) forms such as the lyrics editor and press kit tab don't ask before leaving.

## Pending: calendar feed (#81, R17)
- Built by the bot, **typecheck, lint and tests not run** (dependencies couldn't be installed): run `npm run typecheck && npm run lint && npm test` first. Needs `npm run db:dev` for migration **0042** (`calendar_feeds`, `calendar_feed_token`, `calendar_feed_gigs`). The route needs `SUPABASE_SERVICE_ROLE_KEY` in the env.
- Code: `app/api/calendar/[file]/route.ts`, `lib/calendar/ics.ts` (+ `tests/unit/ics.test.ts`), `components/Connections.tsx` (new Account > Connections tab; the player choice moved here for signed-in users, Settings links to it; signed out keeps it in Settings). Access tests: `tests/access/calendar.test.ts`.
- Times are floating local, 2 hours long. Smoke test: Connections tab, Add to Apple/Google, Copy link, open it in a browser (an .ics), Reset link (old URL 404s). What's new at release: "Put your gigs in your Google, Apple or Outlook calendar (Account > Connections)."

## Pending: Original songs + AI chart from a lead sheet (#80, R16)
- Built by the bot. **Typecheck, lint and tests not run** (dependencies couldn't be installed in the bot session): run `npm run typecheck && npm run lint && npm test` first, esp. `tests/unit/originals.test.ts` (round trip) and `tests/access/originals.test.ts`. Needs `npm run db:dev` for migration **0041** (`original_songs`, private bucket `leadsheets`, `original_upload_log`, 20 a day). The AI route needs `OPENROUTER_API_KEY` (uses `AI_MODEL`).
- Code: `components/Originals.tsx` (`NewSong` modal = create and edit, `OriginalPanel` on a song's page), `components/ChartEditor.tsx` (section blocks), `lib/irealExport.ts` (`encodeChart`, `chartMusic`, `sectionsFromBars`, `barsToText`/`textToBars`, `chartProblems`), `lib/ai/leadsheet.ts` + `leadsheetClient.ts` + `app/api/ai/leadsheet/route.ts`, `listOriginals/searchOriginals/createOriginal/updateOriginal/deleteOriginal/originalLeadSheetUrl` in both adapters (local: none / rejects), `originals` in `AppProvider` (also the library playlist "My originals", id `originals`), New song button in `Library.tsx`, and **Can't find it? Add your own song** in `TunePicker.tsx` (so every picker has it; single pickers pick the new song at once, the setlist one ticks it).
- Choices: iReal marks are one letter, so section names other than Intro, Verse and a single letter are written with a spare letter (the editor shows the name you gave only until reload). Time signature is per section (the song's choice sets them all). The AI's answer with any error is shown and not applied. The photo is shrunk to 2400 px JPEG and a PDF has to be 3 MB or less for AI (the upload itself allows 10 MB). Editing an original doesn't change copies already in setlists or arrangements. Not done: a live chart preview inside the dialog; sharing a band original's lead sheet beyond the band; What's new line.
- Smoke test: Library > New song (title, style, key, time, Private/band/Public), type bars, Save; it's under My originals with chart, transpose and the band; upload a lead sheet, Make the chart with AI (needs the key), fix, Save; the song page shows the lead sheet, Edit song, Delete; setlist Add tunes > search a title that doesn't exist > Can't find it > saved and ticked; same from a transcription's tune picker; a second account finds a Public one by search.

## Pending: Gigs (#79, R15)
- Built by the bot. **Typecheck, lint and tests not run** (the bot session couldn't install dependencies): run `npm run typecheck && npm run lint && npm test` first, esp. `tests/access/gigs.test.ts`. Needs `npm run db:dev` for migration **0040** (`gigs`, `gig_setlists`, `gig_lineup`, `gig_lineup_list`, `gig_guest_details`, `gig_photos`, `gig_file_readable`; redefines `setlist_role` and `can_read_attachment_path` keeping every earlier case; adds the `added_to_gig` notification kind).
- Code: `components/Gigs.tsx` (New/Edit dialog, rows, `SetlistGigs` "On gigs" + Add to gig, `BandGigs`), `components/views/GigsView.tsx` and `GigView.tsx`, `app/gigs/`, `GigPoster` (and a shared `PosterBuilder`) in `components/Poster.tsx`, gig methods in both adapters (local returns empty / rejects with "Sign in to plan gigs."), Home card, band Gigs tab, Bell + email for `added_to_gig`.
- Choices: "on the gig" (sees contacts) = creator, lineup or band admin; band members who aren't playing see names only. A lineup counts as a band for share settings, with no per-band overrides. Only setlists you own or can edit can go on a gig, so a gig never widens who reads a setlist you only view. The name picker's typed-email fallback isn't supported for the lineup (pick a name, or add a guest). Guest phone/email aren't selectable from the table (column grants), only through the functions.
- Smoke test: sign in as two fake musicians; New gig; add setlist, Copy for this gig (gig points at the copy, original untouched); add a person and a guest, check each sees the other's shared contacts and the guest's; setlist page shows "On gigs"; band page Gigs tab; bell shows "added you to the lineup"; poster has the date/venue and offers shared photos.
- What's new line at release: "Gigs: plan a night with its date, venue, setlists, lineup (with contacts) and a poster."

## Pending: Transcriptions (#73, R14)
- Built by the bot; `npm run typecheck` and `npm run lint` pass. **Tests not run** (no local Supabase in the bot session): run `npm test`, esp. `tests/access/transcriptions.test.ts`. Needs `npm run db:dev` for migration **0038** (`transcriptions`, `transcription_shares`, private bucket `transcriptions`, 20 uploads a day via `transcription_upload_log`). #74 uses 0039. The AI recording suggestion needs `OPENROUTER_API_KEY` (optional `AI_MODEL_SMALL`).
- Code: `components/Transcriptions.tsx` (upload/edit dialog, Share dialog, rows, Report, `TuneTranscriptions`), `components/views/TranscriptionsView.tsx` (list) and `TranscriptionView.tsx` (page), `app/transcriptions/`, `app/api/ai/transcription/route.ts` + `lib/ai/transcription.ts` + `transcriptionClient.ts` (AI reads the uploaded file and fills in the details), `listTranscriptions/getTranscription/createTranscription/updateTranscription/deleteTranscription/listTranscriptionShares/addTranscriptionShare/removeTranscriptionShare` in both adapters (local rejects with "Transcriptions need an account."), SongView section, Home card (new green cover `--cover-green`).
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
