# Niu Real Book

The product is called **Niu Real Book** (repo and package: `niu-real-book`; the Supabase project is still named `gig-book`, and storage keys keep the `gigbook-` prefix and the IndexedDB name `gig-book` so nobody loses their data).

Next.js (App Router) + TypeScript + React + plain CSS. See README.md for the layout.

- The live app is `app/`, `components/`, `lib/`. Styles go in `app/globals.css`.
- `index.html`, `js/` and `css/` are the old static app, kept only until GitHub Pages is retired. Don't edit them.
- Before committing, run `npm run typecheck` and `npm run lint`. Both must pass with no new warnings. `typecheck` covers `tests/` too: Supabase `.single()` and `must()` results can be null, so use `!` or a check there (cloud builds have failed on this).
- Match the surrounding code: terse comments, short helpers, no new dependencies unless really needed.
- App state lives in `components/AppProvider.tsx`; storage goes through the `DataStore` interface (`lib/data/`), which has local (IndexedDB) and Supabase adapters. Changes must work in both.
- What to do next session: `docs/NEXT.md` (read it first; update it at the end of a session).
- Product scope and build order: `docs/REQUIREMENTS.md`. Each issue names the requirement ids (R1, R5.2…) it implements.

## UI standards
Dan's rules from feedback. Every UI change follows them; check new work against them before committing.
- **One thing at a time, tabs over stacking.** When a panel or page offers different kinds of thing (sources, owners, steps, kinds of content), split them into tabs (`.pl-tabs` / `.pl-tab`, `role="tablist"`), not blocks stacked down one page. Examples: Recordings → Find / Upload; Notes → Band / Private. A tab's description goes below the tabs, never above.
- **Creation behind a button.** Adding or creating opens a modal (`Modal`) from a button; no inline create forms on list pages.
- **Little text on screen.** Explanations, limits, file types and caveats go in an `Info` icon by the label. Exception: privacy and AI warnings stay visible (`AiNote`).
- **Row actions in a ⋯ menu** (`MenuButton`, `caret={false}`) at the end of the row. Page-level actions stay on screen (only calm mode tucks them under More).
- **Destructive or big actions** (delete, remove someone, hand over) confirm with `ConfirmTyped` (type "approve").
- **Plain words.** Write for musicians, not developers: no dev labels ("Built in", storage names), no example placeholders, no jargon. Mark unfinished things with `<span className="stamp wip">Work in progress</span>`.
- **Buttons have icons and text** (`Icon`); icon-only buttons need an `aria-label`.
- **Consistent styles.** Reuse existing components and classes; no new one-off shapes (no rounded pills where the site uses flat tabs).
- **Show only what applies.** Hide options that can't work here (an original has no famous recordings to search).

## Shipping
- **`develop` is where work happens.** Commit straight to `develop` and push once typecheck and lint pass. No feature branches or PRs unless Dan asks for one. Pushes to `develop` run no CI and no Vercel deploy.
- Dan smoke-tests `develop` on localhost against the **dev Supabase project** (`niu-real-book-dev`, ref supzlyiwwkrgendintmc; live is `gig-book`) (`.env.development.local`, see `.env.development.example`; `npm run dev` picks it up over `.env.local`). `npm run db:dev` applies migrations to it and `npm run seed:dev` (re)creates the fake musicians (`tests/fixtures.ts`, password in there).
- **`main` is live.** Only merge `develop` into `main` when Dan says to release: `git checkout main && git merge --ff-only develop && git push`, then back to `develop`. That push runs the test suite and Vercel deploys it. Apply any new migrations to live at the same time (below). Check the run: `gh run list --workflow test.yml --limit 1`.
- At each release, add an entry to `lib/whatsNew.ts` for anything users will notice since the last release (plain words, skip if nothing user-facing).
- `@claude` on an issue builds it in GitHub Actions from `develop` and lands it on `develop` as one commit (say "as a PR" in the request to get a pull request into `develop` instead). Don't run two builds at once that touch the same migration rules or files: run them one after another.
- The test suite (`.github/workflows/test.yml`) uses a throwaway local Supabase and no AI tokens. It runs on pushes to `main` and PRs into `main`.
- The bot can't write under `.github/workflows/`; workflow changes are made locally and pushed.

## Database migrations
- New schema goes in a new file `supabase/migrations/00NN_name.sql` (next number). Write it so it is **safe to run more than once** (`if not exists`, `create or replace`, `drop policy if exists`, constraints in `do $$ … exception when duplicate_object`).
- Never edit a migration that has been applied to the live project; fix things in a new one. (Check with the list command below.)
- Migrations that redefine shared rules (the `attachments` policies, `attachments_one_parent`, `can_read/write_attachment_path`, `setlist_role`) must keep every existing case. Read the latest definition across all earlier migrations first.
- Claude Code applies them to the linked project (`gig-book`, ref in `supabase/.temp/project-ref`) with the Supabase CLI:
  1. `npx supabase migration list --linked` shows what's applied (remote column) and what's pending.
  2. `npx supabase db push --linked --dry-run` must list only the new files.
  3. `npx supabase db push --linked --yes` applies them. This changes the live database: only run it when Dan has asked for migrations to be applied (normally as part of a release to `main`).
- On `develop`, apply new migrations to the dev project with `npm run db:dev` instead (no `--linked`).
- New tables need RLS and access tests in `tests/access/`.
