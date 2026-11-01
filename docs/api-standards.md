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
- Local: `npm run services:up` at the repo root, copy `.env.example` to `.env`, then open Seq at http://localhost:15380.
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
- **`TRUST_PROXY` must match the hosting.** It is the number of reverse proxies in front of the API. `0` locally. **`1` on Azure App Service**: set it as an application setting. At 0 on Azure, every caller looks like the same Azure address and shares one bucket. Too high lets a caller fake their address with a forged `X-Forwarded-For`.
- Azure can write the client as `ip:port`. The port changes on each connection, so `clientKey` strips it. IPv6 clients share a bucket per /56 network.
- Counts live in memory. That is right for one server (the free plan). If the API ever runs on more than one instance, each counts alone, so move the counts to a shared store (Redis).
- Neba also gives signed-in users their own higher limit. We have no sign-in yet; add that when we do.

## Caching

The live public pages poll every 15 seconds, so each route that serves them keeps its answer for `LIVE_CACHE_MS` (5 seconds, `src/shared/ttlCache.ts`) with `createTtlCache`. Ten open tabs then cost one database pass per window, and the delay is shorter than the poll, so viewers do not see it. It holds for a live squad too, so we do not wait for a squad to be complete.

- Cached today: squad and sweeper results and scores (keyed by tournament and session), and the at-large, seeding, and super sweeper routes (keyed by tournament).
- Cache only routes that are public for good (D-70, D-74, D-85): every viewer gets the same answer. Do not cache a route that is signed-in only or differs by user, such as the lane pages, recap sheets, and registrations. If a cached route ever needs sign-in, key the cache by user or drop it.
- A failed call is not kept, so the next poll tries again. The router takes `cacheMs` as a last argument; tests pass `0` to turn it off.

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
- A row that breaks the API shape is skipped and logged on a list; a single-row read of it answers 500 (D-31). `toTournament` in `tournamentRow.ts` does the mapping and is a pure function.
- Local: `npm run services:up` starts MariaDB 11.4.7 (host port 15306). You create the tables from `docs/migration/database.md`; `npm run db:seed` (root or `api/`) adds sample tournaments, divisions, squads, sweepers, registrations with their bowlers, and scores.
- **Auth tables (D-100).** `api/prisma/auth-tables.sql` creates the four sign-in tables Better Auth uses (`user`, `session`, `account`, `verification`). They are the only tables we add to the legacy database. Run the file once on each database with any MariaDB client; running it again is safe. Locally: `docker exec -i tournament-director-db mariadb -uroot -p<password> <database> < api/prisma/auth-tables.sql`. The Prisma models for them sit at the end of `schema.prisma`; never edit their names or columns by hand, because Better Auth expects these. Tests run the same file, so a broken script fails there first.
- Tests: files named `*.db.test.ts` run in the `db` Vitest project against a real MariaDB that Testcontainers starts once per run (needs Docker). `resetDatabase` empties every table before each test; files run one at a time because they share the database. Everything else runs in the `unit` project with the in-memory repository. Stryker runs `unit` only (`vitest.stryker.config.ts`), and `prismaRepository.ts`, `seedTournaments.ts`, and `seedDivisions.ts` are outside its `mutate` list.

## Access and the API key

Every route group declares who may call it (D-27, D-96). The .NET twin: `identifyCaller` is an authentication handler, and the access label is `[AllowAnonymous]` or `[Authorize(Policy = "...")]`, where the policy can also accept the API key scheme.

- `AUTH_SECRET` (required, 32 characters or more) signs the sign-in cookie, and `AUTH_BASE_URL` (required) is the API's own address, scheme and host with no path (D-98, D-99). A `https` address marks the cookie `Secure`. The secret is a different value from `API_KEY`; never log either. Local values are in `.env.example`. CORS sends `Access-Control-Allow-Credentials` so the browser may send the cookie to an allowed origin.
- `API_KEY` is required, 32 characters or more (D-95). The registration site sends it in `x-api-key`. It is a secret: never log it. Without it the API does not start. Local runs use `api_localKey_thisIsForTestingOnly` (`.env.example`); never use that value anywhere else.
- `identifyCaller` runs before the routes and works out the caller once per request: `apiKey` for a matching key, `anonymous` otherwise. It compares HMAC-SHA-256 digests (random per-process key) in constant time. Read the caller in a handler with `callerOf(res)`.
- Labels in `mountRoutes`: `public` (anyone), `{ permission }` (a signed-in user who holds it), or `{ permission, apiKey: true }` (the same, plus a valid API key with no permission check). Add `apiKey: true` only to routes the registration site needs. A protected group answers 401 `Missing or invalid credentials.` with no caller, and 403 to the key on a route that does not accept it or to a user without the permission. A wrong key on a public route is ignored.
- Routes ask for a permission, never a role. Permissions live in `src/shared/auth/permissions.ts`. The API key holds none; routes opt in to it. Roles arrive with sign-in (stage 2, D-94).
- The request line carries `callerType`, and the trace span `caller.type`. `tournament_director.auth.failures` counts 401s and 403s by `reason` (`missing_credentials`, `invalid_key`, `forbidden`).
- `GET /v1/me` is public and tests a key: 200 `{ apiKey: true, user: null }` for a valid key, 200 `{ apiKey: false, user: null }` with none, and 401 `Invalid API key.` for a wrong one, with `Cache-Control: no-store`. It is the one public route that does not ignore a wrong key. `user` fills in with sign-in (stage 2).

## Not built yet

- Sign-in (JWT) and roles (stage 2, D-94)
- Write routes (POST, PUT, DELETE) and `express.json()`
