# API standards

Express 5 + TypeScript in `api/`. The TypeScript rules in [frontend-standards.md](frontend-standards.md) apply here too (strict, no `any`, no `!`, `interface` for shapes).

## Structure

```
api/src/
  server.ts              entry: load config, wire dependencies, listen, shut down. No logic.
  app.ts                 createApp(deps): builds the Express app without starting it
  config.ts              the only file that reads process.env; validates with Zod
  features/<name>/       one folder per feature
    routes.ts            createXRouter(repository): HTTP in, HTTP out
    repository.ts        interface + implementation(s): the storage boundary
    types.ts             Zod schema and the type derived from it
    routes.test.ts       tests beside the code
  shared/                errors, middleware (two or more features use them)
  test/                  factories, testApp helper
```

## Rules

- **Run TypeScript directly.** Node 24 strips types, so `npm run dev` is `node --watch src/server.ts`. That limits TypeScript to erasable syntax: no `enum`, no constructor parameter properties. Imports keep the `.ts` extension. `npm run build` compiles to `dist/` for production.
- **Build, then start.** `createApp(deps)` takes its dependencies as arguments (config, repositories). `server.ts` is the only place that builds the real ones. Tests pass fakes. (.NET: the composition root, without a DI container.)
- **Routes are thin.** Parse input, call the repository, send the result. Storage code stays behind the repository interface so a database replaces the in-memory version without touching routes.
- **Validate input at the edge with Zod.** Body, params, query, and the environment. Never trust `req.body` as typed.
- **Errors:** throw `HttpError(status, message)` for expected failures (404, 409). Anything else becomes a 500 with a generic message; the cause goes to the log, never to the client. Express 5 forwards rejected promises from async handlers, so do not wrap handlers in try/catch.
- **Zod errors are 400s.** If a route's schema throws a `ZodError`, the error handler answers 400 with `Invalid request. field: reason; ...`. Use `schema.parse(...)` and let it throw; do not catch it.
- **Error body:** `{ "message": string }`, for every status. The web `api.ts` files check the status first.
- **Routes live at the root** (`/health`, `/v1/tournaments`), with no `/api` prefix: in production the API has its own host. In dev the Vite proxy takes `/api/...` and strips the prefix.
- **Every route group declares its access (D-27).** Mount routers with `mountRoutes(app, [{ path, access, router }])` in `app.ts`; do not call `app.use` for a router. `access` is `'public'` until authentication (0.3.0) adds more labels. A group with no label stops startup. The API enforces access; the web app only hides what a user cannot use.
- **Vendor routes.** `/v1/tournaments` and `/v1/tournaments/{id}` are read by the registration site (`API-03`, `API-04`). Their shapes change only after a vendor change doc (D-09).
- **Contract with `web/`.** The `Tournament` shape is in `api/src/features/tournaments/types.ts` and `web/src/features/tournaments/types.ts`. Change both together. (No shared package: two folders, no workspaces.)
- **Config:** every setting is an env var, validated at startup. The app refuses to start on bad config. Add new vars to `.env.example`.
- **Security defaults stay on:** `helmet()` and an explicit CORS allow-list (`CORS_ORIGIN`). No `*`.
- **No secrets in the repo.** Use env vars and GitHub Actions secrets.

## Telemetry

OpenTelemetry covers traces, metrics, and logs. Seq is the local backend; Application Insights is the production one. In .NET terms: `Microsoft.Extensions.Logging` plus the OpenTelemetry SDK, started in `Program.cs` before the host builds.

- `src/instrumentation.ts` loads first (`node --import ...`, set in the `dev` and `start` scripts). It reads config, registers the ESM hook, and starts the SDK. Express is CommonJS, so without the hook the Express spans do not appear.
- `src/telemetry.ts` builds the SDK. A destination turns telemetry on: `OTEL_EXPORTER_OTLP_ENDPOINT` (OTLP over HTTP/protobuf) and/or `APPLICATIONINSIGHTS_CONNECTION_STRING` (Azure Monitor). With neither set, nothing starts and nothing is sent. Tests and production without Application Insights run this way.
- `http` and Express are instrumented. `/health` is left out so probes do not fill the traces.
- `server.ts` calls `shutdownTelemetry()` on SIGTERM so buffered data goes out before exit.
- Local: `npm run services:up` at the repo root, copy `.env.example` to `.env`, then open Seq at http://localhost:15380. Mailpit catches the API's email (the invite): open its inbox at http://localhost:15325. `.env.example` points the `SMTP_*` settings at it, with `SMTP_ALLOW_SELF_SIGNED=true` because its certificate is self-signed; the API refuses that setting when `NODE_ENV=production`.
- `OTEL_EXPORTER_OTLP_HEADERS` (an API key, for example) is read by the exporters, not by `config.ts`.

## Logging

Use the `pino` logger. It is like an `ILogger<T>` that you pass in: `createApp({ config, logger, ... })` takes it, and only `server.ts` builds the real one (`createLogger(config)` in `src/shared/logger.ts`).

- Never use `console.log` or `console.error` in `src/`. Write `logger.info({ port }, 'API listening')`: fields first, then a short constant message. Put values in fields, not in the message, so Seq can filter on them.
- Output is JSON lines on stdout. With telemetry on, the same lines also go to Seq or Application Insights with `trace_id` and `span_id` attached (`@opentelemetry/instrumentation-pino`).
- `LOG_LEVEL` sets the level (default `info`). Tests use `silent`, or `createCapturedLogger()` from `src/test/logger.ts` to check what was logged.
- Do not log secrets, tokens, or whole request bodies.

## Metrics

Metrics ride the same OpenTelemetry pipeline as traces and logs, so Seq and App Insights get them with no extra setup.

- **Automatic:** `http.server.request.duration` (a histogram, so it also gives request counts by route and status) from the HTTP instrumentation, and Node runtime metrics (`nodejs.eventloop.*`, `v8js.gc.duration`, `v8js.memory.*`) from `RuntimeNodeInstrumentation`. Do not add a hand-made request counter or timer; they would duplicate these.
- **Custom:** `tournament_director.rate_limit.rejections` (a counter) counts 429s from the rate limiter. The HTTP metric cannot tell those from other 429s.
- To add one: take a `Meter` as a dependency (`createApp` has an optional `meter`, which defaults to the global one), create the instrument when the middleware or router is built, and name it `tournament_director.<area>.<thing>` with a unit. Keep attributes few and fixed. Never use an IP, id, or user as an attribute: each new value makes a new series.
- Test a metric with `MeterProvider` and `InMemoryMetricExporter` (see `shared/rateLimit.test.ts`).
- In Seq, query them with `from series`, for example `select sum(value) from series where @Metric = 'tournament_director.rate_limit.rejections'`.

## Request logging and request id

`requestLogging(logger)` in `src/shared/requestLogging.ts` is the first middleware in `createApp`.

- Every request gets an id: the caller's `x-request-id` if it is 1 to 64 plain characters (letters, digits, `_`, `.`, `-`), else a new UUID. The id goes back in the `x-request-id` response header (CORS exposes it, so the web app can read it), onto the trace span as `request.id`, and into every log line for the request.
- One `Request completed` line per request: `method`, `path` (no query string, which can hold personal data), `status`, `durationMs`, `aborted` (the caller hung up). The level is `error` for 5xx, `warn` for 4xx, `info` otherwise. `/health` logs at `debug`.
- In a handler, log with `requestLogger(res, logger)` so lines carry the `requestId`. Error bodies stay `{ message }`; the id travels in the header.
- To find one request in Seq, filter on `requestId = '...'`. The `TraceId` on each line opens the whole trace.

## Rate limiting

`createRateLimiter` in `src/shared/rateLimit.ts` (the `express-rate-limit` package) runs after CORS and before the routes.

- One fixed window per client IP: `RATE_LIMIT_MAX` requests (default 100) per `RATE_LIMIT_WINDOW_SECONDS` (default 60). Neba uses the same numbers. Over the limit, the client gets a 429 with `{ "message": "Too many requests. Try again later." }`, a `Retry-After` header, and `RateLimit` / `RateLimit-Policy` headers (IETF draft-7).
- `/health` never counts, so probes cannot lock out a deploy.
- **Two buckets (D-232).** The live score routes (`…/scores` and everything under it, including score entry, `…/scores/events`, and `…/skip`) count in their own bucket, `LIVE_RATE_LIMIT_MAX` (default 600) per window, because many phones share one venue address and a keeper saves often. A request counts in one bucket only, so live traffic never uses up the 100. `isLivePath` in `rateLimit.ts` names the paths; a new live route under `scores` joins the bucket by its path.
- **`TRUST_PROXY` must match the hosting.** It is the number of reverse proxies in front of the API. `0` locally. **`1` on Azure App Service**: set it as an application setting. At 0 on Azure, every caller looks like the same Azure address and shares one bucket. Too high lets a caller fake their address with a forged `X-Forwarded-For`.
- Azure can write the client as `ip:port`. The port changes on each connection, so `clientKey` strips it. IPv6 clients share a bucket per /56 network.
- Counts live in memory. That is right for one server (the free plan). If the API ever runs on more than one instance, each counts alone, so move the counts to a shared store (Redis).
- Neba also gives signed-in users their own higher limit. We have no sign-in yet; add that when we do.

## Caching

Until they move to a stream (D-222), the live public pages poll every 15 seconds, so each route that serves them keeps its answer for `LIVE_CACHE_MS` (5 seconds, `src/shared/ttlCache.ts`) with `createTtlCache`. Ten open tabs then cost one database pass per window, and the delay is shorter than the poll, so viewers do not see it. It holds for a live squad too, so we do not wait for a squad to be complete.

- Cached today: squad and sweeper results and scores (keyed by tournament and session), and the at-large, seeding, and super sweeper routes (keyed by tournament).
- Cache only routes that are public for good (D-70, D-74, D-85): every viewer gets the same answer. Do not cache a route that is signed-in only or differs by user, such as the lane pages, recap sheets, and registrations. If a cached route ever needs sign-in, key the cache by user or drop it.
- A failed call is not kept, so the next poll tries again. The router takes `cacheMs` as a last argument; tests pass `0` to turn it off.

## Live updates (SSE)

A page that must show other people's changes listens to a server-sent event stream of one squad or sweeper (D-217). The lane page was the first. The Scores tab and score entry now listen too (D-232); Results follow in their own slice (D-222, D-233, Q-41). The pattern:

- **The hub.** `shared/events/sessionEvents.ts` (`createSessionEvents`) keeps who watches which session, in the Node process. `publish(sessionId, kind)` tells every watcher. `kind` is `lanes`, `entries`, or `scores` (a score saved or cleared, D-232). A message is a signal, never data: `event: changed`, `data: {"kind","version"}` (D-218). The page refetches. There is no history and no replay: a page that reconnects refetches once.
- **The route.** `shared/events/sseRoute.ts` (`createSessionEventsRouter`) opens the stream. It checks the session first, so an unknown id is a plain JSON `404` and never a stream. It sets `text/event-stream`, `no-cache, no-transform`, and `x-accel-buffering: no`; sends `retry: 5000`; and sends `: heartbeat` every 25 s, since Azure closes a quiet connection near 4 minutes. It leaves no stream behind when the browser goes during the check. The .NET twin is a SignalR hub group, with SSE in place of the socket.
- **Who may listen.** The route group declares its own access, like any route (`lanes.read` for the lane stream). The score stream (`…/scores/events`, `scores`) is `public` (D-232, D-70): it reuses the lane stream's router, so it checks the same session and sends the same messages. Results will be `public` too.
- **Who publishes.** The route that wrote, after the commit, and only when something changed: the lane move (`moveRoutes.ts`), a score save or clear (`scoreRoutes.ts`, which first drops the cached public scores page, D-232), the squad and sweeper `PATCH` and `complete`, and every registration write (the `createPublishingRegistrationWriter` wrapper in `app.ts`, which reads the sessions before the write and publishes to each one after it, so the vendor routes need no change). A failed publish is logged and never fails the write.
- **Shutdown.** An open stream never finishes, so `handleProcessEvents` calls `closeStreams` (the hub's `closeAll`) before it waits for the server. Without that, a deploy would hit the 10 s limit and exit with code 1.
- **Limits.** 500 open streams (`MAX_STREAMS`), then `503`. One instance only (D-224).
- **Telemetry.** The stream's request span is skipped (`isQuietPath`): it lasts hours. The gauge `tournament_director.events.connections` and the counter `tournament_director.events.published` (by `kind`) show use. Logs are at `debug`, with ids and counts and never a name.
- **Tests.** Supertest cannot read a stream that never ends, so `sseRoute.test.ts` opens a real local server and reads with `fetch`. Test a publisher with `recordingEvents()` (`test/recordingEvents.ts`).

## Process lifecycle and health

`handleProcessEvents` in `src/shared/processEvents.ts` is called from `server.ts`.

- SIGINT and SIGTERM (a deploy): log, stop taking connections, let open requests finish, send buffered telemetry, exit 0. If that takes over 10 seconds, log and exit 1.
- `uncaughtException` and `unhandledRejection`: log at `fatal` (so it reaches Seq and App Insights), send telemetry, exit 1. Azure restarts the app. Do not try to carry on after one.
- `GET /health` answers `{ "status": "ok" }` and is the liveness check. It is outside the rate limit and the traces, and its request line logs at `debug`.
- **Readiness.** `GET /ready` runs `SELECT 1` and answers 503 `{ message }` while the database is down (D-32). `/health` stays plain liveness and never touches the database, so an outage does not restart the app. Neba's twin: `/alive` and `/health`.

## Database

The legacy MariaDB database, read through Prisma (D-30). The .NET twin: `PrismaClient` is the `DbContext`, `schema.prisma` the model.

- `DATABASE_URL` is required: `mariadb://USER:PASSWORD@HOST:3306/DATABASE`. Add `?ssl=true` for TLS; the host name must match the certificate. It holds the password: never log it. Without it the API does not start (D-33).
- `api/prisma/schema.prisma` models only the tables a shipped feature reads, with `@map` for legacy names. The client is generated into `src/generated/` (ignored by git). Run `npm run db:generate` after `npm ci` and after any schema change. `npm ci --ignore-scripts` skips Prisma's own generate step, and CI and deploy call it. Never run `prisma migrate` here: WinForms owns the schema until it is sunset.
- Only `server.ts` builds the client (`createDatabaseClient`). Repositories receive it, as with the other real dependencies. The client adds 2 second connection timeouts to the URL, or a down database holds each request for 20 seconds.
- A repository wraps each call in `withDatabaseErrors(logger, ...)`. An unreachable database becomes a 503 `Database unavailable` with the cause in the log; any other database error is a 500 (a missing table is a setup fault, not an outage).
- **Serializable writes retry.** A writer that reads, then writes, in one serializable transaction can lose to a rival write: MariaDB rolls one back and Prisma reports `P2034`. Wrap the transaction in `withRetry` (`src/shared/serializableRetry.ts`, three tries, one after another) so the retry sees the rival's row. The tournament and division writers use it.
- A row that breaks the API shape is skipped and logged on a list; a single-row read of it answers 500 (D-31). `toTournament` in `tournamentRow.ts` does the mapping and is a pure function.
- Local: `npm run services:up` starts MariaDB 11.4.7 (host port 15306). You create the tables from `docs/migration/database.md`; `npm run db:seed` (root or `api/`) adds sample tournaments, divisions, squads, sweepers, registrations with their bowlers, and scores.
- **Users from the command line (D-101).** `npm run users:create-admin` (root or `api/`) asks for an email, a name, and a password (hidden, typed twice, 12 to 128 characters) and makes an `admin`. It needs a real terminal (it refuses piped input) and only `DATABASE_URL`: the script's secret is its own, and a user it makes signs in to the real API as usual. It prints `Database: host:port/name` first, so check that line before you answer. If users exist it says how many and asks before adding another. Never prints the password.
  - **Production, once:** run it on your machine against the production database without leaving the URL in shell history: `read -s DATABASE_URL; export DATABASE_URL; npm run users:create-admin; unset DATABASE_URL` (paste the `mariadb://…?ssl=true` URL at the silent prompt). A `DATABASE_URL` already in the environment wins over `api/.env`.
  - **Local test users.** `npm run db:seed` also adds one user per role, to a local database only (it skips them when `DATABASE_URL` is not `localhost`, `127.0.0.1`, or `[::1]`), because their passwords are in the repo. A user that exists is left alone. It refuses (and says so) when the table holds anyone who is not one of the three, or the database holds a tournament that is not a sample, because a tunnel to production looks local and the passwords are public; `npm run db:seed -- --force-users` adds them anyway, for a local database where you made your own user too.

    | Email                     | Password                   | Role        |
    | ------------------------- | -------------------------- | ----------- |
    | `admin@example.com`       | `adminP4sswordLocal`       | admin       |
    | `director@example.com`    | `directorP4sswordLocal`    | director    |
    | `scorekeeper@example.com` | `scoreKeeperP4sswordLocal` | scoreKeeper |

    The local `/login` page will have a one-click button for each (D-104).
- **Skip table (D-235).** `api/prisma/score-tables.sql` creates `SessionSkip` (`SessionId`, `Skip`): the skip pattern of a squad or sweeper, `staggered` or `same`. No row means staggered. With the auth tables it is the only table we add to the legacy database; WinForms never reads it. `SessionId` is the `Id` of a `Squads` row, with no foreign key. Run the file once on each database, **before the release that ships it**; running it again is safe. Tests run the same file (`src/test/scoreSchema.ts`). Routes: `GET` and `PUT /v1/tournaments/{id}/squads/{sessionId}/skip` (and the sweeper twin), `lanes.read` and `scores.write`.
- **DNF table (D-248).** The same file also creates `SessionDnf` (`SessionId`, `RegistrationId`): a bowler the keeper flagged "did not finish" in an open squad or sweeper, whom the full-game count leaves out. No row means not flagged; a saved score for the bowler deletes the row (D-250). Same rules as the skip table: no foreign keys, WinForms never reads it, run the file before the release that ships it. Routes: `PUT` and `DELETE /v1/tournaments/{id}/squads/{sessionId}/scores/{registrationId}/dnf` (and the sweeper twin), `scores.write`.
- **Score entry routes (SCR-19, SCR-22, D-228, D-234).** Web only, none of them vendor-visible. `GET …/scores/games` (`scores.write`) lists the bowlers by the lane they bowl each game, built from the lane page, the stored scores, and the stored skip (`gamesView.ts`, with the cross of `recapSheets/cross.ts`). `PUT` and `DELETE …/scores/{registrationId}/{game}` (`scores.write`, no API key) save and clear one score; the rules are the pure `scorePlan.ts` (1 to 300; a game from 1 to the session's games; earlier empty games saved as 0; a clear only from the last game back; nothing on a complete session or tournament). The Prisma writer reads and writes in one serializable transaction with retry. A change drops the public page's cache and publishes `scores`. All of `…/scores…` and `…/skip` count in the live rate-limit bucket (see Rate limiting).
- **Auth tables (D-100).** `api/prisma/auth-tables.sql` creates the four sign-in tables Better Auth uses (`user`, `session`, `account`, `verification`). They are the only tables we add to the legacy database. Run the file once on each database with any MariaDB client; running it again is safe. Locally: `docker exec -i tournament-director-db mariadb -uroot -p<password> <database> < api/prisma/auth-tables.sql`. The Prisma models for them sit at the end of `schema.prisma`; never edit their names or columns by hand, because Better Auth expects these. Tests run the same file, so a broken script fails there first.
- Tests: files named `*.db.test.ts` run in the `db` Vitest project against a real MariaDB that Testcontainers starts once per run (needs Docker). `resetDatabase` empties every table before each test; files run one at a time because they share the database. Everything else runs in the `unit` project with the in-memory repository. Stryker runs `unit` only (`vitest.stryker.config.ts`), and `prismaRepository.ts`, `seedTournaments.ts`, and `seedDivisions.ts` are outside its `mutate` list.

## Access and the API key

Every route group declares who may call it (D-27, D-96). The .NET twin: `identifyCaller` is an authentication handler, and the access label is `[AllowAnonymous]` or `[Authorize(Policy = "...")]`, where the policy can also accept the API key scheme.

- `AUTH_SECRET` (required, 32 characters or more) signs the sign-in cookie, and `AUTH_BASE_URL` (required) is the API's own address, scheme and host with no path (D-98, D-99). A `https` address marks the cookie `Secure`. The secret is a different value from `API_KEY`; never log either. Local values are in `.env.example`. CORS sends `Access-Control-Allow-Credentials` so the browser may send the cookie to an allowed origin.
- `API_KEY` is required, 32 characters or more (D-95). The registration site sends it in `x-api-key`. It is a secret: never log it. Without it the API does not start. Local runs use `api_localKey_thisIsForTestingOnly` (`.env.example`); never use that value anywhere else.
- `identifyCaller` runs before the routes and works out the caller once per request: `apiKey` for a matching key, `anonymous` otherwise. It compares HMAC-SHA-256 digests (random per-process key) in constant time. Read the caller in a handler with `callerOf(res)`.
- Labels in `mountRoutes`: `public` (anyone), `signedIn` (any signed-in user, even with no role; the API key does not count), `{ permission }` (a signed-in user who holds it), or `{ permission, apiKey: true }` (the same, plus a valid API key with no permission check). Add `apiKey: true` only to routes the registration site needs. A protected group answers 401 `Missing or invalid credentials.` with no caller, and 403 to the key on a route that does not accept it or to a user without the permission. A wrong key on a public route is ignored.
- Routes ask for a permission, never a role. Permissions live in `src/shared/auth/permissions.ts`. The API key holds none; routes opt in to it. Roles arrive with sign-in (stage 2, D-94).
- The request line carries `callerType`, and the trace span `caller.type`. `tournament_director.auth.failures` counts 401s and 403s and failed sign-ins by `reason` (`missing_credentials`, `invalid_key`, `forbidden`, `bad_sign_in`, `sign_in_throttled`).
- **Who is calling.** `identifyCaller` (`shared/auth/caller.ts`) runs before every route and sets `callerOf(res)`: `{ type, apiKey, user }`, where `type` is `anonymous`, `apiKey`, `user`, or `apiKeyAndUser`, and `user` holds the id, email, name, roles, and permissions (from `roles.ts`; never the database). A request with no session cookie costs no database read. The access check lets a user in when their permissions include the route's; the API key passes only a group marked `apiKey: true`; a wrong key beside an allowed sign-in is ignored, as on a public route. If the session lookup fails (the database is down), a protected route answers 503 `Sign-in could not be checked. Try again.`, not 401, and the request line carries `callerType` and `userId` (never the email). A user with `banned` set counts as signed out on the next request.
- **Sign-in (Better Auth, D-98).** `createAuth` (`shared/auth/createAuth.ts`) is built in `server.ts` and passed to `createApp` as `auth`, like the repositories; tests use `createTestAuth` (a memory database, no Docker). `features/auth/routes.ts` opens only `POST /v1/auth/sign-in/email`, `POST /v1/auth/sign-out`, `POST /v1/auth/request-password-reset` (forgot password), and `POST /v1/auth/reset-password` (the set-password call), each throttled apart from sign-in; any other Better Auth path (sign-up, change email, admin calls) answers 404 until a feature opens it on purpose; [better-auth-routes.md](better-auth-routes.md) lists them all and when we might open each. Mount it before any `express.json()`: Better Auth reads the body itself. Its own rate limit and telemetry are off. Our limiter allows 10 failed sign-ins per address per 15 minutes (`signInLimit.ts`; a success does not count), using the address Express works out from `TRUST_PROXY`. Its origin and CSRF checks are on in every environment: a sign-in, or any request that carries the cookie, from a page not in `CORS_ORIGIN` is a 403. Better Auth's `createUser` does not check the minimum password length (12); callers check it with `minPasswordLength`. The auth router runs Better Auth inside `withDatabaseErrors`, so an unreachable database is a 503 `Database unavailable` and any other unexpected error is a generic 500 through our error handler (`onAPIError: { throw: true }` makes Better Auth rethrow instead of printing its own stack to the console). A hook drops `token` from the sign-in answer. Request log paths pass through `redactSecrets`, which hides a reset-link token. Roles are `scoreKeeper`, `director`, and `admin` (`roles.ts`); a name outside them is refused.
- `GET /v1/me` is public and tests a key: 200 `{ apiKey: true, user: null }` for a valid key, 200 `{ apiKey: false, user: null }` with none, and 401 `Invalid API key.` for a wrong one, with `Cache-Control: no-store`. It is the one public route that does not ignore a wrong key. `user` fills in with sign-in (stage 2).

## Encryption

`shared/encryption/encryption.ts` reads and writes the legacy desk app's SSN format exactly (D-262; rules `SEC-03` to `SEC-08` in [security.md](migration/security.md)). Full review: [security-review-encryption.md](security-review-encryption.md).

- `createEncryption(config.encryptionKey)` gives `encrypt`, `decrypt`, and `valuesMatch`. All three return promises: the key work (PBKDF2, 100,000 rounds) runs on Node's thread pool and does not block the event loop. Decrypt a list with `Promise.all`.
- `ENCRYPTION_KEY` is required, any length, and used exactly as given (D-263). It is the same text as the desk app's `EncryptionKey`. Local runs use a fake value from `.env.example`; never use it anywhere else. Never log it.
- A failed decrypt rejects with `DecryptionError`, whose message holds no data (D-264). CBC has no integrity check, so a wrong key can sometimes return garbage: check that a result is 9 digits before you trust it.
- Nothing in the app calls it yet. The first SSN route passes it in through `createApp(deps)`.
- The logger redacts `ssn`, `socialSecurityNumber`, and `encryptionKey` at the top level of a logged object and one level down (D-265).
- `npm run encryption:check` (in `api/`) tries the key on every stored SSN in the database `DATABASE_URL` names and prints counts only (D-266). For production data, set `DATABASE_URL` and `ENCRYPTION_KEY` in your shell and run it from your machine.

## Not built yet

- Sign-in (JWT) and roles (stage 2, D-94)
- Write routes (POST, PUT, DELETE) and `express.json()`
