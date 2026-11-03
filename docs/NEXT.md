# Next steps

What's left to do, in order. Last updated 2026-11-03. Update it at the end of each session.

## Where things are
- Work happens on `develop`; `main` is live (see CLAUDE.md, Shipping).
- Vercel: project `niu-real-book` (GitHub-connected, production branch `main`, env vars set, live site uses the live Supabase). This folder is linked (`.vercel/`).
- Dev Supabase: migrations up to `0021` applied, fake musicians seeded.
- Live Supabase: up to `0015`. Migrations 0016 to 0021 go to live with the release (`npx supabase db push --linked`, see CLAUDE.md).
- New on develop (not released):
  - **Make Spotify playlist** on a setlist (#45): `lib/spotify/user.ts`, `components/SpotifyPlaylist.tsx`, migration 0019.
  - **Recent collaborators** in Share and band invites (#46): migration 0018.
  - **Tools** card: metronome, drone, print (#51): `lib/tools/`, one shared audio context in `lib/audio.ts`. Drone has an optional click; print has blank manuscript paper.
  - **Niu AI** card and page (`/ai`): the AI setlist draft moved out of the New setlist dialog.
  - MusicXML upload and rendering, form clean-up, Share and Add note modals, band chat link.
- Access tests for 0018 and 0019 haven't run yet (no Docker on Dan's Mac). They run in CI on the release.

## Smoke test (Dan, on localhost)
1. **Make Spotify playlist** on one of your setlists: connect, change a recording, skip one, make it, open it in Spotify. Then **Update the linked playlist**.
2. **Share** a setlist: recent collaborators show as one-tap picks; add by email still works.
3. **Tools**: start the metronome, then the drone (the metronome should stop), then the band. Print a setlist.
4. **Add note** with a file; **Band chat** link; a MusicXML file on a lick.

## Before inviting testers (in this order)
1. **Own domain on Vercel**: add Dan's new domain to the `niu-real-book` project (apex plus `www` redirecting to it), add the DNS records Vercel shows at the registrar, wait for "Valid Configuration". The app uses `window.location.origin`, so no code changes.
2. **Point everything at the new address** (`YOUR_SITE` below):
   - Supabase live (#48): Site URL `YOUR_SITE`; redirect URLs `YOUR_SITE/auth/callback` and `https://niu-real-book.vercel.app/auth/callback`. Dev: Site URL `http://localhost:3000`, redirect `http://localhost:3000/auth/callback`.
   - Spotify dashboard, Redirect URIs: add `YOUR_SITE/api/spotify/callback` (keep the 127.0.0.1 one for dev).
   - OpenRouter: update the app's site URL if it's set there; set a monthly credit limit on the key.
3. **#47 Resend SMTP** from `mail.<domain>` (same registrar, so do the DNS in one sitting).
4. **Release** `develop` to `main` (migrations 0016 to 0021 go to live).
5. **#50 Test with a real lead sheet** on the live site.
6. Add testers' Spotify emails in the Spotify dashboard (5 max), then invite them in Supabase (Auth, Users, Invite).

## Before a public launch
- Apply to Spotify for extended quota. Development mode is capped at 5 users.

## Built, to verify
- **#49 First-run tour**: `components/Tour.tsx`; migration 0020 is on dev; local mode remembers it in `gigbook-tour`. Smoke test: a fresh sign-in starts it; Skip, Escape and Done stop it for good; the ? button in the top bar replays it; try a phone and dark mode.

## Later
- #46 extras: collaborator picks for licks and resources; hide someone from the list on the account page.
- #51 extras: a tuner (microphone), ear training.

## Decided
- No in-app music notation editor: free ones are too basic and good ones cost money. MusicXML upload and rendering is enough.
- Spotify playlists use the Authorization Code flow with the app secret; the refresh token is sealed (AES-GCM) before it's stored.

## Open questions
- Should band invite links be multi-use or single-use?
- Later: share licks and resources with a band, AI dedupe of lead sheets, a full WhatsApp integration.
