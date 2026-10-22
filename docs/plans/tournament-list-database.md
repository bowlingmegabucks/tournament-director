# Plan: tournament list on the legacy database

Branch: `tournamentList`. Delete this file when the work is done.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| TRN-11 | In | List reads the `Tournaments` table instead of demo data |
| TRN-15, API-03, API-04 | In | Same repository serves `GET /v1/tournaments/{id}` |
| TRN-13, TRN-14 | Already done | The web app groups and sorts; no change |
| TRN-01 to TRN-08 | Later | Create form: after sign-in (0.3.0) and commands (0.4.0) |
| TRN-09 | Later | Applies on save (D-13). This run only reads, and it does not read or expose the ratio |
| TRN-10 | Later | Edit, delete, complete (Q-03, D-12, D-15) |
| TRN-12 | Later | Squad overrides: with squads |

## Decisions used

- D-09: the vendor shapes of `API-03` and `API-04` do not change.
- D-25: the detail response has no division, squad, or sweeper arrays yet.
- D-26: this is the database run.
- D-27: every route declares its access. `/ready` is `public`.
- D-29: remove the Check API button.
- D-30: Prisma, hand-written schema, `Tournaments` only, no `prisma migrate`.
- D-31: a bad row is skipped and logged on the list; the detail route returns 500.
- D-32: outage gives 503; `GET /ready` pings the database; `/health` stays liveness.
- D-33: `DATABASE_URL` is required at startup.
- D-34: Compose `mariadb:11.4.7`, database `bowling_megabucks`, user `megabucks`; the owner creates the tables; `npm run db:seed`.
- D-35, D-36: repository tests use Testcontainers, one container per run, truncate between tests.
- Q-26 (open): the REG-01 constraint. Not part of this run.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| TRN-11 | Lists every row; a bad row cannot occur because the form validates | Skips a row that breaks the vendor shape and logs a warning with its id | D-31 |
| TRN-11 | A database error crashes the screen | 503 `{ message: "Database unavailable" }`; the cause goes to the log | D-32 |

## API

| Route | Response | Errors | Vendor-visible |
| --- | --- | --- | --- |
| `GET /v1/tournaments` | `200 { tournaments: [...] }`, unchanged shape | `503` database down | Yes. Shape unchanged. A new 503 only when the database is down |
| `GET /v1/tournaments/{id}` | `200 { tournament }`, unchanged | `400` not a UUID; `404`; `500` stored row breaks the shape (D-31); `503` | Yes. Same |
| `GET /ready` (new) | `200 { status: "ok" }` after a `SELECT 1` | `503 { message }` | No. Not part of the vendor contract |
| `GET /health` | unchanged | | No |

How a stored row becomes a `Tournament`:

| Column | Becomes | Note |
| --- | --- | --- |
| `Id` | `id` | `char(36)` |
| `Name` | `name` | |
| `Start`, `End` | `startDate`, `endDate` | Midnight `datetime(6)` to `YYYY-MM-DD` (`toISOString().slice(0, 10)`) |
| `EntryFee` | `entryFee` | Prisma `Decimal` to number |
| `BowlingCenter` | `bowlingCenter` | |

The pure mapping function checks the result against `tournamentSchema` (`safeParse`). A failure is the "bad row" of D-31. A connection failure becomes `HttpError(503, "Database unavailable")` in the repository; the existing error handler already sends `{ message }`.

Files (the Node twin of an EF Core `DbContext` is the `PrismaClient`):

- `api/prisma/schema.prisma`: `Tournaments` model only. Map the table and the columns the repository reads. `SuperSweperCashRatio` and the other columns we do not read stay out until a feature needs them (D-30).
- `api/prisma.config.ts` if Prisma 7 needs it to run `generate`. Checked in step 1.
- `api/src/features/tournaments/tournamentRow.ts`: pure `toTournament(row)`.
- `api/src/features/tournaments/prismaRepository.ts`: `createPrismaTournamentRepository(client, logger)`.
- `api/src/shared/readyRoutes.ts`: `createReadyRouter(ping)`.
- `api/src/shared/database.ts`: builds the `PrismaClient` with `@prisma/adapter-mariadb`, plus `pingDatabase`. `server.ts` is the only caller (as with the other real dependencies). It disconnects in the shutdown flush.
- `AppDependencies` gains `checkDatabase: () => Promise<void>`. `createTestApp` supplies a resolved default.
- `config.ts` gains `databaseUrl`: required, must start with `mariadb://` or `mysql://`. Read from `DATABASE_URL`.
- Delete `demoRepository.ts` and its test. D-33 allows no fallback. The in-memory repository stays for route tests.
- `api/src/db/seed.ts`: `npm run db:seed`. Inserts four tournaments with fixed ids, in the shape of the old demo data, relative to today. Safe to run twice (upsert). Excluded from coverage and mutation.

## Web

Only removal (D-29). No mockups: nothing new on screen.

- Remove the Check API button, its System section on Home, and `web/src/features/health/` (`HealthCheckButton`, `useHealthCheck`, `api`, `forcedFailure`, with their tests).
- Update `HomePage.test.tsx`, `web/e2e/tournaments.spec.ts`, and `web/e2e/accessibility.spec.ts` to match.
- Keep the MSW `/health` handler only if something else uses it; otherwise remove it. Mocks keep serving the tournament routes for `dev:mocks` and e2e.
- Loading, error, and empty states on the list already exist; the 503 appears as the existing error state with Try again.

## Data

- Table: legacy `Tournaments`, unchanged. No schema change, no migration (D-30).
- Local: Compose service `database` in `docker-compose.yml`.
  - Image `mariadb:11.4.7`; database `bowling_megabucks`; user `megabucks`; password `bowling4money` (MariaDB sets no password rule); random root password.
  - Host port `15306` (the repo uses 15xxx ports); named volume `tournament-director-db-data`; a `healthcheck.sh` health check.
  - `api/.env.example`: `DATABASE_URL=mariadb://megabucks:bowling4money@localhost:15306/bowling_megabucks`.
- You create the local `Tournaments` table from `database.md`. Tests do not depend on it.
- Production: App Service setting `DATABASE_URL` (done). The GreenGeeks database accepts connections from all IPs, so no allowlist is needed. That puts the weight on a strong password and TLS: confirm both, and document the URL's TLS option in `docs/deployment.md` (step 12; check the adapter's option name in the Prisma docs at step 6).

New dependencies (and the alternative for each):

| Package | Why | Alternative |
| --- | --- | --- |
| `prisma` (dev) | The `generate` command (D-30) | None; comes with Prisma |
| `@prisma/client` | Typed queries | `mariadb` driver with raw SQL (rejected in Phase 2) |
| `@prisma/adapter-mariadb` | Prisma 7 needs a driver adapter for MariaDB | None |
| `testcontainers`, `@testcontainers/mariadb` (dev) | Real database in tests (D-35) | Compose database (shares dev data) |

## Tests

| Rule | Test |
| --- | --- |
| TRN-11 maps a stored row to the vendor shape | `tournamentRow.test.ts`: "converts midnight start and end to dates, a decimal fee to a number (TRN-11)" |
| TRN-11 bad row | `tournamentRow.test.ts`: "rejects a row with an empty name, end before start, or fee 0 (D-31)" |
| TRN-11 list from a real database | `prismaRepository.db.test.ts`: "lists every stored tournament with no filter (TRN-11)"; "skips a bad row and logs its id (D-31)" |
| TRN-15 detail | `prismaRepository.db.test.ts`: "gets one tournament; unknown id gives undefined (TRN-15)"; "throws for a bad row (D-31)" |
| Outage on the repository | `prismaRepository.db.test.ts`: "turns a refused connection into a 503 (D-32)" (client pointed at a closed port) |
| Outage on the routes | `routes.test.ts`: "503 when the repository says the database is down (D-32)"; "500 when a stored row is bad (D-31)" |
| `/ready` | `readyRoutes.test.ts`: "200 when the ping works"; "503 when it fails (D-32)"; `app.test.ts`: "/ready is mounted public (D-27)" |
| Startup config | `config.test.ts`: "fails without DATABASE_URL"; "rejects a URL with another scheme (D-33)" |
| Seed | `seed.db.test.ts`: "inserts the sample rows twice without error" |
| Check API gone | `HomePage.test.tsx`: "has no Check API button (D-29)"; e2e specs updated |

Test setup (D-36):

- Vitest gets two projects: `unit` (everything but `*.db.test.ts`) and `db` (`*.db.test.ts`, with `globalSetup`). Only `db` starts a container, so route tests stay fast.
- `src/test/dbGlobalSetup.ts` starts `MariaDbContainer("mariadb:11.4.7")`, creates the `Tournaments` table from `database.md`, and exposes the URL with `provide`.
- `src/test/resetDatabase.ts` lists tables from `information_schema`, turns off foreign key checks, truncates each, turns checks on. Called in `beforeEach`.
- Mutation: the mapping lives in the pure `toTournament`, which Stryker covers through the `unit` project. `prismaRepository.ts`, `database.ts`, `seed.ts` are excluded from `mutate`, and Stryker runs only the `unit` project. This avoids a database per worker.
- Coverage counts both projects. CI needs Docker (included on `ubuntu-latest`).

## Steps

Each step ends green (lint, typecheck, tests, `format:check`).

1. **Spike Prisma.** Add the packages, write `schema.prisma`, run `generate`, and prove the generated TypeScript loads under Node's type stripping (erasable syntax, `.ts` import extensions) and compiles with `tsc -p tsconfig.build.json` into `dist/`. Prisma's generator options may need adjusting (output path, import extension). If it cannot work with `erasableSyntaxOnly`, stop and tell you. Update lint, prettier, coverage, and Stryker ignores for the generated folder. Add `db:generate` to `package.json`.
2. **Config.** `DATABASE_URL` in `config.ts`, tests, `.env.example`, `createConfig` factory.
3. **Mapping.** `tournamentRow.ts` and its tests.
4. **Compose.** Add the `database` service. Update the `docker-compose.yml` header comment. You create the table; I test with my own copy of the schema.
5. **Test harness.** Vitest projects, `dbGlobalSetup`, `resetDatabase`.
6. **Repository.** `prismaRepository.ts` with the `.db.test.ts` file, including the 503 mapping.
7. **Ready route.** `readyRoutes.ts`, `database.ts`, `AppDependencies.checkDatabase`, `app.ts`, `createTestApp`, and route tests for 503 and bad-row 500.
8. **Wire the server.** `server.ts` builds the client, passes the repository and ping, disconnects on shutdown. Delete the demo repository.
9. **Seed.** `db:seed` script and test. Add `npm run db:seed` to the root shortcuts.
10. **Web.** Remove Check API and the health feature; update tests and e2e.
11. **CI and deploy.** Run `npm run db:generate` after `npm ci --ignore-scripts` in the pull request, main, mutation, and deploy workflows (the flag skips install scripts, so Prisma will not generate on its own). Confirm the deploy staging folder gets the runtime Prisma packages.
12. **Docs.** `docs/api-standards.md` (database and readiness), `docs/deployment.md` (`DATABASE_URL`, TLS, strong password), CLAUDE.md (stack and commands), `docs/v1-requirements.md` (check items).
13. **Full check.** `npm run check`, `npm run test:e2e` in `web/`, `npm run test:mutation` in `api/`.

## Not doing

- Creating the local table or any migration (you create it; D-30).
- Sorting or filtering in the API (TRN-11).
- The REG-01 database constraint (Q-26).
- Reading divisions, squads, or sweepers; the detail route still has no arrays (D-25).
- Renaming `SuperSweperCashRatio` (before 1.0.0, issue #101). The column is not read yet.
- A demo-data fallback (D-33).
- A dev container. Deferred by the owner on 2026-10-22: Compose already starts the database, and Testcontainers inside a dev container needs the Docker socket and `TESTCONTAINERS_HOST_OVERRIDE`. Raise it again when a second contributor joins or the owner wants a sandbox for Claude.
