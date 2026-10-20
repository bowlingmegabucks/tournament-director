# Frontend standards

## Structure

```
web/src/
  main.tsx               entry: providers, mock setup
  App.tsx                top-level layout
  features/<name>/       one folder per feature
    api.ts               fetch calls, return typed data, throw on !ok
    types.ts             shapes shared inside the feature
    use<Thing>.ts        TanStack Query hooks
    <Thing>.tsx          components
    <Thing>.test.tsx     tests, beside the code they cover
  mocks/                 MSW handlers, faker factories (dev, test, e2e only)
  test/                  test setup and helpers
  shared/                code two or more features use (create when needed)
```

## TypeScript

- `strict` is on. Fix errors, do not suppress them. No `@ts-ignore`; use `@ts-expect-error` with a reason if you must.
- Use `interface` for object shapes, `type` for unions.
- Type API responses at the edge (`api.ts`). When the API exists, validate with a schema library (such as Zod) rather than a cast.

## React

- One component per file. Export the component by name.
- Props: declare an interface, destructure in the signature.
- State: keep it as local as you can. Lift it only when siblings need it. Reach for context only for truly global values.
- Effects sync with things outside React (timers, subscriptions). They are not for data flow.
- Do not mutate state or props. Return new objects and arrays.

## Data fetching

- `api.ts` function → `use<Thing>` hook with `useQuery`/`useMutation` → component.
- Query keys are arrays, from general to specific: `['tournaments', id]`.
- After a mutation, invalidate the affected keys.
- Create one `QueryClient` in `main.tsx`. Tests create their own with `retry: false`.

## Styling

Plain CSS for now. Theming comes after the API works. Keep colors and spacing in CSS variables when we start.

## Formatting and lint

Prettier decides formatting (no semicolons, single quotes, 100 columns). ESLint decides correctness. Do not argue with either; change the config in one commit if you want a different rule.
