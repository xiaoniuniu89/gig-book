# Gig Book

Next.js (App Router) + TypeScript + React + plain CSS. See README.md for the layout.

- The live app is `app/`, `components/`, `lib/`. Styles go in `app/globals.css`.
- `index.html`, `js/` and `css/` are the old static app, kept only until GitHub Pages is retired. Don't edit them.
- Before committing, run `npm run typecheck` and `npm run lint`. Both must pass with no new warnings.
- Match the surrounding code: terse comments, short helpers, no new dependencies unless really needed.
- App state lives in `components/AppProvider.tsx`; storage goes through the `DataStore` interface (`lib/data/`), which has local (IndexedDB) and Supabase adapters. Changes must work in both.
- Product scope and build order: `docs/REQUIREMENTS.md`. Each issue names the requirement ids (R1, R5.2…) it implements.

## Shipping
- **Commit straight to `main`** and push once typecheck and lint pass. No branches or PRs unless Dan asks for one.
- `@claude` on an issue builds it in GitHub Actions and lands it on `main` as one commit (say "as a PR" in the request to get a pull request instead). Don't run two builds at once that touch the same migration rules or files: run them one after another.
- The test suite (`.github/workflows/test.yml`) runs on every push and PR against a throwaway local Supabase. It uses no AI tokens. Check it after pushing: `gh run list --workflow test.yml --limit 1`.
- The bot can't write under `.github/workflows/`; workflow changes are made locally and pushed.

## Database migrations
- New schema goes in a new file `supabase/migrations/00NN_name.sql` (next number). Write it so it is **safe to run more than once** (`if not exists`, `create or replace`, `drop policy if exists`, constraints in `do $$ … exception when duplicate_object`).
- Never edit a migration that has been applied to the live project; fix things in a new one. (Check with the list command below.)
- Migrations that redefine shared rules (the `attachments` policies, `attachments_one_parent`, `can_read/write_attachment_path`, `setlist_role`) must keep every existing case. Read the latest definition across all earlier migrations first.
- Claude Code applies them to the linked project (`gig-book`, ref in `supabase/.temp/project-ref`) with the Supabase CLI:
  1. `npx supabase migration list --linked` shows what's applied (remote column) and what's pending.
  2. `npx supabase db push --linked --dry-run` must list only the new files.
  3. `npx supabase db push --linked --yes` applies them. This changes the live database: only run it when Dan has asked for migrations to be applied.
- New tables need RLS and access tests in `tests/access/`.
