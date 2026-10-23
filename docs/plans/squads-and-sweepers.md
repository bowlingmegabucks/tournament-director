# Plan: squads and sweepers

Branch: `squadSweeperList`. Delete this file when the work is done.

Read-only and public (0.2.0). Add, edit, delete, and Complete wait for auth and commands.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| SQD-21 (new) | In | Squad list route and page |
| SQD-22 (new) | In | Sweeper list route and page, with bonus pins |
| SQD-14 | In (read part) | Lists only; edit and delete Later (D-12, D-15) |
| SQD-20 | In | Sort by date, then starting lane, then id (D-45) |
| TRN-12 | In | Effective fee and ratios for squads (D-43) |
| DIV-14, SQD-13 | In (read part) | Pins per division on the sweeper card (D-45) |
| API-04 | In | `squads` and `sweepers` arrays on the tournament detail (D-41) |
| SQD-01 to SQD-13 | Later | Add commands (0.4.0+) |
| SQD-15 to SQD-18 | Later | Complete and lock. The lists only show the status |
| SQD-19, lanes, scores, results | Later | Own features |

## Decisions used

- D-09: the vendor shapes do not change.
- D-19, D-21, D-22, D-23: sidebar links, no buttons, no card links until the session pages exist.
- D-25: detail arrays are additive.
- D-27: new routers carry the `public` access label.
- D-30: hand-written Prisma schema, one model per slice; no `prisma migrate`.
- D-32, D-40: 503 on outage, 404 for an unknown tournament, same page states.
- D-41: three routes. D-42: bad rows skipped and logged. D-43: effective values with override flags. D-44: card fields and pages. D-45: order and bonus pins.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| SQD-21, SQD-22 | No list rule; the desk picks from a list screen | Public read-only lists on the web | D-41, D-44 |
| SQD-20 | Same-date order undefined | Tie broken by starting lane, then id | D-45 |
| TRN-12 | Each screen resolves the override | The API resolves it and flags overrides | D-43 |
| SQD-13 | Add screen lists every division | List shows only divisions with pins other than 0 | D-45 |
| Bad rows | Not applicable | Skipped and logged | D-42 |

## API

All three are public (D-27).

| Route | Response | Errors | Vendor-visible |
| --- | --- | --- | --- |
| `GET /v1/tournaments/{id}/squads` | `200 { squads: [{ id, date, complete, startingLane, numberOfLanes, maxPerPair, entryFee, entryFeeOverridden, finalsRatio, finalsRatioOverridden, cashRatio, cashRatioOverridden }] }` | `400` not a UUID; `404` unknown tournament; `500` bad tournament row; `503` database down | No |
| `GET /v1/tournaments/{id}/sweepers` | `200 { sweepers: [{ id, date, complete, startingLane, numberOfLanes, maxPerPair, entryFee, games, cashRatio, bonusPins: [{ divisionId, divisionName, bonusPinsPerGame }] }] }` | Same | No |
| `GET /v1/tournaments/{id}` | Adds `squads: [{ id, date, entryFee }]` (`entryFee` null = tournament fee) and `sweepers: [{ id, date, entryFee, games }]` | As today | Yes (`API-04`), additive |

- `date` is local time with no zone: `2026-10-10T09:00:00`, as `API-04` shows.
- `bonusPins` holds only divisions with pins other than 0, in division order (`DIV-13`). A missing row, NULL, or stored 0 is left out, so the list can be empty.
- Squads and sweepers sort by date, then `startingLane`, then `id`.

## Web

Mockups (open `docs/plans/squads-and-sweepers-mockups/index.html`): `squads.html`, `sweepers.html`. Each shows loaded, loading, empty, and error.

- Sidebar: "Squads" and "Sweepers" links under "Divisions", current page marked.
- `/tournaments/{id}/squads` and `/sweepers`: `<h1>`, then a `<ul>` of cards. Each card has an `<h2>` with the date and time and an Open or Complete word, then a `<dl>` of facts. A sweeper card adds an `<h3>` "Bonus pins per game" and a list of the divisions with pins.
- A sweeper with no pins shows "No bonus pins" in place of the list.
- Overrides read `$60.00 (override)`; plain values carry no mark.
- Loading `<output>`; error through `QueryError` with Try again; empty "No squads yet." and "No sweepers yet."
- Files: `web/src/features/squads/` and `sweepers/` hold page, `api.ts`, hook, `types.ts`, tests. Both pages need the same date, lane, and ratio formatting and card styles, so those go in `web/src/shared/sessionFormat.ts` and `SessionList.module.css`.
- MSW handlers and `createDemoSquads` / `createDemoSweepers` factories in `web/src/mocks/`.

## Data

- `schema.prisma` gains `Squad` (all `Squads` columns; `squadType` as `Int`) and `SweeperDivision` (composite id `[sweeperId, divisionId]`), and `Tournament` gains `finalsRatio` and `cashRatio` (`Decimal(3,1)`), which the resolver needs. No schema change in the database.
- Squad type 0 maps to a squad, 1 to a sweeper; any other value is skipped (D-42).
- The repository reads the tournament's fee and ratios itself; the vendor `Tournament` type does not change.
- Seed: `seedSessions.ts` adds, per sample tournament, 3 squads (one overrides fee and finals ratio, one complete) and 2 sweepers with pins for some divisions; running twice adds nothing.

## Tests

| Rule | Test |
| --- | --- |
| SQD-21 list and 404/400/500/503 | `api/src/features/squads/routes.test.ts`: "lists squads sorted by date (SQD-21, SQD-20)", "returns 404 for an unknown tournament", "returns 400 for an id that is not a UUID" |
| SQD-20 tie | `squads/repository.test.ts`: "breaks a date tie by starting lane, then id (SQD-20)" |
| TRN-12, D-43 | `squads/squadRow.test.ts`: "uses the squad value when set and flags it (TRN-12)", "uses the tournament value when null" |
| D-42 bad rows | `squads/squadRow.test.ts` and `sweepers/sweeperRow.test.ts`: unknown type, sweeper missing fee, bad id |
| SQD-22 + pins | `sweepers/routes.test.ts`: "lists only divisions with nonzero pins (SQD-22, DIV-14)", "returns an empty list when every pin is 0 or missing"; `sweeperRow.test.ts`: "ignores a row for another tournament's division" |
| Types and mapping | `prismaRepository.db.test.ts` in both features (decimals, dates, skipped rows, outage) |
| API-04 arrays | `api/src/features/tournaments/routes.test.ts`: "detail carries vendor-shape squads and sweepers (API-04)" |
| Seed | `api/src/db/seedSessions.db.test.ts`: "adds squads and sweepers once" |
| Web pages | `SquadsPage.test.tsx`, `SweepersPage.test.tsx`: loaded, loading, empty, error with retry, override mark, bonus pins listed only when not 0, "No bonus pins" when none (SQD-21, SQD-22); `sessionFormat.test.ts`; `api.test.ts` for each |
| Sidebar | `TournamentLayout.test.tsx`: links present, current page marked |
| E2E | `web/e2e/tournaments.spec.ts` journey; `accessibility.spec.ts` gains both paths |

## Steps

1. Prisma: add the models and tournament fields; `npm run db:generate`.
2. `api/squads`: types (Zod), row mapper, repository (in-memory and Prisma), router, tests.
3. `api/sweepers`: same, with bonus pins.
4. Mount both routers with the `public` label in `createApp` and `server.ts`.
5. Tournament detail: add the vendor arrays and tests.
6. Seed: `seedSessions.ts`, wire into `db:seed`, tests.
7. Web: shared format and card styles; mocks; `squads/` feature; `sweepers/` feature; routes; sidebar links; tests.
8. E2E and axe; run `npm run check`; mutation tests on new logic.
9. Record (Phase 5).

Each step ends green.

## Not doing

- Add, edit, delete, and Complete buttons (auth, 0.3.0; commands, 0.4.0+).
- Squad and sweeper pages, lane assignments, scores, results, and card links.
- Registration counts per session (needs the registrations feature).
- A database change, a `SweeperDivision` index, or a rename of `SuperSweperCashRatio`.
