# Deployment

## Frontend (GreenGeeks, FTP)

`.github/workflows/deploy.yml` runs on push to `main` (when `web/` changes) and by hand:

1. `npm ci --ignore-scripts`, lint, format check, typecheck, test, then `npm run build`. Mocks stay on through `web/.env.production` until the API is deployed.
2. Upload `web/dist/` over FTPS with [FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action), pinned to a commit SHA. It keeps a state file on the server and uploads only changed files. `web/public/.htaccess` blocks web access to that file.
3. The job uses the GitHub environment `production`. Set these there:
   - Secrets: `FTP_USERNAME`, `FTP_PASSWORD`.
   - Variables: `FTP_SERVER`, `FTP_SERVER_DIR` (remote folder, must end with `/`, for example `public_html/`).
   The job runs only on `main`, and a step fails the run if `FTP_SERVER_DIR` does not end with `/`.
4. First run: use "Run workflow" with `dry_run` on to check the file list. If an upload fails midway, run the workflow again by hand.
5. Once the site gets client-side routes, add a rewrite to `web/public/.htaccess` so deep links return `index.html`. Switch `base` from `'./'` to `'/'` at the same time, or assets will break on nested paths.

The mock bundle is large (faker). That is acceptable for the throwaway demo. The real build drops it.

## API

GreenGeeks shared hosting does not show "Setup Node.js App" in cPanel for this account. Options:

- Ask GreenGeeks support whether Node is available on the plan.
- Host the API elsewhere (Render, Railway, Fly.io). The frontend then needs the API URL in an env var and the API needs CORS.
- Move to a plan or VPS that runs Node.

Decide at step 4 of the plan in `CLAUDE.md`.

When the API is live:

1. Delete `VITE_USE_MOCKS` from `web/.env.production`.
2. Decide how the browser reaches the API. Same host with a reverse proxy for `/api` needs no change. A different host needs a build-time API base URL in `web/` (`api.ts` files call relative `/api/...` today) and `CORS_ORIGIN` on the API set to the site's origin.
3. Add the API deploy workflow and its secrets to the `production` environment.
