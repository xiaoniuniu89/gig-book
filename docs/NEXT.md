# Next steps

What's left to do, in order. Last updated 2026-11-02. Update it at the end of each session.

## Where things are
- Work happens on `develop`; `main` is live (see CLAUDE.md, Shipping).
- The dev Supabase project is set up: all migrations are applied and the fake musicians are seeded. On localhost, `npm run dev` shows the "Sign in as a test musician" buttons.
- Latest on develop:
  - Share and Add note now open in modals.
  - Band chat link.
  - 20 MB file cap.
  - Feedback is triaged by the AI.
- Not released to `main` yet. Migration 0015 is already applied to live.

## Smoke test first (Dan, on localhost)
1. Sign in as Ava. Open a setlist and use **Share**: the band picker, add by email, and change a role.
2. Use **Add note** on a setlist, a tune, and the band Notes tab, with a file attached.
3. Set a band's group chat link and check the **Band chat** button opens it.

## Before inviting testers
1. **#48 Deploy to Vercel** (Dan is part way through): env vars, the Supabase Site URL and redirect URLs (live and dev), then release `develop` to `main`.
2. **#47 Resend SMTP**: Claude walks Dan through it. First question: which domain should emails come from?
3. **#50 Test with a real lead sheet**: upload, Use as chart, fullscreen on a phone, a band member opening it.
4. Invite testers: Supabase, then Auth, then Users, then Invite.

## Next features (must haves)
1. **#45 Make a Spotify playlist from a setlist, in the app**: Spotify OAuth, plus a modal to check the recordings, then create the playlist.
2. **#46 Recent collaborators**: no friend requests; people you've been in a band or shared something with.
3. **#49 First-run tour**.

## Then
- **#51 Tools card**: metronome, drone, print sheet music. Find Dan's old repos to reuse first.

## Open questions
- Should band invite links be multi-use or single-use?
- Later: share licks and resources with a band, AI dedupe of lead sheets, a full WhatsApp integration.
