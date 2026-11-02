# CI files waiting for a maintainer

The bot that wrote the test suite can't write to `.github/workflows/`, so the workflow changes live here.

1. **Move `test.yml`** to `.github/workflows/test.yml`. It runs typecheck, lint, `npm test` (unit + access) and `npm run test:e2e` against a local Supabase on every push to `main` and every pull request.

2. **Edit `.github/workflows/claude.yml`**: in the step that runs `npm ci`, `npm run typecheck`, `npm run lint` (before pushing or merging), also start Supabase and run the tests:

   ```yaml
   - uses: supabase/setup-cli@v1
     with: { version: latest }
   ```
   and in that step's script, after `npm run lint`:
   ```bash
   supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime
   supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY|MAILPIT_URL)=' | tr -d '"' | sed 's/^/export /' > /tmp/sb.env && . /tmp/sb.env
   npm test        # seeds the fake musicians itself, then runs the unit and access tests
   supabase stop --no-backup
   ```
   The end-to-end tests stay in `test.yml` only.
