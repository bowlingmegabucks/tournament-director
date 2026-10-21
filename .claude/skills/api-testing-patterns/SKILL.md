---
name: api-testing-patterns
description: How to write and review tests in this repo's api/ app: Vitest + Supertest against createApp, factories, fake repositories, config and error-path tests, and fixing surviving Stryker mutants. Use when adding or changing a route, repository, middleware, or config in api/, or reading its mutation report.
---

# API testing patterns

Rules are in [docs/testing.md](../../../docs/testing.md). Stack, pins, and commands are in [CLAUDE.md](../../../CLAUDE.md). The web side is in `testing-patterns`. The model tests are `api/src/features/tournaments/routes.test.ts` and `api/src/app.test.ts`.

A change without a test is incomplete. Write the test with the code. (.NET: Supertest against `createApp` is `WebApplicationFactory`.)

## The shape of a test

Build the real app with a fake or in-memory repository. Send real HTTP requests to it in memory. No port opens.

```ts
it("returns the tournaments as JSON", async () => {
  const tournament = createTournament({ name: "Spring Open" });
  const app = createTestApp({
    tournaments: createInMemoryTournamentRepository([tournament]),
  });

  const response = await request(app).get("/tournaments");

  expect(response.status).toBe(200);
  expect(response.body).toEqual([tournament]);
});
```

- `createTestApp(overrides)` in `src/test/testApp.ts` gives default config and empty storage. Override only what the test needs.
- Data comes from `src/test/factories.ts`. Override only the fields the test checks. Extend the factory for new shapes.
- Assert status, body, and the headers that matter. Do not assert how the route calls the repository.
- Do not mock Express, `req`, or `res`. Use Supertest.

## What to cover for each route

1. Happy path (status, body, content type).
2. Empty result.
3. Invalid input: 400 and a `{ message }` body (once write routes exist).
4. Missing resource: 404.
5. Storage failure: pass a repository whose method rejects. Expect a generic 500, and that the cause is not in the body. Silence the log with `vi.spyOn(console, 'error').mockImplementation(() => undefined)` and restore it.
6. Contract: parse the response with the Zod schema from `types.ts`.

## Config and middleware

- `loadConfig(env)` takes an object. Pass `{}` or specific vars. Never set `process.env` in a test.
- Test boundaries: valid and invalid values (`it.each`), defaults, trimming.
- Test middleware through the app (CORS allowed and denied, headers set) or on a tiny Express app that has only that middleware, as `shared/middleware.test.ts` does.

## Logs, metrics, and limits

- Check what was logged with `createCapturedLogger()` (`src/test/logger.ts`): `records()` returns the parsed JSON lines. Assert on `level`, `msg`, and key fields. `createTestApp` already gives a silent logger.
- `createConfig({ ... })` (`src/test/factories.ts`) builds a `Config` with a high rate limit and no telemetry destination. Override only what the test needs.
- Rate limit tests set `rateLimit: { max: 1, windowSeconds: 60 }` and, to test client addresses, `trustProxy: 1` with an `X-Forwarded-For` header.
- Check a metric with `MeterProvider` and `InMemoryMetricExporter`, passing the meter to `createTestApp({ meter })`.
- Test the process handlers with an `EventEmitter` and fake timers (`shared/processEvents.test.ts`), never by sending a real signal.

## Mutation testing

Run `npm run test:mutation` in `api/` for changed routes, repositories, and config. A survivor means a missing or weak assertion. Fix the test, never the threshold.

| Survivor                | Usual cause               | Fix                                 |
| ----------------------- | ------------------------- | ----------------------------------- |
| Status code changed     | Test checks the body only | Assert `response.status`            |
| String emptied          | Message not asserted      | Assert the exact `message`          |
| Condition flipped (`>`) | No test at the boundary   | Add the boundary value to `it.each` |
| Block removed           | Side effect not asserted  | Assert the effect                   |
| Seed or constant data   | Data, not logic           | Excluded in `stryker.config.json`   |

Some survivors are equivalent: the change cannot alter behavior (for example, `router.get('')` and `router.get('/')`). Confirm, then add `// Stryker disable next-line <Mutator>: <reason>`, as `routes.ts` does. Do not write a test that passes either way.

## Review checklist

- Does the test fail if the route breaks? Remove a line and check.
- Does it go through `createApp`, not a hand-built `req` and `res`?
- Is the error path tested, with a generic 500 and no leaked detail, and a check that it was logged?
- Does the test avoid `process.env` and real network or disk?
- Is a changed response shape also covered in `web/` tests and MSW handlers?

## Check current docs

Vitest is pinned to 4.x (see `CLAUDE.md`). Check Context7 before you use a Supertest, Vitest, or Stryker API from memory.
