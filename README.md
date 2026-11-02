# Gig Book

Setlists from iReal Pro with analysed chord charts, a built-in backing band, and Spotify recordings.

Old static version (until it is retired): https://xiaoniuniu89.github.io/gig-book/

## What it does
- **Import** an iReal Pro playlist (share it from iReal Pro as HTML). Make it a setlist, or add it to your library.
- **Charts** show the scale for each stretch (chord scales or Barry Harris), the 3rd and 7th of every chord, and what the harmony is doing (ii–V–I of IV, backdoor, line cliché…). Transpose with − / +.
- **Band**: piano, bass and drums generated from the chords. Any key, any tempo, mute any instrument, loop a section. The current bar is highlighted.
- **Record**: the Spotify player sits in the dock. Load a setlist's playlist and the chart follows the track that's playing. Search Spotify for other versions of a tune and save the ones you like.
- **Practice gig**: plays a set start to finish with the band.
- **Accounts** (once Supabase is set up): sign in with an email link, keep setlists and the library in your account. Closed beta: only people you add can sign in, and nothing is visible signed out. Sharing with bandmates is coming.

Without Supabase settings, everything lives in your browser (IndexedDB), exactly like the static version.

## Deploying (Vercel + Supabase + Spotify)

Do these in order. Each part works on its own: the site runs without Supabase (local-only) and without the Spotify secret (no search).

### Part 1: Vercel
1. Go to https://vercel.com/new and sign in with GitHub.
2. Under "Import Git Repository", pick `xiaoniuniu89/gig-book` and click **Import**.
3. Leave Framework Preset as **Next.js** and the build settings as they are. Click **Deploy**.
4. When it finishes, open the project and set the production branch to `next-migration`: **Settings → Environments → Production → Branch Tracking** (on older dashboards: **Settings → Git → Production Branch**). Save. Switch it back to `main` after the pull request is merged.
5. Go to **Deployments**, open the menu (⋯) on the latest `next-migration` deployment and click **Redeploy**, or push any commit to the branch.
6. Note your site address, e.g. `https://gig-book.vercel.app`. The steps below call it `YOUR_SITE`.

### Part 2: Spotify search
1. Go to https://developer.spotify.com/dashboard, open the Gig Book app (client ID `84afdb07…`), then **Settings → View client secret**. Copy it.
2. In Vercel: **Settings → Environment Variables**. Add these (all environments):
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
3. Redeploy (Deployments → ⋯ → Redeploy).
4. Check it: open `YOUR_SITE/api/spotify/search?q=autumn%20leaves`. You should see JSON with `tracks`. A `503` means the secret isn't set.

Spotify login is no longer used, so the Spotify app's redirect URIs and its 25-user development limit don't matter for searching. Playback in the dock uses each listener's own Spotify session inside Spotify's embed.

### Part 3: Supabase (accounts)
1. Go to https://supabase.com/dashboard and click **New project**. Pick a name (e.g. `gig-book`), a database password (save it in your password manager) and the region closest to you (e.g. West EU / Ireland). Click **Create new project** and wait for it to finish.
2. Apply the database schema:
   1. In the project, open **SQL Editor → New query**.
   2. Open [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) in this repo, copy the whole file, paste it into the editor.
   3. Click **Run**. It should finish with "Success. No rows returned".
3. Set the sign-in link addresses: **Authentication → URL Configuration**.
   1. **Site URL**: `YOUR_SITE` (e.g. `https://gig-book.vercel.app`).
   2. **Redirect URLs** → **Add URL**, add each of these:
      - `YOUR_SITE/auth/callback`
      - `http://localhost:3000/auth/callback`
   3. Click **Save**.
4. Copy the keys: **Project Settings → API** (or **Connect**). Copy the **Project URL** and the **anon public** key (newer projects call it the **publishable** key; either works).
5. In Vercel: **Settings → Environment Variables**. Add (all environments):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Redeploy. These two are baked in at build time, so a redeploy is required after any change.
7. Close the beta:
   1. **SQL Editor → New query**, paste the whole of [`supabase/migrations/0002_closed_beta.sql`](supabase/migrations/0002_closed_beta.sql) and **Run** (it removes anonymous read access).
   2. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up" and save.
   3. Add each person: **Authentication → Users → Add user** (or **Send invitation**). Only emails added here can get a sign-in link.
8. Setlist members: **SQL Editor → New query**, paste the whole of [`supabase/migrations/0003_members.sql`](supabase/migrations/0003_members.sql) and **Run**. Owners can then add bandmates by email (they must already have an account).
9. Notes and replies: **SQL Editor → New query**, paste the whole of [`supabase/migrations/0004_notes.sql`](supabase/migrations/0004_notes.sql) and **Run**. It also makes setlist tune ids stable and moves the old one-line tune notes into the new notes. Run it before (or right after) deploying this version; until then, saving a setlist will fail.
10. Attachments (photos, PDFs, audio on notes): **SQL Editor → New query**, paste the whole of [`supabase/migrations/0005_attachments.sql`](supabase/migrations/0005_attachments.sql) and **Run**. It creates the private `attachments` Storage bucket (check **Storage** shows it as *Private*), the `attachments` and `chart_choices` tables and their access rules. No other settings needed; file size is limited only by Supabase's defaults (the free plan allows 50 MB per file, **Storage → Settings** to change).
11. Notifications: **SQL Editor → New query**, paste the whole of [`supabase/migrations/0006_notifications.sql`](supabase/migrations/0006_notifications.sql) and **Run**. It adds the bell: people are told when they're added to a setlist, when someone adds a note on a setlist they share, and when someone replies to their note. Run it after step 10.
12. Licks (personal snippet library, attachable to any tune): **SQL Editor → New query**, paste the whole of [`supabase/migrations/0007_licks.sql`](supabase/migrations/0007_licks.sql) and **Run**. It adds the `licks` and `lick_links` tables and lets attachments belong to a lick. Run it after step 10. No other settings needed.
13. Lick chord progressions (iReal Pro export, "Practise here"): **SQL Editor → New query**, paste the whole of [`supabase/migrations/0008_lick_progression.sql`](supabase/migrations/0008_lick_progression.sql) and **Run**. It adds two optional columns to `licks`. Run it after step 12. No other settings needed.
14. AI draft limits: **SQL Editor → New query**, paste the whole of [`supabase/migrations/0009_ai_usage.sql`](supabase/migrations/0009_ai_usage.sql) and **Run**. It adds the `ai_usage` table behind the 20-drafts-per-day limit. Run it before turning on Part 4.
14b. Account page and press kit: **SQL Editor → New query**, paste the whole of [`supabase/migrations/0012_profiles_kit.sql`](supabase/migrations/0012_profiles_kit.sql) and **Run**. It adds bio, contact details and sharing settings to profiles. For public press kit pages to show files, also add `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API) to your host's environment variables; never prefix it with `NEXT_PUBLIC_`.
14d. Bands (members, band setlists, permissions, band notes, band press kit): **SQL Editor → New query**, paste the whole of [`supabase/migrations/0013_bands.sql`](supabase/migrations/0013_bands.sql) and **Run**. Run it after steps 14b and 14c (it also restores the resource-file rules that 0012 dropped, so it is safe to run last). No other settings needed.
14c. Resources (bookmarks and books/PDFs, pinned to tunes): **SQL Editor → New query**, paste the whole of [`supabase/migrations/0011_resources.sql`](supabase/migrations/0011_resources.sql) and **Run**. It adds the `resources` and `resource_links` tables and lets attachments belong to a resource. Run it after step 12. No other settings needed.
15. Check it: open `YOUR_SITE`. You see only a sign-in screen. Enter your email, open the link from the email on the same device, and you land back on Gig Book signed in. If you had setlists in that browser before signing in, the home page offers to copy them to your account.

Supabase's built-in email sender only sends a few sign-in emails per hour. That is fine for a handful of people; for more, add your own SMTP server under **Authentication → Emails → SMTP Settings**.

### Part 4: AI setlist drafts
1. Create a key at https://openrouter.ai/keys. Set a monthly credit limit on it so costs stay capped.
2. In Vercel: **Settings → Environment Variables**. Add (all environments):
   - `OPENROUTER_API_KEY`
   - `AI_MODEL` (optional; default `anthropic/claude-haiku-5.5`)
3. Redeploy. Without the key, "Help me pick" on **New setlist** says AI drafts aren't set up. It only shows for signed-in users (Part 3) and needs migration 0009. Only tune title, composer, style and key are sent to the model.

### Using the CLI instead of the SQL editor (optional)
```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

## Local development
```bash
npm install
cp .env.example .env.local   # fill in the values you have; leave Supabase empty for local-only
npm run dev                  # http://localhost:3000
```
Other commands: `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`.

Checks:
- `node scripts/parity.mjs path/to/iReal-export.html` compares the TypeScript parser, analysis and chart output with the original `js/` modules (needs Node 22.18+).
- `python3 scripts/smoke.py path/to/iReal-export.html http://localhost:3000` runs a Playwright smoke test against a running server (no Spotify secret set).

## Testing
Three layers, all against a throwaway local Supabase (never the real project). CI runs them on every push and pull request (`docs/ci/test.yml`, to be moved into `.github/workflows/`).

```bash
npx supabase start            # needs Docker; applies supabase/config.toml and every migration
npm run seed                  # six fake musicians (Ava, Ben, Cleo, Dev, Eli, Fay), two bands, setlists, notes, files. Safe to repeat
npm test                      # unit tests + access tests (who can see and change what)
npm run test:e2e              # Playwright in Chromium, desktop and phone sizes; builds and starts the app itself
```
- The keys come from `supabase status -o env` (`API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`); without them the tests use the standard local-stack demo keys. `npm run seed` and the tests refuse to run if the URL isn't localhost.
- `tests/fixtures.ts` has the fake people, their ids and the seeded rows. Every password is `gigbook-fake-pw-1`.
- `tests/unit/`: pure code (iReal parsing and export, theory, ABC, QR). No services needed: `npx vitest run --project unit`.
- `tests/access/`: signs each fake musician in with a real supabase-js client and runs the real `supabaseStore` adapter plus direct table, RPC and storage calls. Mutating tests use scratch setlists and bands and remove them afterwards.
- `tests/e2e/`: about ten flows through the real sign-in page (magic link read from the local Mailpit). Outside services (YouTube, Spotify) are stubbed. Reports land in `playwright-report/`; first time: `npx playwright install --with-deps chromium`.

## Code
Next.js (App Router), TypeScript, React, plain CSS.
- `app/`: routes. `/` (setlists and import), `/library`, `/licks`, `/library/[playlistId]/[index]`, `/set/[id]`, `/set/[id]/[index]`, `/auth/callback`, and the Spotify API routes `/api/spotify/search?q=` and `/api/spotify/track/[id]`. The root layout holds the dock, so the band and the Spotify embed keep playing while you move around.
- `components/`: `AppProvider` (data, preferences, band, Spotify, practice gig), `Dock`, `TopBar` (sign-in), and the views.
- `lib/ireal.ts`: iReal Pro link parser and form unrolling (repeats, endings, D.C./D.S., codas).
- `lib/theory.ts`, `lib/chart.ts`: analysis and chart rendering (framework-free).
- `lib/band/`: the backing band (generator, Web Audio scheduler, sounds). Samples in `public/sounds/` (see the README there).
- `lib/spotify/`: server-side Client Credentials calls with caching, browser helpers, the embed player.
- `lib/data/`: one `DataStore` interface with two adapters: `local` (IndexedDB) and `supabase`.
- `supabase/migrations/`: tables and row-level security.
- `index.html`, `js/`, `css/`: the original static app, kept until GitHub Pages is retired.

## Credits
Piano and bass samples: FluidR3_GM by Frank Wen, via [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts), licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
