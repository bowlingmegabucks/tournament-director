---
name: testing-patterns
description: How to write and review tests in this repo's web/ app: Vitest + Testing Library + MSW, mock data factories, TanStack Query test setup, Playwright e2e, and fixing surviving Stryker mutants. Use when adding or changing a component, hook, or api.ts file, writing or reviewing a test, or reading a mutation report.
---

# Testing patterns

Rules are in [docs/testing.md](../../../docs/testing.md) and [CLAUDE.md](../../../CLAUDE.md). This skill shows how to apply them. The model test is `web/src/features/tournaments/TournamentList.test.tsx`.

A change without a test is incomplete. Write the test with the code.

## The shape of a test

Render the real component with the real hook. Fake only the network, with MSW.

```tsx
it('shows tournaments returned by the API', async () => {
  const tournament = createTournament({ name: 'Spring Open', entrants: 42 })
  server.use(http.get('/api/tournaments', () => HttpResponse.json([tournament])))

  renderWithClient(<TournamentList />)

  expect(await screen.findByText('Spring Open')).toBeInTheDocument()
})
```

- Data comes from the factories in `src/mocks/data.ts`. Override only the fields the test cares about. If a test needs a new shape, extend the factory.
- `src/test/setup.ts` fails any request without a handler. Add a handler per test with `server.use(...)`. Handlers reset after each test.
- `renderWithClient` gives each test its own `QueryClient` with `retry: false`. Without it, a failing request retries and the test times out.
- Never mock `fetch`, a hook, or `api.ts` by hand.

## Queries

Prefer, in order: `getByRole` (with `name`), `getByLabelText`, `getByText`. Do not use test ids. If `getByRole` cannot find an element, the markup has an accessibility gap. Fix the markup.

- `findBy*` for what appears after a fetch. `getBy*` for what is already there. `queryBy*` only to assert absence.
- `userEvent`, not `fireEvent`. `await` every `userEvent` call.

## What to cover

Every data view gets these cases:

1. Happy path.
2. Empty state.
3. Error from a failed status (`new HttpResponse(null, { status: 500 })`).
4. Error from a bad body (the response is not the expected shape).
5. Loading state, then let the request finish so it cannot leak into the next test.
6. Recovery, if the UI offers retry.

For a mutation, also assert the list updates after it, since invalidation is the behavior.

## Mutation testing

A surviving mutant means a missing or weak assertion. Fix the test, never the threshold.

| Survivor                        | Usual cause                    | Fix                                                 |
| ------------------------------- | ------------------------------ | --------------------------------------------------- |
| Condition flipped (`>` to `>=`) | No test at the boundary        | Add a case at the boundary value                    |
| String emptied                  | Test checks presence, not text | Assert the exact text with `toHaveTextContent`      |
| Block removed                   | Side effect never asserted     | Assert the effect (request sent, query invalidated) |
| `if (!response.ok)` flipped     | Only the success path ran      | Add the error-status test                           |

Some survivors are equivalent mutants: the change cannot alter behavior, so no test can kill it. Example: replacing `.catch(() => null)` with `.catch(() => undefined)` when the next line rejects both. Confirm the behavior is identical before you accept one. Do not write a test that passes either way.

Read `reports/mutation/mutation.html` for survivors line by line. The "errors" are mutants that fail TypeScript and are normal.

## End to end

Playwright covers main user journeys only, a few tests. Query by role, as in unit tests. Logic and edge cases belong in unit tests.

## Review checklist

- Does the test fail if the behavior breaks? Delete a line of the component and check.
- Does it query by role or text, not by test id or class?
- Is there a handler for every request, and none left from another test?
- Is each case in "What to cover" there for new data views?
- Does the test assert what the user sees, not internal state or call counts?

## Check current docs

Vitest is pinned to 4.x and MSW is 3.x (`onUnhandledFrame`, not `onUnhandledRequest`). Check Context7 before you use an API from memory.
