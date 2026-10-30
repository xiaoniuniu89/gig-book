# Gig Book

Setlists from iReal Pro with analysed chord charts, a built-in backing band, and Spotify recordings.

Old static version (until it is retired): https://xiaoniuniu89.github.io/gig-book/

## What it does
- **Import** an iReal Pro playlist (share it from iReal Pro as HTML). Make it a setlist, or add it to your library.
- **Charts** show the scale for each stretch (chord scales or Barry Harris), the 3rd and 7th of every chord, and what the harmony is doing (ii–V–I of IV, backdoor, line cliché…). Transpose with − / +.
- **Band**: piano, bass and drums generated from the chords. Any key, any tempo, mute any instrument, loop a section. The current bar is highlighted.
- **Record**: the Spotify player sits in the dock. Load a setlist's playlist and the chart follows the track that's playing. Search Spotify for other versions of a tune and save the ones you like.
- **Practice gig**: plays a set start to finish with the band.
- **Accounts** (once Supabase is set up): sign in with an email link, keep setlists and the library in your account, share a setlist by link.

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
7. Check it: open `YOUR_SITE`. A **Sign in** button now sits next to **Library**. Enter your email, open the link from the email on the same device, and you land back on Gig Book signed in. If you had setlists in that browser before signing in, the home page offers to copy them to your account.

Supabase's built-in email sender only sends a few sign-in emails per hour. That is fine for a handful of people; for more, add your own SMTP server under **Authentication → Emails → SMTP Settings**.

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

## Code
Next.js (App Router), TypeScript, React, plain CSS.
- `app/`: routes. `/` (setlists and import), `/library`, `/library/[playlistId]/[index]`, `/set/[id]`, `/set/[id]/[index]`, `/auth/callback`, and the Spotify API routes `/api/spotify/search?q=` and `/api/spotify/track/[id]`. The root layout holds the dock, so the band and the Spotify embed keep playing while you move around.
- `components/`: `AppProvider` (data, preferences, band, Spotify, practice gig), `Dock`, `TopBar` (sign-in), and the views.
- `lib/ireal.ts`: iReal Pro link parser and form unrolling (repeats, endings, D.C./D.S., codas).
- `lib/theory.ts`, `lib/chart.ts`: analysis and chart rendering (framework-free).
- `lib/band/`: the backing band (generator, Web Audio scheduler, sounds). Samples in `public/sounds/`.
- `lib/spotify/`: server-side Client Credentials calls with caching, browser helpers, the embed player.
- `lib/data/`: one `DataStore` interface with two adapters: `local` (IndexedDB) and `supabase`.
- `supabase/migrations/`: tables and row-level security.
- `index.html`, `js/`, `css/`: the original static app, kept until GitHub Pages is retired.

## Credits
Piano and bass samples: FluidR3_GM by Frank Wen, via [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts), licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
