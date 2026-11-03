# Next steps

What's left to do, in order. Last updated 2026-11-03. Update it at the end of each session.

## Where things are
- Work happens on `develop`; `main` is live (see CLAUDE.md, Shipping).
- Vercel: project `niu-real-book` (GitHub-connected, production branch `main`, env vars set, live site uses the live Supabase). This folder is linked (`.vercel/`).
- Dev Supabase: migrations up to `0021` applied, fake musicians seeded.
- Live Supabase: up to `0021` (released 2026-11-03). Live site: https://www.niurealbook.com.
- Released 2026-11-03:
  - **Make Spotify playlist** on a setlist (#45): `lib/spotify/user.ts`, `components/SpotifyPlaylist.tsx`, migration 0019.
  - **Recent collaborators** in Share and band invites (#46): migration 0018.
  - **Tools** card: metronome, drone, print (#51): `lib/tools/`, one shared audio context in `lib/audio.ts`. Drone has an optional click; print has blank manuscript paper.
  - **Niu AI** card and page (`/ai`): the AI setlist draft moved out of the New setlist dialog.
  - MusicXML upload and rendering, form clean-up, Share and Add note modals, band chat link.

## Smoke test (Dan, on localhost)
1. **Make Spotify playlist** on one of your setlists: connect, change a recording, skip one, make it, open it in Spotify. Then **Update the linked playlist**.
2. **Share** a setlist: recent collaborators show as one-tap picks; add by email still works.
3. **Tools**: start the metronome, then the drone (the metronome should stop), then the band. Print a setlist.
4. **Add note** with a file; **Band chat** link; a MusicXML file on a lick.

## Before inviting testers (in this order)
1. ~~Own domain on Vercel~~ Done 2026-11-03: **`https://www.niurealbook.com`** (Namecheap DNS; the bare domain redirects to www). `YOUR_SITE` below means that.
2. ~~Supabase live URLs, Spotify redirect URI~~ done 2026-11-03.
3. ~~#47 Resend SMTP~~ set up 2026-11-03 (`login@mail.niurealbook.com`, Namecheap DNS). To confirm: invite a second email of Dan's and sign in with it.
4. ~~Release~~ done 2026-11-03.
5. **OpenRouter**: set a monthly credit limit on the API key.
6. **#50 Test with a real lead sheet** on the live site.
7. Add testers' Spotify emails in the Spotify dashboard (5 max), then invite them in Supabase (Auth, Users, Invite).

## Before a public launch
- Apply to Spotify for extended quota. Development mode is capped at 5 users.

## Built, to verify
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
