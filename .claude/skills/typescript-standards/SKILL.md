---
name: typescript-standards
description: TypeScript rules and patterns for this repo (web/ and the future api/). Use when writing or reviewing .ts/.tsx code, typing API responses, narrowing unknown values, modeling states with unions, or fixing type errors.
---

# TypeScript standards

Rules for `web/` and `api/`. Base rules (strict mode, no `any`, `interface` vs `type`) are in [docs/frontend-standards.md](../../../docs/frontend-standards.md). This skill adds patterns and the reasons behind them.

## Rules

1. **No `any`.** Use `unknown` and narrow. (.NET: `unknown` is like `object` plus a compiler that forces you to check before use.)
2. **Do not cast to silence an error.** `as Foo` tells the compiler to trust you. Fix the type or narrow with a check. The one allowed cast: a value you just validated with a schema.
3. **No `@ts-ignore`.** Use `@ts-expect-error` with a reason. It fails the build once the error goes away, so stale suppressions do not pile up.
4. **Type data at the edge.** `api.ts` returns typed data. Once the API exists, parse responses with Zod and derive the type with `z.infer`. A cast on `response.json()` checks nothing at runtime.
5. **Let inference work.** Annotate function parameters and exported return types. Skip annotations on locals the compiler already infers.
6. **Avoid `enum`.** Use a union of string literals, or `as const` objects.
7. **Avoid non-null `!`.** Narrow with a check, or change the type so null cannot occur.

## Patterns

### Narrow `unknown`

```ts
function isApiError(value: unknown): value is { message: string } {
  return typeof value === 'object' && value !== null && 'message' in value
}
```

(.NET: like pattern matching with `is`.)

### Model states with a discriminated union

Use this instead of several optional fields or boolean flags.

```ts
type RegistrationState =
  { status: 'open'; closesAt: string } | { status: 'closed' } | { status: 'full'; waitlist: number }
```

Switch on `status`. Add a `never` check so a new variant breaks the build:

```ts
function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`)
}
```

(.NET: like a switch expression over a closed set of records, but the compiler enforces exhaustiveness only if you add the `never` check.)

### Derive types; do not repeat them

```ts
type TournamentSummary = Pick<Tournament, 'id' | 'name'>
type NewTournament = Omit<Tournament, 'id'>
type TournamentId = Tournament['id']
```

### `satisfies` for checked literals

`satisfies` checks a value against a type but keeps the narrow inferred type.

```ts
const routes = { home: '/', tournaments: '/tournaments' } satisfies Record<string, string>
```

### Errors are `unknown`

In `catch (error)`, `error` is `unknown`. Narrow with `instanceof Error` before reading `.message`.

## Review checklist

- Any `any`, `as` cast, `!`, or `@ts-ignore`? Is there a reason?
- Does external data (fetch, `localStorage`, URL params) pass through a check or a schema?
- Do optional fields hide what is really a union of states?
- Does a `switch` over a union end with `assertNever`?

## Check current docs

TypeScript here is 6.x. Before you use a newer compiler option or feature from memory, check the docs with Context7.
