# Gig Book

Next.js (App Router) + TypeScript + React + plain CSS. See README.md for the layout.

- The live app is `app/`, `components/`, `lib/`. Styles go in `app/globals.css`.
- `index.html`, `js/` and `css/` are the old static app, kept only until GitHub Pages is retired. Don't edit them.
- Before committing, run `npm run typecheck` and `npm run lint`. Both must pass with no new warnings.
- Match the surrounding code: terse comments, short helpers, no new dependencies unless really needed.
- App state lives in `components/AppProvider.tsx`; storage goes through the `DataStore` interface (`lib/data/`), which has local (IndexedDB) and Supabase adapters. Changes must work in both.
