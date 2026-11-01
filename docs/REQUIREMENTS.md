# Gig Book v1 — requirements

Status: agreed scope, 1 Nov 2026. Owner: Dan. Built issue by issue with the Claude GitHub action; each issue links back here.

## Product in one line
A setlist is the band's shared workspace: charts, notes, recordings and feedback for every tune in one place, usable on a phone.

## Users
- 5–20 musicians at first, invited by Dan. Several of them only have a phone, so **mobile is the primary screen**, desktop second.
- Not used on stage yet. Offline use is wanted later, not now.

## What already exists (do not rebuild)
Next.js 15 (App Router) + TypeScript + plain CSS on Vercel, Supabase for accounts. See README.md and CLAUDE.md.
- iReal Pro import → setlists and a personal library; analysed chord charts with transpose; backing band; Spotify embed and version search; practice gig.
- Supabase schema `supabase/migrations/0001_init.sql`: `profiles`, `setlists` (with `visibility` private/link/public), `setlist_items` (one free-text `note` per tune), `setlist_members` (viewer/editor), `library_playlists`, all behind row-level security.
- Magic-link sign-in; a local-only (IndexedDB) mode when Supabase isn't configured.

## Principles
1. **Closed beta.** Nobody gets an account unless Dan adds their email. No public sign-up.
2. **Signed in to see anything.** With Supabase configured, every page except sign-in requires an account. No anonymous reads.
3. **Notes never leak.** A note belongs to one place (a setlist, one tune in a setlist, or the author's own copy of a song) and is only visible to people with access to that place. A note on Autumn Leaves in one band's setlist never appears on anybody else's Autumn Leaves.
4. **Phone first.** Every feature must be usable at 375 px wide with touch: 44 px tap targets, no hover-only controls, no horizontal page scroll.
5. **Account-only social features.** Sharing, members, notes threads, attachments and notifications need Supabase. In local-only mode they are hidden, not emulated (this is an agreed exception to the "works in both adapters" rule in CLAUDE.md).
6. Small, terse code; no new dependencies unless an issue says so.

## Requirements

### R1 Accounts and access (closed beta)
- R1.1 With Supabase configured, signed-out visitors see only a sign-in screen. Setlists, library and charts are not rendered.
- R1.2 Sign-in uses the existing email link with `shouldCreateUser: false`; an unknown email gets a friendly "this email isn't on the list yet, ask Dan" message.
- R1.3 Dan adds people in the Supabase dashboard (Authentication → Users → Invite / Add user). README documents this and turning off "Allow new users to sign up".
- R1.4 Anonymous (`anon`) access to setlists and items is removed in a new migration. `link`/`public` visibility is retired from the UI; sharing goes through members (R4).
- R1.5 Local-only mode stays for development when Supabase env vars are empty.

### R2 Mobile
- R2.1 Every existing view (home, import, setlist, tune, library, dock, sign-in) works at 375 px and 768 px, portrait and landscape.
- R2.2 Charts stay readable on a phone: no clipped bars, no horizontal scroll of the page.

### R3 Chart view (focus mode)
- R3.1 A full-screen "chart only" view per tune: just the chart (or later the PDF), large type, minimal chrome.
- R3.2 Swipe left/right (and on-screen buttons) for the previous/next tune in the setlist; transpose still available.
- R3.3 Keeps the screen awake while open (Screen Wake Lock API, where supported).
- R3.4 When a tune has a PDF/image chart attached (R6), the chart view can show it instead of the iReal chart.

### R4 Members, permissions and sharing
- R4.1 The setlist owner shares a setlist with an existing user by email. Unknown emails are not invited automatically (closed beta, R1); the owner is told to ask Dan.
- R4.2 Setlist settings (owner only) lists members with their role. The owner can switch each member between **viewer** and **editor**, and remove them.
- R4.3 Every member, viewer or editor, can read everything on the setlist and add notes, replies and attachments (R5, R6). Only editors and the owner change the setlist itself (name, tunes, order, keys, Spotify playlist).
- R4.4 A member can leave a setlist.
- R4.5 Being added to a setlist creates an in-app notification (R7).

### R5 Notes and discussion
- R5.1 A note has an author, a body (plain text, links), a time, and exactly one home: a setlist (general setlist notes), a tune within a setlist, or the author's personal song notes.
- R5.2 Anyone who can read the home can read its notes; any member can add notes there. Authors edit and delete their own notes; the setlist owner can delete any note on their setlist.
- R5.3 Replies: anyone who can read a note can reply. One level of threading is enough.
- R5.4 Notes have an optional tag: intro, ending, arrangement, solo, form, practice, general.
- R5.5 Copy a note (and its attachments) to another setlist the user can edit or note on, or to the user's personal notes for that song. Copies are independent.
- R5.6 Personal song notes are keyed by the user and a normalised song key (title + composer from the iReal string, as in `lib/songs.ts`), and show on every setlist tune and library chart with that song, **for that user only**.
- R5.7 The existing single `setlist_items.note` is migrated into a setlist-tune note authored by the setlist owner.

### R6 Attachments
- R6.1 Notes can carry attachments: PDF, image (photo or screenshot, e.g. a handwritten intro) and audio (MP3/M4A/WAV/WebM, including a recording made on the phone).
- R6.2 On phones, "Take photo" and "Record" use the camera/mic directly (file input `capture`, and MediaRecorder for audio).
- R6.3 Files are stored in a private Supabase Storage bucket and served by short-lived signed URLs. Access follows the note's access exactly.
- R6.4 Inline viewing: images and PDFs open in a viewer, audio plays in an inline player.
- R6.5 No size limits or quotas in v1 beyond Supabase's own defaults; revisit before opening up.

### R7 Notifications
- R7.1 In-app: a bell with an unread count; entries for "added to setlist", "new note on your setlist", "reply to your note". Mark read.
- R7.2 Email for "added to setlist" (and optionally replies), via a transactional email provider. Needs Dan to pick a provider and add a key; built after R7.1.

### R8 Licks (personal snippet library)
- R8.1 A user's own library of licks/ideas: title, text, tags (e.g. ii–V, key), optional attachments (image, PDF, audio).
- R8.2 Attach a lick to any tune (setlist tune or personal song notes); the same lick can be attached in many places and edits show everywhere it's attached.
- R8.3 Share a lick by attaching it in a shared setlist (it becomes visible to that setlist's members only).
- R8.4 Export the chord progression a lick sits over as an iReal Pro link (e.g. ii–V–I in all 12 keys). Notation export (MusicXML) is out of scope for v1.

### R9 Creating setlists
- R9.1 Create an empty setlist and add tunes from the library (no import needed).
- R9.2 AI-assisted: describe what you want ("bebop heads, medium-up") and get a draft setlist from tunes in your library, plus a suggested Spotify search. Needs an LLM API key; built last.

### Later (captured, not v1)
- Offline chart view (service worker caching of setlists and attachments).
- Lead-sheet (Real Book) PDFs per song in the library.
- Storage quotas, open sign-up, public setlists.
- Notation editor for licks; MusicXML export.
- iPad-specific layout.

## Data model additions (Supabase)
New migrations after `0001_init.sql`, one per issue that needs them:
- `notes` — `id`, `author`, `setlist_id` (nullable), `setlist_item_id` (nullable), `song_key` (nullable, for personal notes), `parent_id` (replies), `tag`, `body`, timestamps. Check constraint: exactly one home. RLS through `setlist_readable` / `setlist_role` for setlist homes, `author = auth.uid()` for personal ones.
  - Note: `replace_setlist_items` deletes and reinserts items on every save, so item ids are not stable. The notes issue must give items a stable id (keep the client-side item id) before notes reference them.
- `attachments` — `id`, `note_id` or `lick_id`, `storage_path`, `kind` (pdf/image/audio), `name`, `size`, `created_by`. Storage bucket `attachments` (private) with policies matching the parent.
- `notifications` — `id`, `user_id`, `kind`, `payload jsonb`, `read_at`, `created_at`; written by triggers/security-definer functions.
- `licks`, `lick_links` (lick ↔ setlist item / song key).
- A security-definer function to add a member by email (looks up `auth.users` by email, returns a clear error when not found).

Every migration must also be added to README "Part 3" as a step Dan runs in the SQL editor.

## Build order
| # | Issue | Depends on |
|---|-------|-----------|
| 1 | Closed beta: sign-in required, no sign-up, no anonymous reads (R1) | — |
| 2 | Mobile pass over existing views (R2) | — |
| 3 | Full-screen chart view (R3.1–R3.3) | 2 |
| 4 | Setlist members and permissions by email (R4.1–R4.4) | 1 |
| 5 | Notes and replies on setlists, tunes and personal songs (R5) | 4 |
| 6 | Attachments on notes: PDF, photo, audio, phone recording (R6, R3.4) | 5 |
| 7 | In-app notifications (R7.1, R4.5) | 4, 5 |
| 8 | Lick library (R8.1–R8.3) | 6 |
| 9 | Create setlists from the library (R9.1) | — |
| 10 | Export lick progressions as iReal Pro links (R8.4) | 8 |
| 11 | Email notifications (R7.2) | 7, provider chosen |
| 12 | AI-assisted setlist drafts (R9.2) | 9, API key |
