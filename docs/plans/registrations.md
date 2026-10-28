# Plan: registrations (list)

Branch: `registration-list` (not `migrate-registrations`; the owner made it before the run). Delete this file when the work is done.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| REG-23 | In | List, sort, columns, filters (D-47, D-49, D-51) |
| REG-24 | In | Summary above the grid (D-50) |
| REG-26 (new) | In | The route and page: states, errors, bad rows (D-47, D-51) |
| REG-27 (new) | In | A bowler with two registrations shows twice, with a warning logged (D-48) |
| BWL-13 | In | Display name |
| BWL-17 | In | The SSN is never read or sent |
| REG-01 to REG-08, REG-04 and REG-04a to h | Later | Create and eligibility: commands |
| REG-10 to REG-14, REG-30 to REG-39 | Later | Vendor routes (key auth) |
| REG-15 to REG-22, REG-25 | Later | Desk changes: commands |
| BWL-01 to BWL-08, BWL-10 to BWL-12, BWL-07a | Later | Run on save |
| BWL-09 | Later | Age, for eligibility |
| BWL-14 | Later | Search for add registration. The grid filter is D-49 |
| BWL-15, BWL-16, BWL-16a, BWL-18 | Later | Bowler edits and overwrites |
| API-05 to API-08, PAY-* | Later | Vendor routes and payments |

## Decisions used

- D-46: the list is public in 0.2.0, then signed-in only. D-52: the lock-down release comes right after 0.3.0.
- D-47: table page, sidebar link, web-only route, `Bowlers` read without the SSN column.
- D-48: two registrations for one bowler in one tournament show twice; the API logs a warning.
- D-49: one filter box over first name, last name, USBC ID; every word must start one of them, ignoring case; in the browser; no paging.
- D-50: summary above the grid, whole tournament, computed by the API.
- D-51: bad rows skipped and logged; sort ends on registration id.
- D-53: one shared `Loading` component (three dots, the words, optional placeholder rows) for every inline loading state.
- D-03, D-04, D-06: one per tournament, a squad entry counts when it exists, even if complete.
- D-27: the route declares `public` access. D-30: hand-written Prisma schema. D-40: error codes.
- D-02, D-09: nothing the registration site sees changes.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| REG-23 | One name filter | One box over first name, last name, and USBC ID, by word prefix | D-49 |
| REG-23 | Sort by last, first | Same, then registration id | D-51 |
| REG-23 | WinForms grid | Web table with a USBC ID column | D-47 |
| REG-24 | Counts on the desk screen | Summary strip on the page, whole tournament | D-50 |
| REG-01 | Index allows two per tournament | Shown twice, warning logged | D-48 |
| New | Desk only | Public read for now; locked down after 0.3.0 | D-46, D-52 |

## API

One new route, web only, not vendor-visible (D-09). Public (D-27).

`GET /v1/tournaments/{id}/registrations`

```json
{
  "registrations": [
    {
      "id": "uuid",
      "bowler": {
        "id": "uuid",
        "name": "Ray Baptiste, Jr",
        "firstName": "Ray",
        "lastName": "Baptiste",
        "usbcId": "1190-55820"
      },
      "divisionId": "uuid",
      "divisionName": "Open",
      "squads": 1,
      "sweepers": 0,
      "superSweeper": false
    }
  ],
  "summary": {
    "registrations": 48,
    "superSweepers": 12,
    "divisions": [{ "id": "uuid", "number": 1, "name": "Open", "entries": 61 }],
    "squads": [{ "id": "uuid", "date": "2026-10-24T09:00:00", "entries": 28 }],
    "sweepers": [{ "id": "uuid", "date": "2026-10-23T19:00:00", "entries": 35 }]
  }
}
```

- `usbcId` is `""` when the bowler has none (the table is `NOT NULL`, `''` for none). The page shows a dash.
- `name` is `First Last`, plus `, Suffix` (`BWL-13`). `firstName` and `lastName` are there for the filter.
- Rows come sorted by last name, first name, registration id, compared ignoring case (D-51). The web app keeps that order.
- `summary.divisions`, `squads`, and `sweepers` list every one in the tournament, with `entries: 0` where nobody entered. They keep the order of the Divisions, Squads, and Sweepers lists (`DIV-13`, `SQD-20`). A division's `entries` is the sum of squads each of its bowlers entered (`REG-24`, sweepers not counted). A squad's or sweeper's `entries` is the number of `SquadRegistration` rows for it, complete or not (D-06).
- Errors, as D-40: `400` id not a UUID; `404 { message: "Tournament not found" }`; `500` a stored tournament that breaks its shape; `503` database down.
- Never sent (`BWL-17`): SSN, gender, date of birth, address, email, phone, payments, average, lane positions.

How the route builds it:

1. In parallel: the tournament (404 check), `registrations.listByTournament`, and the existing division, squad, and sweeper repositories (names and dates for the summary).
2. A pure function `summarize(registrations, divisions, squads, sweepers)` in `summary.ts` makes the summary. The route maps each registration to counts.

The repository returns each registration with `squadIds` and `sweeperIds`, so counting stays in plain code a test can reach without a database.

## Web

Mockups: [index](registrations-mockups/index.html), [list](registrations-mockups/list.html) (loaded, filtered, no match, loading, empty, error), [spinner options](registrations-mockups/spinner-options.html) (the pick is B plus D, D-53).

- **Route and link.** `registrations` child route under the tournament layout. A "Registrations" link after "Sweepers" in the sidebar (`NAV-02`, D-19, D-47).
- **Page.** `RegistrationsPage`: `<h1>Registrations</h1>`, a summary, a filter box, the table. Title `Registrations · {tournament} · Tournament Director`.
- **Summary.** `RegistrationSummary`: totals (bowlers registered, super sweeper) and three lists (by division, by squad, by sweeper). A squad or sweeper shows `formatSessionDate`. A division shows `number name`. A note says counts cover the whole tournament.
- **Filter.** `<form role="search">` with one labeled `type="search"` input ("Filter by name or USBC ID", with a hint: "Type part of a first name, last name, or USBC ID. Several words must all match, such as "joe 2045"."), a "Clear filter" secondary button, and an `<output>` that says "Showing 1 of 48 registrations." Typing filters at once; Enter does not submit. The text is form state (`useState`), not server data. `filterRegistrations(rows, text)` is a pure function in `filter.ts`: split the text on spaces and commas; a row matches when every word starts its first name, last name, or USBC ID, ignoring case. Empty text matches all.
- **Table.** Columns: Bowler (row header), USBC ID, Division, Squads, Sweepers, Super sweeper. Counts align at the end; the super sweeper header and cells are centered (start-aligned in the narrow card layout). The same card layout on narrow screens as Divisions (`data-label`). Key is the registration id. USBC ID `""` shows "–", super sweeper shows a check mark (`✓`, hidden from screen readers) with the visually hidden word "Yes", or is blank with the hidden word "No" (D-47). The check mark is not the only signal: the hidden words carry the meaning. On narrow screens a blank super sweeper cell is left out of the card, so no lone label shows.
- **States.**
  - Loading: `<Loading label="Loading registrations…" rows={6} />` (D-53): three dots and the words, with six gray placeholder bars.
  - Error: `QueryError` with Try again.
  - Empty: "No registrations yet." with no summary or filter.
  - No match: "No registrations match the filter." Summary stays.
  - An unknown tournament: the layout's "Tournament not found".
- **Shared `Loading` (D-53).** `web/src/shared/Loading.tsx` and `Loading.module.css`: props `label` (the words) and optional `rows` (placeholder bars). Renders `<output>` with the dots (`aria-hidden`) and the label, then the bars (`aria-hidden`). Tokens only (`--color-accent`, `--color-border`); animation inside `@media (prefers-reduced-motion: no-preference)`. Replaces the plain `<output>Loading …</output>` in `HomePage`, `TournamentsPage`, `TournamentLayout`, `DivisionsPage`, `SquadsPage`, `SweepersPage`. The tournament pages pass `rows` (6 for the list pages, 3 for the tournament list); the layout and Home pass none. Existing tests look for the same words, so they keep passing.
- **Files.** `web/src/features/registrations/`: `RegistrationsPage.tsx`, `RegistrationSummary.tsx`, `RegistrationsPage.module.css`, `types.ts`, `api.ts`, `useRegistrations.ts`, `filter.ts`. No new dependency.

## Data

No schema change; WinForms owns the schema (D-30). New Prisma models in `api/prisma/schema.prisma`:

- `Bowler` (`Bowlers`): `id`, `firstName`, `lastName`, `suffix`, `usbcId`. No other column, and above all no `SocialSecurityNumber` (`BWL-17`). A comment says why. Prisma `select` reads only the listed columns, so the model is the second guard.
- `Registration` (`Registrations`): `id`, `bowlerId`, `divisionId`, `superSweeper`, relations to `Bowler`, `Division`, and `SquadRegistration[]`. No `average`; the list does not show it.
- `SquadRegistration` (`SquadRegistration`): `registrationId`, `squadId`, composite key, relation to `Squad`. No `LaneAssignment`.
- Back relations on `Division` and `Squad`.

The query: `registration.findMany({ where: { division: { tournamentId } }, select: { id, superSweeper, bowler, division: { name }, squads: { select: { squad: { select: { id, tournamentId, squadType } } } } } })`. A joined squad of another tournament or a `SquadType` other than 0 or 1 is ignored (D-51). The tournament comes from the division, since `Registrations` has no `TournamentId` (Q-26).

Types:

- API: `features/registrations/types.ts` (Zod `registrationSchema`, `registrationListSchema`, summary types) and `registrationRow.ts` (`toRegistration(row)` returns a `safeParse` result).
- Web: `features/registrations/types.ts` with the same fields. Change both together, as the squads and divisions types say.
- `repository.ts`: the interface, the sort function, and an in-memory fake. `prismaRepository.ts`: the real one, with `withDatabaseErrors`, skip-and-log for bad rows (D-51), and a warning for duplicate bowlers (D-48).

Local data: `db:seed` gains `seedRegistrations.ts`. It adds bowlers and registrations to each sample tournament, enough to show every column: two bowlers with one last name, one with no USBC ID, one with a suffix, a super sweeper, a squad with no entries, and a complete squad with entries. Running it twice adds nothing, like the others. The seed never writes an SSN.

## Tests

Names carry the rule ID. DB tests need Docker.

| Rule | File and case |
| --- | --- |
| REG-23 sort | `api/.../registrations/repository.test.ts`: "sorts by last name, then first name, then id (REG-23, D-51)"; ignores case |
| REG-23 sort (real) | `prismaRepository.db.test.ts`: same order from MariaDB |
| REG-23 columns | `web/.../RegistrationsPage.test.tsx`: "shows bowler, USBC ID, division, squads, sweepers, and super sweeper (REG-23)"; "shows a dash for an empty USBC ID" |
| REG-23 filter | `filter.test.ts`: word starts a first name, last name, or USBC ID; ignores case; commas and extra spaces; every word must match; empty text returns all. `RegistrationsPage.test.tsx`: typing narrows the rows and updates "Showing 1 of N"; "Clear filters" restores; no match shows the message |
| REG-24 counts | `summary.test.ts`: "a division counts squads, not sweepers (REG-24)"; "a squad with no entries lists 0"; "a complete squad still counts (D-06)"; super sweepers; totals. `routes.test.ts`: summary in the body. `RegistrationsPage.test.tsx`: summary shows and does not change when filtered |
| REG-26 route | `routes.test.ts`: 200 shape; 404 unknown tournament; 400 non-UUID; 500 bad tournament row; 503 outage; empty list. `app.test.ts`: mounted public. `api.test.ts` (web): maps 404, 400, other errors, bad shape |
| REG-26 page | `RegistrationsPage.test.tsx`: loading, error with retry, empty. `TournamentLayout.test.tsx`: the sidebar link. `web/e2e/tournaments.spec.ts`: sidebar to registrations, filter, summary. `web/e2e/accessibility.spec.ts`: add the path |
| REG-26 bad rows | `registrationRow.test.ts`: UUID id, non-empty first and last name. `prismaRepository.db.test.ts`: a skipped row is logged and the rest show |
| REG-27 duplicates | `prismaRepository.db.test.ts`: "shows both rows for a bowler with two registrations and logs a warning (REG-27, D-48)". `RegistrationsPage.test.tsx`: two rows with one name |
| BWL-13 | `registrationRow.test.ts`: `First Last`, `, Suffix` only when there is one, no middle initial |
| BWL-17 | `routes.test.ts`: no `socialSecurityNumber`, gender, or birth date in the body. `prismaRepository.db.test.ts`: a bowler seeded with an SSN does not leak it |
| Seed | `seedRegistrations.db.test.ts`: adds the rows; second run adds none; no SSN written |
| D-53 loading | `web/src/shared/Loading.test.tsx`: shows the label in a status, hides the dots and bars from the accessibility tree, draws `rows` bars, none by default. Each page's existing loading test still passes; no new dependency |
| Mocks | `web/src/mocks/data.ts`: `createRegistration`, `createDemoRegistrations`; `handlers.ts`: the route |

Mutation: `npm run test:mutation` in `api/` and `web/`. The Prisma repository and the seed file join the Stryker skip list, as the other Prisma repositories did (the recent commit "skip the new Prisma repositories and seed"); `summary.ts`, `registrationRow.ts`, `repository.ts`, `filter.ts`, and the page are mutated.

## Steps

Each ends green: lint, typecheck, test, `format:check` in `api/` or `web/`.

1. **API types and row mapping.** `types.ts`, `registrationRow.ts`, with tests (BWL-13, BWL-17, D-51).
2. **Summary.** `summary.ts` and tests (REG-24).
3. **Repository.** Interface, sort, in-memory fake, tests (REG-23).
4. **Route.** `routes.ts`, mount in `app.ts` with `public` access, `AppDependencies.registrations`, update `server.ts` and test helpers. Tests (REG-26).
5. **Prisma.** Models, `npm run db:generate`, `prismaRepository.ts`, `.db.test.ts` (REG-23 real order, REG-26 bad rows, REG-27, BWL-17). Add to the Stryker skip list.
6. **Seed.** `seedRegistrations.ts`, wire into `seed.ts`, test.
7. **Shared `Loading`.** Component, CSS Module, test; swap it into the six existing places (D-53). Run `web/` checks.
8. **Web data.** `types.ts`, `api.ts`, `useRegistrations.ts`, mock factories and handler, tests.
9. **Web filter.** `filter.ts` and tests.
10. **Web page.** `RegistrationsPage`, `RegistrationSummary`, CSS Module, sidebar link, route in `App.tsx`. Tests for states, columns, filter, summary.
11. **E2E and a11y.** Journey in `tournaments.spec.ts`, path in `accessibility.spec.ts`. Run `npm run test:e2e`. Check light and dark, 320px, and 200% zoom by hand.
12. **Mutation.** Run in both folders; fix survivors in tests.
13. **Final check.** `npm run check` at the root.

Commits cite rules, such as "Add registration list route (REG-23, REG-24, REG-26)".

## Not doing

- Any create, change, delete, or remove action, and any link from a row (Later; no row page exists).
- A bowler route, a bowler page, or any bowler field beyond name and USBC ID. The `Bowlers` model exists only for this list.
- Counts on the Squads and Sweepers cards (D-50).
- The registration's average, payments, lane positions, gender, date of birth, or any eligibility warning (`REG-04`, D-01). They come with create and change division.
- Paging or server-side filtering. A tournament has a couple of hundred bowlers at most and the filter narrows them (D-49, owner confirmed).
- Page-shaped skeletons. The placeholder bars are generic (D-53).
- Locking the route down. That is the release right after 0.3.0 (D-46, D-52).
- A database constraint for one registration per tournament (Q-26 stays open).
- A change to `GET /v1/tournaments/{id}`, `API-04`, or any vendor route (D-09).
