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

Plain CSS with custom properties (no Tailwind, no component library). Palette comes from the tournament logo: black, tan gold, green.

**Files**

- `src/styles/tokens.css`: the only place raw colors, sizes, and fonts live. Light and dark values.
- `src/styles/base.css`: element defaults (body, headings, links, buttons, focus ring).
- `Component.module.css` next to its component: layout and look for that component. CSS Modules scope class names to the file, like a .NET scoped stylesheet (`Component.razor.css`).

**Rules**

- No hex, `rgb()`, or pixel values for color or spacing in component CSS. Use `var(--color-*)` and `var(--space-*)`.
- Add a new token to `tokens.css` before you use a new value. Give a color token a dark and a light value.
- Style with classes, not element selectors or ids. No `!important`.
- Use logical properties (`margin-inline`, `padding-block`, `inline-size`) and `rem`, not `px`, so layout follows text size and writing direction.
- Mobile first. Add `min-width` media queries only when the layout needs them.
- Dark and light follow the OS (`prefers-color-scheme`). No manual toggle yet.

**Accessibility (WCAG 2.2 AA)**

Enforced by `eslint-plugin-jsx-a11y` (lint) and axe in `e2e/accessibility.spec.ts` (dark and light, includes contrast). Automated checks miss many issues, so also tab through each new screen. The `ui-standards` skill has the full workflow and checklist.

- Text contrast 4.5:1 (3:1 for text of 24px or larger). Borders, icons, and focus rings 3:1. Check any new color pair before you add it.
- Do not use color alone to show meaning. Pair it with text or an icon (an error shows a message, not just red).
- Keep the `:focus-visible` ring. Never set `outline: none` without a replacement.
- Interactive targets are at least `--target-min` (44px) tall.
- Respect `prefers-reduced-motion`. Put every animation and transition inside `@media (prefers-reduced-motion: no-preference)`. Keep it short and optional.
- Use one `<h1>` per page and do not skip heading levels. Use landmarks (`header`, `main`, `nav`).
- Text must stay readable at 200% zoom and 320px width with no sideways scroll.
- Every image has `alt` text. Decorative images use `alt=""`.
- Brand text on the logo's black background: gold `--color-accent` and green `--color-success` both pass in dark mode. In light mode the tokens use darker shades.

## Formatting and lint

Prettier decides formatting (no semicolons, single quotes, 100 columns). ESLint decides correctness. Beyond the recommended rules, ESLint errors on: `any`, `@ts-ignore`, non-null `!`, `type` aliases for object shapes (use `interface`), and `fetch` outside `api.ts`. Do not argue with either; change the config in one commit if you want a different rule.
