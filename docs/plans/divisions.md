# Plan: divisions

Branch: `tournamentDivisionsList` (already checked out; the skill's `migrate-divisions` name is not used). Delete this file when the work is done.

This slice lists a tournament's divisions. It reads the legacy `Divisions` table through Prisma. Create, edit, and delete wait for auth (0.3.0) and commands (0.4.0 and up).

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| DIV-12 (list) | In | `GET /v1/tournaments/{id}/divisions`, the Divisions page, `divisions` on the vendor detail |
| DIV-13 | In | Sorted by `number`, then `name` (D-38) |
| DIV-01 to DIV-11 | Later | Checks on add; build with create |
| DIV-12 (add, edit, delete) | Later | D-12, D-15 |
| DIV-14 | Later | Sweepers (`SQD-13`) |
| DIV-15 | Later | New: unique number per tournament on add and edit (D-38); database key at 1.0.0 |
| Eligibility, handicap formula | Later | Registrations, scores |

## Decisions used

- D-09: the vendor shape for `divisions` on `GET /v1/tournaments/{id}` is fixed.
- D-19, D-21, D-22: sidebar item shows only inside a tournament; the tournament is in the URL.
- D-25: each feature adds its array to the detail response.
- D-27: the new router declares `public` access.
- D-30: the Prisma model is written by hand; no `prisma migrate`.
- D-31, D-39: a stored row that breaks the read shape is skipped and logged.
- D-32: a database outage gives 503.
- D-35, D-36: repository tests use Testcontainers; truncate between tests.
- D-37: two routes (vendor shape on the detail; full fields on the web-only route).
- D-38: sort by `number`, then `name`; uniqueness is a later rule.
- D-40: a table page at `/tournaments/{id}/divisions`.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| DIV-12 | Desktop "View divisions" list | A web table; the list is public and read-only | D-40 |
| DIV-13 | Sorted by `number` | Sorted by `number`, then `name` | D-38 |
| DIV-12 | Every stored row shows | A row that breaks the read shape is skipped and logged | D-39 |
| `handicapPercentage` | Stored as a fraction (`0.90`) | API returns a whole percent (`90`) on the web-only route, as the legacy screen shows it | D-37 |

## API

Both routes are public (D-27) and read-only.

| Route | Response | Errors | Vendor-visible |
| --- | --- | --- | --- |
| `GET /v1/tournaments/{id}` | `200 { tournament: { …existing fields…, divisions: [{ id, name, minimumAge, maximumAge, minimumAverage, maximumAverage, gender }] } }` | As today | Yes (`API-04`). Additive: the vendor keeps using the legacy API until cutover (D-25) |
| `GET /v1/tournaments/{id}/divisions` | `200 { divisions: [{ id, number, name, gender, minimumAge, maximumAge, minimumAverage, maximumAverage, handicapPercentage, handicapBase, maximumHandicapPerGame }] }` | `400` id not a UUID; `404 { message: "Tournament not found" }`; `500` the tournament row breaks its shape; `503` database down | No. Web only |

- `gender` is `"Male"`, `"Female"`, or `null` (any). The stored value is 0, 1, or NULL. Any other stored value breaks the read shape.
- Unset limits are `null`. `handicapPercentage` is a whole percent (stored `0.90` becomes `90`); `Math.round` after `× 100` avoids float noise.
- The tournament check reuses `TournamentRepository.get`, so the 404, 500 and 503 cases match `TRN-15`.
- Read shape (D-39): UUID `id`, non-empty `name`, whole `number`, ages and averages whole numbers or null, `gender` 0, 1, or null. A row that fails is skipped and logged with its id and problems. `DIV-01` to `DIV-11` do not run on read.
- Order: `number` ascending, then `name`.
- Observability (`api-observability`): the skip uses `logger.warn` with fields first, as for tournaments. No new metric; HTTP metrics cover the routes.

## Web

Mockups: [index](divisions-mockups/index.html), [list](divisions-mockups/list.html). Open with `open docs/plans/divisions-mockups/index.html`.

- **Sidebar:** a "Divisions" `NavLink` under the tournament name (`aria-current="page"` when active), above "Change tournament".
- **Route:** `tournaments/:id/divisions` as a child of `TournamentLayout`.
- **`DivisionsPage`:** `<h1>Divisions</h1>`, a `<table>` with `<caption class="visually hidden">` and `<th scope="col">` headers: #, Name, Gender, Ages, Averages, Handicap. Name is `<th scope="row">`.
- **Cell text:** `Any` when no limit. Ages and averages: `18 to 39`, `50 and up`, `Up to 17`. Handicap: `Scratch` when percent and base are null; else `90% of 220`, plus `, max 40 a game` when a cap is set.
- **States:** loading (`<output>Loading divisions…</output>`), error (`QueryError` with Try again), empty ("No divisions yet."), filled.
- **Narrow screens:** each row stacks, with `data-label` text before each cell, so there is no sideways scroll at 320px.
- **Hooks and calls:** `divisions/api.ts` (`fetchDivisions`, validates the body shape and reuses `TournamentNotFoundError`), `useDivisions(tournamentId)` with key `['tournaments', id, 'divisions']`.
- **No buttons** for add, edit, or delete (D-21).
- **Title:** `Divisions · <tournament> · Tournament Director`.

## Data

- `api/prisma/schema.prisma`: add `model Division` (all 12 columns, `@map` to the PascalCase names, `@@map("Divisions")`). The model reads the whole table, since it is cheap and later features need it. No Prisma relation to `Tournament` yet.
- No schema change in the database. The unique key waits for 1.0.0 (D-38).
- `api/src/test/legacySchema.ts`: add the `Divisions` table from `database.md`; `resetDatabase` truncates it. Foreign key: truncate children first.
- `api/src/db/seedDivisions.ts`: three sample divisions for each sample tournament: 1 Open (handicap 90% of 220), 2 Women (gender Female, 90% of 220, cap 40), 3 Scratch. `npm run db:seed` runs it after the tournaments. Fixed ids keep reruns from adding rows.
- Web mock data: `createDivision` in `web/src/mocks/data.ts`; a handler for `/v1/tournaments/:id/divisions`.

## Tests

| Rule | Test |
| --- | --- |
| DIV-12 | `api/.../divisions/routes.test.ts`: "lists a tournament's divisions (DIV-12)"; "answers 404 for an unknown tournament"; "answers 400 for an id that is not a UUID"; "puts the vendor-shape divisions on the tournament detail" (and only the vendor fields) |
| DIV-12 | `api/.../divisions/divisionRow.test.ts`: maps gender 0, 1, NULL; maps percent `0.90` to `90`; rejects gender 2, empty name, non-UUID id |
| DIV-12 | `api/.../divisions/prismaRepository.db.test.ts`: reads every column type; skips and logs a bad row (D-39); outage gives 503 |
| DIV-13 | `routes.test.ts` or `repository.test.ts`: "sorts by number (DIV-13)" and "breaks a tie by name (D-38)"; the `.db.test.ts` proves the same order from MariaDB |
| DIV-12 | `api/src/db/seedDivisions.db.test.ts`: seeds three per tournament; a second run adds none |
| DIV-12 | `web/src/features/divisions/api.test.ts`: sends the request, rejects a bad body, maps 404 and 400 to not found |
| DIV-12, DIV-13 | `web/src/features/divisions/DivisionsPage.test.tsx`: loading, error with Try again, empty, filled rows in order, `Scratch` and handicap text, ranges |
| D-40 | `TournamentLayout.test.tsx`: the Divisions link shows inside a tournament and marks the current page |
| DIV-12 | `web/e2e/divisions.spec.ts`: from a tournament, click Divisions and see the table. Add the path to `accessibility.spec.ts` |
| formatting | `web/src/features/divisions/format.test.ts`: age and average ranges, handicap text |

Run `npm run test:mutation` in both folders and fix survivors.

## Steps

1. API: `Division` Prisma model, `npm run db:generate`, `divisionRow.ts`, `types.ts`, `repository.ts` (interface and in-memory), `prismaRepository.ts`, with unit and `.db` tests. Add the `Divisions` table to `legacySchema.ts`.
2. API: `GET /v1/tournaments/:id/divisions` router, mounted in `createApp` as `public`; `divisions` dependency in `AppDependencies`, `server.ts`, and `testApp.ts`. Route tests.
3. API: add `divisions` to the tournament detail (vendor fields only); update `tournamentDetailSchema` and its tests.
4. API: `seedDivisions` and `db:seed` wiring, with its test. Update `docs/api-standards.md` only if the database section lists modeled tables.
5. Web: types, `api.ts`, `useDivisions`, `format.ts`, mocks and handler, with tests.
6. Web: `DivisionsPage` and CSS Module, route in `App.tsx`, sidebar link in `TournamentLayout`, with tests.
7. Web: e2e test and the axe path.
8. Run `npm run check` at the root, e2e in `web/`, and mutation in both folders.

Each step ends green (lint, typecheck, tests, `format:check`). Version: no bump unless a tag exists for the current version (check `git tag`).

## Not doing

- Add, edit, and delete: auth first, then commands.
- A unique index on `(TournamentId, Number)` and the check on add (D-38).
- Sweeper bonus pins (`DIV-14`), eligibility checks, handicap math.
- A division count or detail page per division.
- Prisma relations between `Tournament` and `Division`.
- Filtering, search, or sorting controls in the UI.
