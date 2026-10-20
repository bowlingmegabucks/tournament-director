# Deployment

## Frontend (GreenGeeks, FTP)

Plan, not built yet:

1. GitHub Action on push to `main`: `npm ci`, lint, typecheck, test, then `npm run build` with `VITE_USE_MOCKS=true` (until the API exists).
2. Upload `web/dist/` to the site's web root over FTP/FTPS.
3. Secrets in GitHub: `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`. Use FTPS if the host allows it.
4. Because this is a single-page app, add an `.htaccess` rewrite so deep links return `index.html`.

The mock bundle is large (faker). That is acceptable for the throwaway demo. The real build drops it.

## API

GreenGeeks shared hosting does not show "Setup Node.js App" in cPanel for this account. Options:

- Ask GreenGeeks support whether Node is available on the plan.
- Host the API elsewhere (Render, Railway, Fly.io). The frontend then needs the API URL in an env var and the API needs CORS.
- Move to a plan or VPS that runs Node.

Decide at step 4 of the plan in `CLAUDE.md`.
