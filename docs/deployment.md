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

- App Service plan `asp-tournamentdirector-prod` (Linux, **B1**, one worker; the owner moved off the free tier). B1 has Always On, so the first request after idle is no longer slow. F1 sleeps when idle.
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
- Web App application setting `API_KEY`: the key the registration site sends in `x-api-key` (D-95), 32 characters or more. Without it the API does not start, so set it before the first deploy that needs it. At cutover it holds the vendor's current legacy key, so the vendor changes nothing (D-09). Make a new one with `openssl rand -base64 32`. Check it with `curl -H "x-api-key: <key>" <API origin>/v1/me`: a good key answers 200 with `"apiKey":true`, a wrong one 401.
- Web App application settings for email (the add-user invite; see [user-management.md](requirements/user-management.md#settings)): `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, and `WEB_BASE_URL`. Optional: with `SMTP_HOST` empty, email is off and no user can be added. Once a host is set, the other four are required. The web build needs nothing new.
- Web App application settings `AUTH_SECRET` and `AUTH_BASE_URL` (D-98, D-99). Without them the API does not start, so set both **before** the deploy that includes the sign-in work. `AUTH_SECRET` signs the sign-in cookie: 32 characters or more, a new value (`openssl rand -base64 32`), never the same as `API_KEY`. Changing it later signs everyone out. `AUTH_BASE_URL` is the API's own address, scheme and host only: today the exact default domain, for example `https://app-tournamentdirector-prod.azurewebsites.net` (the same value as the `API_BASE_URL` variable); at 0.4.0 `https://api.bowlingmegabucks.com`. Create the sign-in tables once on the production database with `api/prisma/auth-tables.sql`, then make the first admin with `npm run users:create-admin` (both in [api-standards.md](api-standards.md#database)).
- Web App application setting `DATABASE_URL` = `mariadb://USER:PASSWORD@HOST:3306/DATABASE`, the legacy database (D-33). Without it the API does not start. URL-encode special characters in the password (`@` is `%40`). The GreenGeeks server accepts all addresses, so the protection is a strong password and TLS: add `?ssl=true` and check that the connection works (the certificate must match the host name). Check `GET /ready` after a deploy: 200 means the API reached the database; 503 means it did not (read the cause in the logs). The deploy job runs `npm run db:generate` before the build, and stages production packages with `--omit=optional` to leave out Prisma's command-line tools.
- `main.yml` grants `id-token: write` to the deploy job. A called workflow cannot hold more permission than its caller.

If `Azure/login` fails with `AADSTS700213` (no matching federated identity), the error prints the `sub` claim GitHub sent. Make the credential's subject match it.

The live site calls the real API (`web/.env.production` is gone, so mocks are off). The web job stops early if `API_BASE_URL` is not an `https://` URL.

The web build hides the Sign in link and `/login` unless `VITE_SHOW_SIGN_IN=true` (`WEB-07`). Leave it off until the API is on `api.bowlingmegabucks.com` (0.4.0): on `azurewebsites.net` the browser blocks the cookie. The deploy sets it from the `SHOW_SIGN_IN` variable (production environment variables in GitHub). Unset or any value but `true` keeps sign-in hidden. Set `SHOW_SIGN_IN=true` once `API_BASE_URL` is `https://api.bowlingmegabucks.com` and `GET /ready` returns 200, then redeploy.

The site (`https://bowlingmegabucks.com/tournament-director/`) and the API (`*.azurewebsites.net`) are different origins. `web/` reads the API origin from `VITE_API_BASE_URL` (`apiUrl()` in `web/src/shared/apiUrl.ts`; empty in dev, where Vite proxies `/api`), and `CORS_ORIGIN` on the API must be the site's origin.

### Database script for the skip (D-235)

Run `api/prisma/score-tables.sql` once on the production database **before the deploy that ships score entry**. It creates `SessionSkip` if it is missing, so running it again is safe, and it touches no legacy table. Without it the skip routes, recap sheets, and score entry answer `503`. Same way as the sign-in tables ([api-standards](api-standards.md#database)). Locally: `docker exec -i tournament-director-db mariadb -uroot -p<password> <database> < api/prisma/score-tables.sql`.

### Live updates (SSE, D-217)

The lane page keeps itself fresh over server-sent events: `GET /v1/tournaments/{id}/squads/{sessionId}/events` (and the sweeper twin). The Scores tab and score entry listen to the public `…/scores/events` the same way (D-232); both streams count against the 500. The streams go from the browser straight to the API's origin, so only the Azure settings matter, not GreenGeeks.

- **HTTP version 2.0** on the Web App (**on**, checked 2026-11-09; portal: Configuration > General settings > HTTP version; or `az webapp update -g rg-tournamentdirector-prod -n app-tournamentdirector-prod --http20-enabled true`). Without it a browser holds at most 6 connections to the API across all tabs, and each open lane page holds one stream. Keep **HTTP 2.0 Proxy** off: Express speaks HTTP/1.1 only, and Azure's front end already speaks HTTP/2 to the browser.
- **WebSockets are not needed.** SSE is plain HTTP.
- **Idle limit.** Azure's front end closes a connection that is quiet for about 4 minutes. The stream sends a `: heartbeat` comment every 25 s, so it stays open.
- **One instance only (D-224).** The hub that tells open pages about a change lives in the Node process. With two instances, a change saved on one never reaches a page connected to the other, and the plan bill doubles. Do not scale the plan out; no autoscale rule.
- **Deploys.** A deploy drops every stream. The server ends them first on SIGTERM, so shutdown does not wait out the 10 s limit, and each browser reconnects and refetches by itself.
- The API refuses a stream past 500 open connections with `503`.
- **Rate limit (D-223, D-232).** The default 100 requests a minute per address stays for every route except the live score routes, which count apart at `LIVE_RATE_LIMIT_MAX` (default 600) so a venue full of phones watching scores does not lock out the keepers. Raise `RATE_LIMIT_MAX` if more desks share one address, and `LIVE_RATE_LIMIT_MAX` if more viewers do.

### Custom domain (0.4.0)

At 0.4.0 the API moves to `api.bowlingmegabucks.com`, which today points to the legacy API. Changing that DNS record is the vendor cutover. Steps:

- The plan is already Basic (B1), which allows a custom domain (the Free tier does not) and has Always On.
- Add the domain to the Web App (a CNAME to the default domain, plus the `asuid` TXT record) and bind a free App Service managed certificate.
- Set `API_BASE_URL` to `https://api.bowlingmegabucks.com` and redeploy the web app.

Sign-in needs this. The session is an `httpOnly` cookie (D-99), and the browser sends it from `bowlingmegabucks.com` only to an API on the same site. On `*.azurewebsites.net` it would be a third-party cookie, which Safari blocks. No one signs in to production before 0.4.0.
