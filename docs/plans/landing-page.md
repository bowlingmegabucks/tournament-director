# Plan: landing page

Branch: `landingPage` (kept by the owner instead of `migrate-landing-page`). Delete this file when the work is done.

Job of this slice: a visitor opens the site, sees the current tournament, and can browse all tournaments. It also builds the app shell (menus and routes) that every later feature plugs into.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| TRN-11 | In | The list. Public route, `API-03` shape. Grouping and sorting are new rules below |
| TRN-13 | In (new) | The Tournaments page groups into Current and upcoming, and Past (D-20, D-28) |
| TRN-14 | In (new) | Home shows a card for the current or next tournament (D-18) |
| TRN-15 | In (new) | Tournament overview page: name, dates, center, fee (D-24, D-25) |
| NAV-01 | In (new) | Top bar with Home and Tournaments on every page (D-22) |
| NAV-02 | In (new) | The tournament sidebar shows only when the URL names a tournament (D-19, D-21, D-22) |
| NAV-03 | In (new) | Pages not found: unknown address, unknown tournament (D-25) |
| API-15 | In (new) | Every route declares its access; undeclared routes fail at startup (D-27) |
| NAV-04 | Later | Squad and sweeper page header with breadcrumb and tabs (D-22, D-23). Built with the squad feature |
| TRN-01 to TRN-09, TRN-12 | Later | Create form, squad overrides |
| TRN-10 | Later | Edit and delete (D-12, D-15), "Complete" (Q-03) |

## Decisions used

- D-18: Home shows the current tournament card.
- D-19: Hide items the user can't use; do not disable.
- D-20: Current is set by dates (end date today or later).
- D-21: The tournament is in the URL. No New button in 0.2.0.
- D-22: Top bar, tournament sidebar, squad page header.
- D-23: Squads and sweepers share one pattern (design only here).
- D-24: Row fields and overview page.
- D-25: Vendor routes `GET /v1/tournaments` and `/v1/tournaments/{id}`.
- D-26: Demo data in this slice; database is the next run.
- D-27: Route access labels.
- D-28: The web app groups the list, using the browser's local date.
- D-29: Keep Check API on Home until the API reads the production database; accept the brief break when `GET /tournaments` goes.
- D-09: The vendor shapes stay as in `API-03` and `API-04`.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| TRN-11 | The list is the start screen; no sort or grouping | Home is the start page; the list groups Current and upcoming over Past, sorted by date | D-18, D-20, D-28 |
| TRN-11 | Opening a tournament opens the portal menu form | The tournament is in the URL; a sidebar replaces the portal menu | D-21, D-22 |

## API

All routes are `public` (D-27). Vendor-visible: `GET /v1/tournaments` and `GET /v1/tournaments/{id}` (D-09), so the shapes below match `API-03` and `API-04` and must not change without a vendor change doc.

| Route | Response | Errors |
| --- | --- | --- |
| `GET /health` | `{ status: 'ok' }` (unchanged) | |
| `GET /v1/tournaments` | `200 { tournaments: [{ id, name, startDate, endDate, entryFee, bowlingCenter }] }`. No filter, no sort | |
| `GET /v1/tournaments/{id}` | `200 { tournament: { id, name, startDate, endDate, entryFee, bowlingCenter } }`. The `divisions`, `squads`, `sweepers` arrays are added by their features (D-25) | `400 { message }` when `id` is not a UUID; `404 { message: 'Tournament not found' }` |

- `startDate` and `endDate` are `YYYY-MM-DD`. `entryFee` is a number with at most 2 decimal places.
- The old `GET /tournaments` (demo shape: `id, name, date, entrants`) is removed. Deploy order is API first, then web, so the live site fails for a short time between the two jobs. Acceptable for a demo site; tell the owner before merging.
- **Access labels (API-15).** `createApp` mounts routers through `mountRoutes(app, groups)`. Each group is `{ path, access, router }`, and `access` is `'public'` for now. `mountRoutes` throws at startup for a group with no access or an unknown one (TypeScript blocks it at build; the runtime check covers a bad cast). Auth (0.3.0) adds labels.
- Logging: the two routes use `requestLogger(res, logger)` only if they log something. A repository read needs no extra log line; the request log already covers it (`api-observability`).

## Web

Mockups: [index](landing-page-mockups/index.html), [layout](landing-page-mockups/layout-hybrid.html), [squad pattern](landing-page-mockups/layout-squad.html) (design only), [states](landing-page-mockups/states.html).

**Routes** (new dependency `react-router`, see "Dependency" below):

| Path | Page | Notes |
| --- | --- | --- |
| `/` | `HomePage` | Current or next tournament card, "All tournaments" link, a "System" section holding the existing Check API button |
| `/tournaments` | `TournamentsPage` | Current and upcoming, then Past |
| `/tournaments/:id` | `TournamentLayout` then `TournamentOverview` | The layout shows the sidebar; later features add child routes |
| `*` | `NotFoundPage` | "Page not found" |

**Components** (files in `web/src/`):

- `shared/AppShell.tsx`: logo header, `<nav aria-label="Main">` (Home, Tournaments, `NavLink` marks the current page), `<Outlet />`.
- `features/tournaments/TournamentLayout.tsx`: reads `:id`, loads the tournament with `useTournament(id)`, renders `<nav aria-label="Tournament">` with the name, dates, items, and "Change tournament", beside an `<Outlet />`. Loading and error states show without the sidebar. A 404 shows "Tournament not found" without the sidebar.
- `features/tournaments/TournamentsPage.tsx` and `TournamentList.tsx`: `TournamentList` takes a list of tournaments and renders cards; the page loads data and shows the two groups.
- `features/tournaments/TournamentOverview.tsx`: a `<dl>` of dates, center, fee under an `<h1>` with the name.
- `features/home/HomePage.tsx`: the card and links. Uses `currentTournament` below.
- Each page sets its own `<title>` (React 19 hoists it).
- On a phone the sidebar stacks above the page.

**Pure functions** (`features/tournaments/`, unit tested): `groupTournaments(tournaments, today)` returns `{ current, past }`; `currentTournament(tournaments, today)` returns the first current or upcoming one; `formatDateRange(start, end)`; `formatFee(fee)`. `today` is a `YYYY-MM-DD` string from the browser's local date. A `shared/today.ts` function returns it. It is called during render, so no `useEffect`.

**Card badge:** "In progress" when start ≤ today ≤ end; "Upcoming" when start is after today. Past cards have no badge.

**Hooks:** `useTournaments()`, `useTournament(id)` with keys in `tournamentKeys` (`all`, `detail(id)`).

**States:** every data view has loading (`<output>`), error (`role="alert"` with Try again), and empty, with the wording in the mockup. The group "Current and upcoming" shows "None right now." when empty.

**Mocks:** `src/mocks/handlers.ts` serves `/v1/tournaments` and `/v1/tournaments/:id` from a list built with dates relative to today (one in progress, three past). `data.ts` factories use the new fields.

### Dependency: `react-router`

Why: the app needs URLs for the tournament in context (D-21), nested layouts (D-22), and a current-page marker. Writing that by hand is a router. `react-router` is the most used React router. Alternatives: TanStack Router (type-safe routes, more setup, same data model as TanStack Query), or no router with state-driven pages (breaks links, back button, and bookmarks). .NET twin: ASP.NET MVC / Blazor routing, where `{id}` in the path binds to a parameter. Use the declarative `BrowserRouter` and `Routes`; tests use `MemoryRouter`. Docs checked in Context7 (`/remix-run/react-router`).

**Hosting change that comes with it** ([docs/deployment.md](../deployment.md) step 5): a deep link such as `/tournaments/abc` must return `index.html`. So we add a rewrite rule to `web/public/.htaccess` and change `base` in `vite.config.ts` from `'./'` to `'/'`. The site must then live at the domain root of the GreenGeeks host. CI cannot test the rewrite; the owner checks a deep link after the first deploy. Fallback if the host does not honor `.htaccess`: switch to `createHashRouter` (URLs become `/#/tournaments/abc`) with no other change.

## Data

`api/src/features/tournaments/types.ts`: a Zod `tournamentSchema` with `id` (uuid), `name`, `startDate`, `endDate` (ISO dates, end not before start), `entryFee` (number, greater than 0), `bowlingCenter`. `web/src/features/tournaments/types.ts` mirrors it by hand (the comment in the API file says change both). The API schema does not enforce the create rules here; they come with create (`TRN-01` to `TRN-07`). It only describes the shape.

`TournamentRepository` gets `get(id): Promise<Tournament | undefined>` next to `list()`. `createDemoTournamentRepository({ now })` replaces `randomRepository.ts`: four fixed-id tournaments with dates built from `now` (this year's tournament starts in 2 days and lasts 3, then three earlier years), so "current" stays current. No schema change; no database (D-26).

## Tests

| Rule | Test file and case |
| --- | --- |
| TRN-11 | `api/src/features/tournaments/routes.test.ts`: "returns every tournament in the vendor shape (TRN-11)", "returns an empty list when there are none (TRN-11)", "applies no filter or sort (TRN-11)" |
| TRN-11 | `api/src/features/tournaments/types.test.ts`: the response parses with `tournamentSchema` (the web contract) |
| TRN-11 | `web/src/features/tournaments/api.test.ts`: "reads the vendor list shape", rejects a bad shape, a non-OK status, and non-JSON |
| TRN-13 | `groupTournaments.test.ts`: ends today counts as current; ended yesterday is past; current soonest first; past newest first; ranges across a year end |
| TRN-13 | `TournamentsPage.test.tsx`: both groups render; "None right now."; loading, error, retry, empty |
| TRN-14 | `currentTournament.test.ts`: in progress wins over upcoming; first upcoming; none |
| TRN-14 | `HomePage.test.tsx`: card with In progress badge; Upcoming badge; none current message; none at all; error |
| TRN-15 | `api.test.ts` + `routes.test.ts`: detail route returns the tournament; 404; 400 |
| TRN-15 | `TournamentOverview.test.tsx`: shows name, dates, center, fee |
| NAV-01 | `AppShell.test.tsx`: Home and Tournaments links, the current one marked |
| NAV-02 | `TournamentLayout.test.tsx`: sidebar shows the tournament name and "Change tournament" at `/tournaments/:id`; no sidebar on `/` and `/tournaments` |
| NAV-03 | `NotFoundPage.test.tsx`; `TournamentLayout.test.tsx`: unknown id shows "Tournament not found" |
| API-15 | `api/src/shared/mountRoutes.test.ts`: throws for a group with no access; mounts a public group |
| Journeys | `web/e2e/tournaments.spec.ts`: Home to Tournaments to overview, and back through "Change tournament" |
| A11y | `web/e2e/accessibility.spec.ts`: axe on `/`, `/tournaments`, `/tournaments/{id}`, an empty list, an error, and not found, in dark and light |

Mutation: run `npm run test:mutation` in both folders; fix survivors in `groupTournaments` and `mountRoutes`.

## Steps

Each step ends green (lint, typecheck, test, `format:check` in the folders changed).

1. **API: shape and repository.** New `types.ts`, `get()`, demo repository, delete `randomRepository`; update `server.ts` and factories. Tests: repository and types.
2. **API: routes and access labels.** `mountRoutes`, move `/health` into a group, `/v1/tournaments` and `/v1/tournaments/:id`. Remove `/tournaments`. Update `docs/api-standards.md` with the access rule.
3. **Web: types, api, hooks, mocks.** New fields, vendor paths, `useTournament`, MSW handlers and factories. Tests: `api.test.ts`.
4. **Web: pure functions.** `groupTournaments`, `currentTournament`, `formatDateRange`, `formatFee`, `today`.
5. **Web: router, shell, pages.** Add `react-router`; `AppShell`, `HomePage`, `TournamentsPage`, `TournamentLayout`, `TournamentOverview`, `NotFoundPage`, CSS Modules from tokens. Component tests.
6. **Hosting.** `.htaccess` rewrite, `base: '/'`, update `docs/deployment.md`. Check `npm run build` and `npm run preview` deep links.
7. **E2E and a11y.** Update both specs. Run `npm run test:e2e`.
8. **Mutation.** Run both folders; fix survivors.
9. **Docs.** Update `docs/frontend-standards.md` (routing, layout) and `docs/dotnet-to-node.md` (router row).

## Not doing

- A New tournament button, sign-in, or any permission check (0.3.0 and later).
- Divisions, Squads, Sweepers, Registrations, Results pages and their sidebar items. Each ships with its own feature.
- The squad or sweeper page header (`NAV-04`). The mockup records the design.
- A database (D-26).
- Games, finals ratio, and cash ratio on any page (D-24).
- "Starts in N days" text, a year filter, or search on the list.
- Edit, delete, and "complete" (D-12, D-15, Q-03).
