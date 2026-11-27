# Tournament Management

Bowling tournament management app. React frontend (`web/`), Node.js API (`api/`).
The owner is a .NET developer learning React and Node. Explain choices briefly and compare to .NET where it helps.

## Status and plan

Built so far (full record per branch: [docs/status-history.md](docs/status-history.md); rules per feature: [docs/requirements/](docs/requirements/README.md)):

- **Shell and deploy.** `web/` (Vite + React) deploys to GreenGeeks over FTP; `api/` (Express + TypeScript) deploys to Azure App Service (`app-tournamentdirector-prod`, B1, one instance). The `deploy-api` job runs before `deploy-web`, both on `main` only. See [docs/deployment.md](docs/deployment.md). The production web build has no mocks.
- **API base.** Request logging and ids, rate limiting, OpenTelemetry, crash handling; Prisma over the legacy MariaDB; vendor routes `/v1/tournaments`; access labels on every route.
- **Security.** API key, Better Auth sign-in, roles `scoreKeeper`, `director`, `admin` mapped to permissions, route lock-down, user management (add, list, edit, disable, reset, self-service), SSN encryption. User-management production setup is not built (see [docs/plans/user-management-followups.md](docs/plans/user-management-followups.md)).
- **Read views.** Tournaments, divisions, squads, sweepers, registrations, lane assignments, recap sheets (with QR code), check-in sheet, scores, squad, sweeper, super sweeper, at-large and seeding results, TV page (`liveResults`).
- **Commands.** Create, edit, delete for tournaments, divisions, squads, sweepers, and registrations (desk and vendor routes); complete squad, sweeper, and tournament; lane move; score entry; payouts (data only; the 1099 report comes later).
- **Average verification.** An Averages page where a director verifies or adjusts each handicap bowler's average (`averages.verify`, AVG-01 to AVG-19); handicap works from the average in use, and results, scores, lanes, and TV mark unverified bowlers. Completing a session with unchecked averages asks first. Run `api/prisma/average-tables.sql` once per database before deploying. Plan: [docs/plans/average-verification.md](docs/plans/average-verification.md).
- **No-shows after a complete squad.** An admin (`entries.override`) moves or refunds a no-show from the squad's Results tab, after a preview; payouts get a system note, and the admin may keep a bowler advancing by ruling (NSH-01 to NSH-24, D-309 to D-315, [docs/requirements/no-shows.md](docs/requirements/no-shows.md)). Run `api/prisma/forced-advancer-column.sql` once per database before deploying.
- **TV at-large figure.** Squad screens show each division's at-large spots and the score to beat, from complete squads only, projected from lane assignments while just the last squad is open (RES-57 to RES-62, D-300 to D-305).
- **Lanes out of play.** A director unchecks a pair on the lane page and no one can be put on it; its bowlers move to unassigned after a confirm (OOP-01 to OOP-09, D-316). Run `api/prisma/lanes-out-of-play-table.sql` once per database before deploying.
- **API reference.** `GET /reference` (public) shows the OpenAPI document with Scalar, under its own pinned policy ([docs/api-standards.md](docs/api-standards.md#rules)). Tags and the web-only routes are still open ([docs/v1-requirements.md](docs/v1-requirements.md)).
- **Live updates.** Server-sent events from an in-process hub: run **one instance**. Turn on HTTP/2 in Azure.
- **Tests.** `npm run test:lifecycle` in `web/` plays a whole tournament (Docker and `python3` needed; about 5 minutes); see [docs/plans/lifecycle-e2e.md](docs/plans/lifecycle-e2e.md).
- **Database scripts to run once per database before deploying:** `api/prisma/auth-tables.sql`, `score-tables.sql`, `payout-tables.sql`, `average-tables.sql`, `forced-advancer-column.sql`, `lanes-out-of-play-table.sql` (`npm run db:tables` makes them all locally).
- **Schema changes.** The app is live and the WinForms app is retired: change any table, old ones included, when that is the right design (D-314). Ship the change as a script run once per database. Still never run `prisma migrate`.
- **Rules to keep in mind.** Complete tournaments are frozen (D-130). Deletes are red outline buttons in a `DangerZone` (D-215). Edits sort a field into free, confirm (`409` with `warnings`, resend with `confirmWarnings: true`), or refused (`409` with `errors`). Web-only routes sit beside the vendor routes, which stay untouched.

Also done on branch `claudeSkills`: project skills in `.claude/skills/` (React, TypeScript, testing, composition) and stricter ESLint rules.

**Legacy migration.** We are porting the WinForms Tournament Manager feature by feature. [docs/migration/](docs/migration/README.md) documents every legacy rule with an ID (`REG-04`); use it instead of the old code. Before building a feature, check [decisions-and-questions.md](docs/migration/decisions-and-questions.md) for its open questions. Cite rule IDs in tests and PRs.

**Release path.** 0.1.0 (structure) is out. Next:

- **0.2.0:** read-only views (GET routes) on the existing legacy database; the WinForms app will be sunset. Public routes only. Bowler GETs wait for auth. Every route declares its access; undeclared routes deny.
- **0.3.0:** authentication and authorization (`GET /v1/me` is the test; no ping route), and the rules for what the UI shows when signed in or out (D-102). Decided: Better Auth inside `api/`, database sessions in an `httpOnly` cookie, 12 hours, new tables (default Better Auth names) in the shared database, first admin from a script (D-98 to D-101). Rules in [docs/requirements/sign-in.md](docs/requirements/sign-in.md). Also set the rules for what the UI shows when signed in or out (no permission, no Add button). The API still enforces access.
- **0.4.0:** three parts. (1) The lock-down (D-52): **done (D-105)**. Review every read route and page that was public in 0.2.0 and put the ones that should not be public behind auth; vendor routes follow D-09. (2) The vendor routes the API key reaches (and the rest of the legacy ASP.NET API). (3) The API moves to `api.bowlingmegabucks.com` (needs a paid App Service tier) so the registration site can cut over, then `VITE_SHOW_SIGN_IN=true`. Set up the domain before the tag. No POST, PATCH, or DELETE route ships before the lock-down is done.
- **After 0.4.0:** commands (create tournament, edit division), one feature area per release. People start using the app at 1.0.0.
- **1.0.0:** every item in [docs/v1-requirements.md](docs/v1-requirements.md) is checked. Keep that file current: check items off as they land and add items as we find them. It includes a review of open issues in the legacy `tournament-manager` repo.

## Revisit later

- **Dev container.** Not needed now: one developer, Node 24 from `web/.nvmrc`, and CI tests a clean environment. Raise it with the owner when any of these happens:
  - ~~`api/` needs a database or other services.~~ Happened with the tournament list on the database. The owner deferred a dev container on 2026-10-22: Compose already starts MariaDB, and Testcontainers inside a dev container needs the Docker socket and `TESTCONTAINERS_HOST_OVERRIDE`.
  - A second contributor joins.
  - The owner wants to run Claude with broad permissions in a sandbox.

## Stack (decided)

| Area          | Choice                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------- |
| Frontend      | Vite + React + TypeScript (static build, no server)                                       |
| Server state  | TanStack Query over plain `fetch`                                                         |
| API           | Express + TypeScript                                                                      |
| Layout        | Two separate folders, no npm workspaces. Each has its own `package.json`                  |
| Packages      | npm. Commit `package-lock.json`                                                           |
| Lint / format | ESLint + Prettier                                                                         |
| Tests         | Vitest, Testing Library, MSW, Playwright, Stryker (web); Vitest, Supertest, Stryker (api) |
| API libraries | Zod (validation), helmet (headers), cors                                                  |
| Database      | Legacy MariaDB 11.4.7 through Prisma 7 (hand-written schema, no `prisma migrate`)         |
| Sign-in       | Better Auth in `api/` (email and password, cookie sessions in the database)               |

## Root commands

The root `package.json` only holds shortcuts. It is not an npm workspace; `web/` and `api/` keep their own `package.json` and lockfile.

| Command                                 | Does                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run setup`                         | `npm ci` in the root, `api/`, and `web/`                                                                                                                                                                                                                                                                                                                                                                                              |
| `npm run dev`                           | API (port 3000) and web (port 5173) together; web proxies `/api`                                                                                                                                                                                                                                                                                                                                                                      |
| `npm run services:up` / `services:down` | Start / stop the Docker Compose services (Seq, MariaDB, and Mailpit). Seq UI: http://localhost:15380; database on port 15306; Mailpit inbox: http://localhost:15325 (SMTP on 15025)                                                                                                                                                                                                                                                   |
| `npm run users:create-admin`            | Ask for an email, name, and password (hidden) and make an admin. First production admin: see [docs/api-standards.md](docs/api-standards.md#database)                                                                                                                                                                                                                                                                                  |
| `npm run db:seed`                       | Add sample tournaments, divisions, squads, sweepers, registrations (with their bowlers, three of them in the super sweeper), and scores to the local database, plus one sign-in user per role (`admin@example.com` and others; passwords in [docs/api-standards.md](docs/api-standards.md#database); skipped if the table holds another user, unless you pass `-- --force-users`) (you create the tables first; see the same section) |
| `npm run dev:mocks`                     | Web only, with MSW mocks (no API needed).                                                                                                                                                                                                                                                                                                                                                                                             |
| `npm run test:lifecycle` (in `web/`)    | The whole-tournament Playwright run on its own database, API, and production build (needs Docker and `python3`; about 5 minutes). See [docs/plans/lifecycle-e2e.md](docs/plans/lifecycle-e2e.md)                                                                                                                                                                                                                                      |
| `npm run db:tables` (in `api/`)         | Create the empty legacy, sign-in, score, and payout tables on an empty local database (refuses one that is not on this machine)                                                                                                                                                                                                                                                                                                       |
| `npm run check`                         | script tests, then lint, format check, typecheck, and tests in `api/` and `web/`                                                                                                                                                                                                                                                                                                                                                      |
| `npm run check:version`                 | Compare the version in `api/` and `web/` with `main` and the newest release tag                                                                                                                                                                                                                                                                                                                                                       |
| `npm run check:dist`                    | After a production web build (`npm --prefix web run build`), fail if `web/dist` holds the quick-login text or seeded passwords (D-104)                                                                                                                                                                                                                                                                                                |
| `npm run test:scripts`                  | Tests for the files in `scripts/`                                                                                                                                                                                                                                                                                                                                                                                                     |
| `npm run format:scripts`                | Prettier on `scripts/` (root `.prettierrc.json`; `check` also checks it)                                                                                                                                                                                                                                                                                                                                                              |

## Commands (run in `web/`; `api/` has the same names, minus e2e)

| Command                                 | Does                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run dev`                           | Dev server; `/api` goes to the API on port 3000 (prefix stripped) (`npm run dev:mocks` for mocks) |
| `npm run build`                         | Typecheck and build to `dist/`                                                                    |
| `npm run lint` / `npm run format:check` | ESLint / Prettier check                                                                           |
| `npm run typecheck`                     | `tsc -b`                                                                                          |
| `npm test`                              | Unit and integration tests                                                                        |
| `npm run test:coverage`                 | Same, with coverage. Fails under 80%                                                              |
| `npm run test:e2e`                      | Playwright against a built preview with mocks                                                     |
| `npm run test:mutation`                 | Stryker mutation tests                                                                            |
| `npm run test:mutation:fast`            | Same, with `--ignoreStatic` (skips slow static mutants; CI runs the full set)                     |

`api/` also has `npm run start` (run the build) and `npm run dev` (watch mode with `.env`). Before you say a task is done, run lint, typecheck, test, and `format:check` in each folder you changed. Run e2e when you change UI flow.

## Pinned versions and gotchas

- **Vitest stays on 4.x.** Stryker's vitest runner 10.0.0 runs zero tests per mutant on Vitest 5. Do not upgrade until Stryker supports it.
- **MSW 3** renamed `onUnhandledRequest` to `onUnhandledFrame`. Docs older than 2026 show the old name.
- **`eslint-plugin-jsx-a11y` override in `web/package.json`.** The plugin lists ESLint up to 9 as a peer, and we use 10. The override (`"eslint": "$eslint"`) lets it install. The rules work on 10. Remove the override once the plugin supports ESLint 10.
- **`qs` override in `web/package.json`.** Stryker 10.0.0 pulls `qs` 6.15.1 (through `typed-rest-client`), which has moderate advisories. The override forces 6.16.1. Dev-only. Remove it once a Stryker release ships a fixed `qs`, then run `npm audit`.
- **`@azure/monitor-opentelemetry-exporter` is pinned to `1.0.0-beta.46` (no caret).** Beta versions can change between releases, and this one is built on OpenTelemetry 2.x while the app uses the 3.x SDK. `api/src/telemetryExport.test.ts` sends a span through it to a local server. Bump the pin on purpose, run that test, and unpin once the exporter ships a stable release on OpenTelemetry 3.x.
- Node 24 (`web/.nvmrc`).
- Mocks are on when `VITE_USE_MOCKS=true` (`.env.mocks`, and the pull request build). `npm run dev` uses the real API through the Vite proxy; `npm run dev:mocks` and e2e use mocks. The production build has no mocks: it calls the API at `VITE_API_BASE_URL`, which the deploy sets from the `API_BASE_URL` variable.
- `base` in `vite.config.ts` comes from `WEB_BASE_PATH`: `/` locally, `/tournament-director/` in production (the site sits in a subfolder). Code that builds a full address must add `import.meta.env.BASE_URL` to the origin. `web/public/.htaccess` sends deep links to `index.html`; see [docs/deployment.md](docs/deployment.md).
- `public/mockServiceWorker.js` is generated by `npx msw init`. Do not edit it.

## API standards (summary)

Details in [docs/api-standards.md](docs/api-standards.md).

- Node 24 runs the `.ts` files directly. Erasable syntax only (no `enum`, no constructor parameter properties). Imports keep the `.ts` extension.
- Organize by feature: `src/features/<name>/` holds `routes.ts`, `repository.ts`, `types.ts`, and tests.
- `createApp(deps)` takes its dependencies as arguments. Only `server.ts` builds the real ones.
- Routes are thin: validate input with Zod, call the repository, send the result. Throw `HttpError` for expected failures. Errors are `{ message }`.
- Read `process.env` only in `config.ts`. ESLint enforces it.
- Log with the injected pino `logger`, never `console`. Fields first, then a constant message. In a handler use `requestLogger(res, logger)` so the line has the request id. `requestLogging` is the first middleware and sets the `x-request-id` header.
- Metrics: HTTP and Node runtime metrics are automatic. Custom ones are named `tournament_director.<area>.<thing>`; see the Metrics section of `docs/api-standards.md`.
- Throw a Zod error from a route and it becomes a 400. A crash or SIGTERM goes through `handleProcessEvents` (logs, flushes telemetry, exits).
- Access: every route group in `mountRoutes` declares `public`, `signedIn` (any signed-in user), or `{ permission }`, plus `apiKey: true` where the registration site may call it. Routes ask for a permission, never a role (D-96). Sign-in is Better Auth (`shared/auth/createAuth.ts`), built in `server.ts` and passed to `createApp`; only sign-in, sign-out, request-password-reset, and reset-password are open ([docs/better-auth-routes.md](docs/better-auth-routes.md) lists the rest). `identifyCaller` sets `callerOf(res)` (`apiKey`, `user`); roles turn into permissions in `roles.ts`. `AUTH_SECRET` and `AUTH_BASE_URL` are required. `API_KEY` is required; see [docs/api-standards.md](docs/api-standards.md#access-and-the-api-key).
- Rate limiting is per client IP (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SECONDS`). Set `TRUST_PROXY=1` on Azure or every caller shares one bucket.
- Telemetry is OpenTelemetry, loaded by `src/instrumentation.ts` before the app. Seq locally (`npm run services:up`), Application Insights in production; each turns on only when its env var is set.
- Database: Prisma over the legacy MariaDB (see [docs/api-standards.md](docs/api-standards.md#database)). `DATABASE_URL` is required. Run `npm run db:generate` in `api/` after `npm ci` (CI and deploy do). Wrap repository calls in `withDatabaseErrors`. Never run `prisma migrate`: schema changes are scripts in `api/prisma/` (D-314). Tests named `*.db.test.ts` need Docker (Testcontainers).
- Keep `helmet` and the CORS allow-list. The web `Tournament` shape and the API's must match.
- Test with Vitest + Supertest through `createApp`. Mutation: Stryker, same thresholds as `web/`.
- `qs` override in `api/package.json`: same Stryker advisory as `web/`. Remove it in both places together.
- `minimatch` and `glob` overrides in `api/package.json`: moderate advisories (GHSA-g3hv-75wg-m249, GHSA-3g3m-2fjr-6pw4) through Testcontainers' `archiver`, and Stryker and ESLint. Dev-only. Remove them once those packages ship fixed ranges, then run `npm audit`.
- `effect` override in `api/package.json`: Prisma's `@prisma/config` pins `effect` 3.20.0, which has a high ReDoS advisory (GHSA-7589-6fvf-x4pw) that fails the `npm audit --omit=dev` gate. The override forces 3.22.5 or newer. Remove it once Prisma ships a fixed pin, then run `npm audit`.
- `web/` keeps moderate `minimatch` advisories (dev-only). `eslint-plugin-jsx-a11y` needs `minimatch` 3 and breaks on 11, so an override cannot clear them. `npm audit fix --force` would downgrade ESLint to 4.0.0; do not run it. Revisit when the plugin supports ESLint 10.

## Code standards (summary)

Details in [docs/frontend-standards.md](docs/frontend-standards.md).

- TypeScript strict. No `any`, no non-null `!`. Use `unknown` and narrow. ESLint enforces both.
- Function components and hooks only. No class components.
- Organize by feature: `src/features/<name>/` holds components, hooks, API calls, types, and tests together. Shared code goes in `src/shared/` only when two features need it.
- Components render. Hooks hold logic. `api.ts` files call `fetch`. Do not call `fetch` inside components.
- Server data goes through TanStack Query. Do not copy it into `useState`.
- Name components `PascalCase.tsx`, hooks `useThing.ts`, everything else `camelCase.ts`. Put a test next to its file: `Thing.test.tsx`.
- No `useEffect` to derive state or fetch data. Compute during render or use a query.
- Avoid horizontal scroll anywhere, not only on the page. Reflow a wide table into stacked rows instead of scrolling it.
- Type a date in `DateInput` (`mm/dd/yyyy`, "/" moves on), never a native date box; a date and time is `DateTimeInput`. The form keeps `YYYY-MM-DD`.
- A form that sends data calls `useLeaveGuard(dirty)` and renders `LeaveDialog`, and wraps its save in `guard.whileSaving(...)`. This needs a data router: tests wrap a lone form in `DataRouter`, not `MemoryRouter`.
- Every list needs a stable `key` (an id, not the index).
- Handle loading, error, and empty states on every data view. Show loading with `Loading` (`src/shared/Loading.tsx`: dots, the words, and optional placeholder `rows`), not bare text.
- Use `Toast` (`src/shared/Toast.tsx`) for alerts and notices that are not part of a data view. Errors stay until dismissed. Pass `autoDismissMs` to make a toast close itself (success toasts do).
- Use semantic HTML and labels. Tests query by role and text, so the UI stays accessible. Target WCAG 2.2 AA. ESLint (`jsx-a11y`) and the axe e2e test enforce it.
- Style with CSS Modules and the tokens in `src/styles/tokens.css`. No raw colors in component CSS.
- No secrets in the frontend. Anything in `VITE_*` ships to every browser.

## Testing standards (summary)

Details in [docs/testing.md](docs/testing.md).

- Test behavior the user sees, not implementation. Query with `getByRole`, `getByText`, not test ids.
- Unit and integration: Vitest + Testing Library. Mock the network with MSW (`src/mocks/`), never mock `fetch` by hand.
- Test data comes from `src/mocks/data.ts` factories. Override only the fields a test cares about.
- E2E: Playwright in `web/e2e/`. Cover main user journeys only.
- Mutation: Stryker. Thresholds in `stryker.config.json` (break at 50, aim for 80). A surviving mutant means a missing or weak assertion. Fix the test, not the threshold.
- Write the test with the code. A change without a test is incomplete.

## Skills (`.claude/skills/`)

Claude loads a skill when the task matches its description. The rules above stay short; the skills hold examples and checklists.

| Skill                           | Use for                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `react-patterns`                | Components, hooks, TanStack Query, state, effects                                                        |
| `typescript-standards`          | Types, narrowing, unions, API typing                                                                     |
| `testing-patterns`              | Vitest, MSW, factories, Playwright, Stryker survivors                                                    |
| `composition-patterns`          | Component API design: compound components, boolean props. Third party (Vercel, MIT), see its `SOURCE.md` |
| `ui-standards`                  | Designing or styling any screen: tokens, CSS Modules, semantic HTML, forms, WCAG 2.2 AA checklist        |
| `api-patterns`                  | Routes, repositories, Zod validation, errors, config in `api/`                                           |
| `api-testing-patterns`          | Vitest + Supertest, factories, error-path tests, Stryker survivors in `api/`                             |
| `api-observability`             | What to log, which level, when to add a metric or span, what never to log, checking it in Seq            |
| `pull-request-prep`, `write-pr` | Review and describe a branch before the PR                                                               |
| `create-pr`                     | Same as `write-pr`, then create the PR with `gh` (asks for the base branch, assigns you, sets labels)    |
| `release-notes`                 | Write GitHub release notes for a new version (`release-notes.md`); marks 0.x as pre-release              |
| `migrate-feature`               | Port a legacy feature: settle questions, plan, build, record in `docs/requirements/`                     |

## Agents (`.claude/agents/`)

An agent is a separate Claude session with its own context, one job, and a short tool list. Skills hold the rules; agents apply them. Each agent preloads the skills it needs. The skills point to the agents.

| Agent                                | Job                                                   | Edits files?    |
| ------------------------------------ | ----------------------------------------------------- | --------------- |
| `react-reviewer`, `api-reviewer`     | Review a diff in `web/` or `api/` against the rules   | No              |
| `ui-designer`                        | Layout spec and states for a screen (optional mockup) | Mockups only    |
| `api-designer`                       | Routes, access labels, Zod shapes, status codes       | No              |
| `web-test-writer`, `api-test-writer` | Write tests in the repo's conventions                 | Test files only |
| `legacy-researcher`                  | Look up legacy rules, questions, decisions            | No              |

Use an agent for work that reads many files or needs a second opinion; use a skill for steps you do in the main session.

Read any third-party skill before you add it. A skill steers Claude like code. Do not add skills that fetch their instructions from a URL at run time.

## Git and CI

- Branch from `main`. Small, focused commits. Commit messages in the imperative.
- Never commit `.env*.local`, FTP credentials, or build output.
- Deploy secrets live in GitHub Actions secrets. Never in the repo.
- See [docs/deployment.md](docs/deployment.md) for the GreenGeeks plan.
- **Release candidates (from 2026-11-11).** The version is `1.0.0-rc.N`; we ship a new `rc.N` through this year's tournament and cut the first official `1.0.0` after it. `scripts/version.ts` reads `x.y.z-rc.N`: a candidate sorts below the final `x.y.z`, and a version equal to `main`'s passes until a tag closes it. Tag each one `v1.0.0-rc.N` and publish it as a pre-release.
- **Dependabot.** `.github/dependabot.yml` opens weekly update PRs for `api/`, `web/`, the root, and the workflows, and monthly ones for the Docker Compose images. It skips Vitest majors (Stryker pin), the pinned Azure exporter, and MariaDB major and minor bumps (production runs 11.4.7). Its PRs keep the version unchanged, so the `Version` job passes them.
- **Version.** One `x.y.z` (or `x.y.z-rc.N`) for the whole repo, kept the same in `api/package.json` and `web/package.json` (`npm version <x.y.z> --no-git-tag-version` in each folder). The API logs it as `service.version`. A release tag is `v<version>`. The `Version` job in the pull request workflow runs `scripts/checkVersion.ts`: a version at or below the newest release tag fails (after tagging 0.2.0, move to 0.3.0, or to 0.2.1 for a hotfix off `main`); a version below `main` or a mismatch between folders always fails; a version equal to `main`'s passes (only a tag closes a version). Run it locally with `npm run check:version`.

## Working with the owner

- Before you add a dependency, say why and what the alternative is.
- When a .NET concept has a Node/React twin, say so once (see [docs/dotnet-to-node.md](docs/dotnet-to-node.md)).
- Check library docs (Context7) before you use an API from memory. Major versions here are new and APIs change.
