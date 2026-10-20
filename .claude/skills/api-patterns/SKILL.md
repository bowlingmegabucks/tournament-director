---
name: api-patterns
description: Express 5 + TypeScript patterns for this repo's api/ app: feature folders, createApp with injected dependencies, routers, repositories, Zod validation, error handling, config, CORS. Use when adding or reviewing a route, repository, middleware, or config value in api/.
---

# API patterns

Rules are in [docs/api-standards.md](../../../docs/api-standards.md) and [CLAUDE.md](../../../CLAUDE.md). This skill shows how to apply them. The model feature is `api/src/features/tournaments/`. Type rules are in `typescript-standards`.

Check Context7 for Express 5 and Zod 4 before you use an API from memory. Both changed a lot from the versions most examples show.

## Add a feature

1. `types.ts`: Zod schema, then `export type X = z.infer<typeof xSchema>`.
2. `repository.ts`: an `interface XRepository` and `createInMemoryXRepository(seed)`.
3. `routes.ts`: `createXRouter(repository): Router`.
4. Mount it in `app.ts` under `/<name>`; add the repository to `AppDependencies`; build the real one in `server.ts`.
5. Tests: `routes.test.ts`, `repository.test.ts`. Use the `api-testing-patterns` skill.
6. If `web/` calls it, update the web types, `api.ts`, and MSW handlers in the same PR.

## Routes: thin

```ts
export function createTournamentRouter(repository: TournamentRepository): Router {
  const router = Router()

  router.get('/:id', async (req, res) => {
    const { id } = idParams.parse(req.params) // ZodError -> 400, see below
    const tournament = await repository.get(id)
    if (!tournament) throw new HttpError(404, 'Tournament not found')
    res.json(tournament)
  })

  return router
}
```

- Express 5 sends a thrown error or rejected promise to the error handler. No `try/catch`, no `next(err)`.
- (.NET: a minimal-API endpoint group. The repository is the injected service.)

## Validate input

Parse at the edge. `parse` throws; map the failure to a 400 in one place.

```ts
const createBody = z.object({ name: z.string().min(1), date: z.iso.date() })

router.post('/', async (req, res) => {
  const input = createBody.parse(req.body)
  res.status(201).json(await repository.create(input))
})
```

When the first write route arrives, add `express.json()` in `app.ts` and teach `errorHandler` to turn `ZodError` into `400 { message }` (use `z.prettifyError`). Add a test for each.

## Errors

- Expected failure: `throw new HttpError(404, 'Not found')`.
- Unexpected: let it throw. `errorHandler` logs it and sends `500 { message: 'Internal server error' }`. Never send `err.message` for unknown errors; it can leak internals.
- Body shape is always `{ message }`.

## Dependencies and config

- `createApp({ config, ...repositories })`. No module-level singletons, no `import { db }` inside routes. That is what lets tests pass fakes.
- Read `process.env` only in `config.ts` (ESLint enforces this). Everything else receives `Config`.
- New env var: add it to the Zod schema, to `Config`, to `.env.example`, and to `config.test.ts`.

## Review checklist

- Does the route call only the repository, with validated input?
- Does every expected failure have an `HttpError` and a test?
- Does an unexpected failure return a generic 500?
- Is a response shape change mirrored in `web/`?
- Is `server.ts` still free of logic?
- Does the new file use `.ts` import extensions and erasable syntax only?
