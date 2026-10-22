# Deployment

## Frontend (GreenGeeks, FTP)

`.github/workflows/deploy.yml` runs on push to `main` (when `web/` changes) and by hand:

1. `npm ci --ignore-scripts`, lint, format check, typecheck, test, then `npm run build`. The build has no mocks: it calls the API at `API_BASE_URL` (see the API section).
2. Upload `web/dist/` over FTPS with [FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action), pinned to a commit SHA. It keeps a state file on the server and uploads only changed files. `web/public/.htaccess` blocks web access to that file.
3. The job uses the GitHub environment `production`. Set these there:
   - Secrets: `FTP_USERNAME`, `FTP_PASSWORD`.
   - Variables: `FTP_SERVER`, `FTP_SERVER_DIR` (remote folder, must end with `/`, for example `public_html/`).
     The job runs only on `main`, and a step fails the run if `FTP_SERVER_DIR` does not end with `/`.
4. First run: use "Run workflow" with `dry_run` on to check the file list. If an upload fails midway, run the workflow again by hand.
5. The site has client-side routes (`react-router`), so `web/public/.htaccess` rewrites any address that is not a file or folder to `index.html`, and `base` in `vite.config.ts` comes from `WEB_BASE_PATH` (`/` locally; the deploy sets `/tournament-director/`, the folder the site sits in). The router reads the same value as its `basename`. Without it, assets load from the domain root and 404. **Check after the first deploy:** open a deep link such as `/tournaments/abc` directly. The "Tournament not found" page should show, not a host 404. If the host ignores `.htaccess`, switch `main.tsx` to `createHashRouter` (addresses become `/#/tournaments/abc`); nothing else changes.

The mock bundle is large (faker). That is acceptable for the throwaway demo. The real build drops it.

## API (Azure App Service)

The `deploy-api` job in `.github/workflows/deploy.yml` runs before `deploy-web` and the web job waits for it (`needs`). A failed API deploy stops the web deploy.

Azure resources (in one resource group):

- App Service plan (Linux, B1 or better; F1 sleeps when idle).
- Web App `app-tournamentdirector-prod`, runtime Node 24 LTS, startup command `npm start`.
- Entra app registration with a federated credential: GitHub organization `bowlingmegabucks`, repository `tournament-director`, entity type Environment, name `production`. The app's service principal has the **Website Contributor** role on the Web App.

The job:

1. Checks out, then runs `npm ci --ignore-scripts`, lint, format check, typecheck, test, and `npm run build` in `api/`.
2. Stages `dist/`, `package.json`, and `package-lock.json` in `api-package/` and runs `npm ci --omit=dev` there, so Azure gets only what runs.
3. Signs in with [Azure/login](https://github.com/Azure/login) over OIDC (no stored password) and uploads the folder with [Azure/webapps-deploy](https://github.com/Azure/webapps-deploy). Both actions are pinned to commit SHAs. With `dry_run` on, the job builds and stages but skips the sign-in and upload.

Settings:

- GitHub `production` environment: secret `AZURE_CLIENT_ID`; variables `AZURE_WEB_APP_NAME` (`app-tournamentdirector-prod`) and `API_BASE_URL` (the API origin, for example `https://app-tournamentdirector-prod.azurewebsites.net`; copy the exact "Default domain" from the Web App overview). The web build passes `API_BASE_URL` to Vite as `VITE_API_BASE_URL`.
- GitHub organization secrets, shared to this repo: `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`.
- Web App application settings: `TRUST_PROXY` = `1` (App Service puts one proxy in front of the app; without it the rate limiter sees every caller as one address) and `CORS_ORIGIN` = `https://bowlingmegabucks.com,https://www.bowlingmegabucks.com`. The site answers on both hosts, and a page on one that is not in the list gets a CORS block (the button then says "Could not reach the API"). An origin is scheme and host only, so leave off the `/tournament-director` path. Azure sets `PORT`.
- Web App application setting `DATABASE_URL` = `mariadb://USER:PASSWORD@HOST:3306/DATABASE`, the legacy database (D-33). Without it the API does not start. URL-encode special characters in the password (`@` is `%40`). The GreenGeeks server accepts all addresses, so the protection is a strong password and TLS: add `?ssl=true` and check that the connection works (the certificate must match the host name). Check `GET /ready` after a deploy: 200 means the API reached the database; 503 means it did not (read the cause in the logs). The deploy job runs `npm run db:generate` before the build, and stages production packages with `--omit=optional` to leave out Prisma's command-line tools.
- `main.yml` grants `id-token: write` to the deploy job. A called workflow cannot hold more permission than its caller.

If `Azure/login` fails with `AADSTS700213` (no matching federated identity), the error prints the `sub` claim GitHub sent. Make the credential's subject match it.

The live site calls the real API (`web/.env.production` is gone, so mocks are off). The web job stops early if `API_BASE_URL` is not an `https://` URL.

The site (`https://bowlingmegabucks.com/tournament-director/`) and the API (`*.azurewebsites.net`) are different origins. `web/` reads the API origin from `VITE_API_BASE_URL` (`apiUrl()` in `web/src/shared/apiUrl.ts`; empty in dev, where Vite proxies `/api`), and `CORS_ORIGIN` on the API must be the site's origin.
