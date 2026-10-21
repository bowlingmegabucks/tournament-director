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
- **Error body:** `{ "message": string }`, for every status. The web `api.ts` files check the status first.
- **Routes live at the root** (`/health`, `/tournaments`), with no `/api` prefix: in production the API has its own host. In dev the Vite proxy takes `/api/...` and strips the prefix.
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

## Not built yet

- Database (see "Revisit later" in `CLAUDE.md`)
- Request logging and custom metrics (next parts of `apiHardening`)
- Rate limiting
- Authentication
- Write routes (POST, PUT, DELETE) and `express.json()`
