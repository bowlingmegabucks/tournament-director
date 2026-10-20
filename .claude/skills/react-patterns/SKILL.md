---
name: react-patterns
description: React 19 patterns for this repo's web/ app: feature folders, components vs hooks, TanStack Query, state placement, effects, forms, loading/error/empty states, and tests. Use when creating or reviewing components, hooks, or data views.
---

# React patterns

Base rules are in [CLAUDE.md](../../../CLAUDE.md) and [docs/frontend-standards.md](../../../docs/frontend-standards.md). This skill shows how to apply them. For component API design (boolean props, compound components, context providers), use the `composition-patterns` skill.

## Where code goes

`api.ts` (fetch) → `use<Thing>.ts` (TanStack Query hook) → `<Thing>.tsx` (renders). Each layer knows only the one below it.

(.NET: `api.ts` is the HTTP client, the hook is the service layer, the component is the view. Components never touch `fetch`.)

## Data view: the standard shape

Every data view handles loading, error, and empty states.

```tsx
export function TournamentList() {
  const { data, isPending, isError, error } = useTournaments()

  if (isPending) return <p role="status">Loading tournaments…</p>
  if (isError) return <p role="alert">Could not load tournaments: {error.message}</p>
  if (data.length === 0) return <p>No tournaments yet.</p>

  return (
    <ul>
      {data.map((tournament) => (
        <li key={tournament.id}>{tournament.name}</li>
      ))}
    </ul>
  )
}
```

The `key` is an id, never the array index.

## Query hooks

```ts
export function useTournaments() {
  return useQuery({ queryKey: ['tournaments'], queryFn: fetchTournaments })
}

export function useCreateTournament() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTournament,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tournaments'] }),
  })
}
```

- Keys go from general to specific: `['tournaments', id]`.
- Never copy query data into `useState`. Read it from the query.
- Derive values during render. Do not store them.

## State

Pick the first that fits:

1. Derive it from props or query data. No state.
2. Local `useState` in the component that uses it.
3. Lift to the nearest common parent when siblings need it.
4. Context only for values most of the tree reads (current user, theme).

URL state (selected tournament, filters) belongs in the URL, not `useState`.

## Effects

`useEffect` is for syncing with things outside React: timers, subscriptions, browser APIs. Not for:

- Deriving state: compute it in render.
- Fetching data: use a query.
- Reacting to a click: put the logic in the event handler.

## React 19 notes

- `ref` is a regular prop. Do not use `forwardRef`.
- `use(Context)` replaces `useContext(Context)`.

## Forms and accessibility

- Every input has a `<label>`. Use `<button>`, `<a>`, `<ul>`, `<nav>`, `<main>`, not styled `div`s.
- Tests find elements by role and text. If `getByRole` cannot find it, the UI has an accessibility gap. Fix the markup, not the test.

## Tests

- Write the test with the code, next to the file: `Thing.test.tsx`.
- Mock the network with MSW and factories from `src/mocks/data.ts`. Never mock `fetch` by hand.
- Test what the user sees. Create a fresh `QueryClient` with `retry: false` per test.
- See [docs/testing.md](../../../docs/testing.md).

## Review checklist

- Does the component call `fetch`, or copy query data into state?
- Are loading, error, and empty states handled?
- Is any `useEffect` deriving state or fetching?
- Is every list keyed by id?
- Does a test cover the behavior, using role and text queries?

## Check current docs

React 19 and TanStack Query 5 APIs change. Check Context7 before you use an API from memory.
