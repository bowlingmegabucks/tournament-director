# Deployment

## Frontend (GreenGeeks, FTP)

`.github/workflows/deploy.yml` runs on push to `main` (when `web/` changes) and by hand:

1. `npm ci`, lint, format check, typecheck, test, then `npm run build` with `VITE_USE_MOCKS=true` (until the API exists).
2. Upload `web/dist/` over FTPS with [FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action). It keeps a state file on the server and uploads only changed files.
3. The job uses the GitHub environment `production`. Set these there:
   - Secrets: `FTP_USERNAME`, `FTP_PASSWORD`.
   - Variables: `FTP_SERVER`, `FTP_SERVER_DIR` (remote folder, must end with `/`, for example `public_html/`).
4. First run: use "Run workflow" with `dry_run` on to check the file list.
5. Once the site gets client-side routes, add an `.htaccess` rewrite so deep links return `index.html`. Switch `base` from `'./'` to `'/'` at the same time, or assets will break on nested paths.

The mock bundle is large (faker). That is acceptable for the throwaway demo. The real build drops it.

## API

GreenGeeks shared hosting does not show "Setup Node.js App" in cPanel for this account. Options:

- Ask GreenGeeks support whether Node is available on the plan.
- Host the API elsewhere (Render, Railway, Fly.io). The frontend then needs the API URL in an env var and the API needs CORS.
- Move to a plan or VPS that runs Node.

Decide at step 4 of the plan in `CLAUDE.md`.
