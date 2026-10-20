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
- **Routes live under `/api`.** The web app calls `/api/...`.
- **Contract with `web/`.** The `Tournament` shape is in `api/src/features/tournaments/types.ts` and `web/src/features/tournaments/types.ts`. Change both together. (No shared package: two folders, no workspaces.)
- **Config:** every setting is an env var, validated at startup. The app refuses to start on bad config. Add new vars to `.env.example`.
- **Security defaults stay on:** `helmet()` and an explicit CORS allow-list (`CORS_ORIGIN`). No `*`.
- **No secrets in the repo.** Use env vars and GitHub Actions secrets.

## Not built yet

- Database (see "Revisit later" in `CLAUDE.md`)
- Request logging
- Authentication
- Write routes (POST, PUT, DELETE) and `express.json()`
