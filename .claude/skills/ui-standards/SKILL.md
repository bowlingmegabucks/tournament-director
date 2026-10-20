---
name: ui-standards
description: UI design system and accessibility rules for this repo's web/ app: design tokens, CSS Modules, layout, forms, buttons, data-view states, and the WCAG 2.2 AA checklist. Use when designing or styling any screen, component, or feature UI, and when a new-feature skill needs to lay out its frontend.
---

# UI standards

The styling rules are in [docs/frontend-standards.md](../../../docs/frontend-standards.md) (Styling). This skill shows how to apply them to a new screen. For component API design (props, compound components), use `composition-patterns`. For data fetching and state, use `react-patterns`.

Brand: Northeast MegaBuck$ Tournament. Black, tan gold, green, from the logo. The header (logo on black) is in `App.tsx`. Do not restyle it per feature.

## Workflow for a new screen

1. **Name the job of the screen** in one line ("a director enters a bowler's score"). That sets the heading and the one primary button.
2. **List the states**: loading, error, empty, and loaded. Add "saving" and "invalid" for forms. Design each before the happy path.
3. **Pick structure with semantic HTML** before any CSS (table below).
4. **Style from tokens** in a `Component.module.css` next to the component.
5. **Check in both color schemes and at 320px wide.** Run `npm run dev`, switch the OS scheme, and zoom to 200%.
6. **Add an e2e axe test** if the screen is a new page or route (see Verify).

## Tokens

All values come from `web/src/styles/tokens.css`. Read it for the current list. Use these groups:

| Need                 | Token                                                                        |
| -------------------- | ---------------------------------------------------------------------------- |
| Page / card fill     | `--color-bg`, `--color-surface`                                              |
| Text                 | `--color-text`, `--color-text-muted`                                         |
| Border               | `--color-border`                                                             |
| Brand / primary fill | `--color-accent` with `--color-accent-text` on top                           |
| Good / bad status    | `--color-success`, `--color-danger` (add text or an icon, never color alone) |
| Spacing              | `--space-1` to `--space-8`                                                   |
| Type size            | `--font-size-sm`, `-base`, `-lg`, `-xl`                                      |
| Shape                | `--radius`, `--border-width`                                                 |
| Touch size           | `--target-min`                                                               |

Need a value that is not there? Add a token with a dark and a light value to `tokens.css` first. Compute its contrast before you commit (4.5:1 text, 3:1 borders and icons).

## Pick the right element

| UI                           | Use                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| Page title                   | One `<h1>`. Section titles `<h2>`, then `<h3>`. Do not skip levels.                   |
| Site areas                   | `<header>`, `<nav>`, `<main>`, `<footer>`. Label a second `<nav>` with `aria-label`.  |
| List of records              | `<ul>` of cards for a few fields. `<table>` with `<th scope>` for columns to compare. |
| Action that changes data     | `<button type="button">` (or `type="submit"` in a form)                               |
| Move to another page         | `<a href>` (a router `Link`), never a button                                          |
| Text input, select, checkbox | Native element with a `<label>`. Group related ones in `<fieldset><legend>`.          |
| Status that updates          | `<output>` or `role="status"` (polite). Errors: `role="alert"`.                       |

Do not put a click handler on a `div` or `span`. The lint rule `jsx-a11y` fails the build.

## Layout

- Mobile first: one column, `max-inline-size: var(--content-width)`, `margin-inline: auto`. Add a `min-width` media query only when a second column helps.
- Use `display: grid` or `flex` with `gap: var(--space-*)`. No margin hacks between siblings.
- Logical properties and `rem` only.
- Page padding: `var(--space-6) var(--space-4)`. Card padding: `var(--space-4)`.

## Recipes

**Card list item.** See `TournamentList.module.css`: surface fill, `--color-border` border, `--radius`, name in `<strong>`, meta in `--color-text-muted`.

**Form field.**

```tsx
<div className={styles.field}>
  <label htmlFor={id}>Bowler name</label>
  <input
    id={id}
    name="name"
    required
    aria-describedby={error ? `${id}-error` : undefined}
    aria-invalid={error ? true : undefined}
  />
  {error && (
    <p id={`${id}-error`} className={styles.fieldError}>
      {error}
    </p>
  )}
</div>
```

- The label is always visible. A placeholder is not a label.
- Say what is wrong and how to fix it ("Enter a score from 0 to 300"), next to the field. After a failed submit, move focus to the first invalid field or an error summary.
- Mark required fields in the label text, not only with `*`.
- Use the right `type` and `autocomplete` (`email`, `tel`, `inputmode="numeric"`).

**Buttons.** The base style in `base.css` is the primary button. One primary per view. A secondary button (outline: transparent fill, `--color-accent` border and text) gets a class in the component module. A destructive action names the thing ("Delete tournament") and asks to confirm.

**Data view.** Follow the state shape in `react-patterns`. Style the states alike: loading in `<output>`, error in a bordered `role="alert"` block with a "Try again" button, empty as a plain sentence that says what to do next.

**Images and icons.** Meaningful image: `alt` text that says what it conveys. Decorative: `alt=""`. An icon-only button needs an accessible name (`aria-label`) and a visible tooltip or text nearby.

## Accessibility checklist (WCAG 2.2 AA)

- [ ] Every color pair meets contrast (text 4.5:1, large text and UI parts 3:1), in dark and light
- [ ] Meaning is never color alone
- [ ] Everything works by keyboard, in a sensible tab order, with a visible focus ring (do not remove `:focus-visible`)
- [ ] Targets are at least `--target-min` tall
- [ ] Every input has a visible label, and errors are linked with `aria-describedby`
- [ ] One `<h1>`, no skipped heading levels, landmarks in place
- [ ] Readable at 200% zoom and 320px wide with no sideways scroll
- [ ] Animation is short and is wrapped in `@media (prefers-reduced-motion: no-preference)`
- [ ] Page `<title>` and `lang` are set (new pages get their own title)
- [ ] Images have `alt`

## Verify

- `npm run lint` runs `eslint-plugin-jsx-a11y` (missing alt text, unlabeled controls, click on `div`).
- `web/e2e/accessibility.spec.ts` runs axe (WCAG 2.2 AA) in a real browser, in dark and light mode, which also checks contrast. For a new page or route, add its path to that file. Open any state the page hides (an error, a dialog) before the scan.
- Unit tests query by role and name (`getByRole('button', { name: 'Save' })`). If a query is hard to write, the markup is probably not accessible.
- Automated checks find about a third of the issues. Tab through the screen and read it at 200% zoom as well.
