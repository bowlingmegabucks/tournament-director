# Squads and sweepers

Built on branch `squadSweeperList`. Migration source: [docs/migration/squads-and-sweepers.md](../migration/squads-and-sweepers.md).

This slice is read-only and public (0.2.0). The API reads the legacy `Squads` table (squads and sweepers share it, told apart by `SquadType`) and the `SweeperDivision` table through Prisma (D-30). Adding, editing, deleting, and completing wait for sign-in (0.3.0) and commands (0.4.0 and up).

## Fields

What `GET /v1/tournaments/{id}/squads` returns for a squad.

| Field                                                       | Type    | Notes                                                                           |
| ----------------------------------------------------------- | ------- | ------------------------------------------------------------------------------- |
| `id`                                                        | UUID    |                                                                                 |
| `date`                                                      | text    | The center's local time with no zone: `2026-10-24T09:00:00`                     |
| `complete`                                                  | boolean | Shown as Open or Complete                                                       |
| `startingLane`, `numberOfLanes`, `maxPerPair`               | integer | A stored 0 for `numberOfLanes` shows as "Not set"; a first lane of 0 shows just the count ("12 lanes")                               |
| `entryFee`, `finalsRatio`, `cashRatio`                      | number  | The squad's own value if set, else the tournament's (`TRN-12`)                  |
| `entryFeeOverridden`, `finalsRatioOverridden`, `cashRatioOverridden` | boolean | True when the squad sets its own value. The card adds "(override)"      |

What `GET /v1/tournaments/{id}/sweepers` returns for a sweeper.

| Field                                         | Type    | Notes                                                                   |
| --------------------------------------------- | ------- | ----------------------------------------------------------------------- |
| `id`, `date`, `complete`, lanes, `maxPerPair` | as above |                                                                        |
| `entryFee`, `games`, `cashRatio`              | number  | The sweeper's own; never inherited (D-43)                               |
| `bonusPins`                                   | list    | `{ divisionId, divisionName, bonusPinsPerGame }`, only where pins are not 0, in division order |

The vendor detail route (`API-04`) carries only `id, date, entryFee` per squad (`entryFee` is `null` when the squad uses the tournament fee) and `id, date, entryFee, games` per sweeper (D-41, D-09).

A stored row is read when it has a UUID `id` and a valid date; a sweeper also needs a fee, games, and a cash ratio. Any other row is skipped and logged with its id (D-42). The vendor arrays on the tournament detail come from the same read, so a skipped row is missing there too. A row whose `SquadType` is not 0 (squad) or 1 (sweeper) is never read. `SQD-01` to `SQD-12` run on save, not on read, so an odd lane count or a date outside the tournament still shows.

## Rules

| ID      | Requirement | Differs from legacy | Tests |
| ------- | ----------- | ------------------- | ----- |
| SQD-21 (new) | `GET /v1/tournaments/{id}/squads` returns `{ squads: [...] }` for the tournament, public and read only. An unknown tournament gives 404 `{ message: "Tournament not found" }`, an id that is not a UUID 400, a stored tournament that breaks its shape 500, a database outage 503. The Squads page shows one card per squad: date and time with Open or Complete, lanes, bowlers per pair, entry fee, finals ratio, cash ratio. A value the squad overrides reads `(override)`. Empty: "No squads yet." The date on each card links to the squad's page (D-60); the page has no buttons (D-44). | New: legacy has no list rule (D-41); bad rows skipped (D-42); effective values with flags (D-43) | `api/src/features/squads/routes.test.ts`, `squadRow.test.ts`, `types.test.ts`, `repository.test.ts`, `prismaRepository.db.test.ts`; `api/src/db/seedSessions.db.test.ts`, `seed.db.test.ts`; `web/src/features/squads/SquadsPage.test.tsx`, `api.test.ts`; `web/src/shared/sessionFormat.test.ts`; `web/src/features/tournaments/TournamentLayout.test.tsx`; `web/e2e/tournaments.spec.ts`, `web/e2e/accessibility.spec.ts` |
| SQD-22 (new) | `GET /v1/tournaments/{id}/sweepers` returns `{ sweepers: [...] }` with the same errors. The Sweepers page shows one card per sweeper: date and time with Open or Complete, lanes, bowlers per pair, entry fee, games, cash ratio, and "Bonus pins per game" listing each division with pins other than 0, such as `Open: +10`. A division with no stored row, a NULL, or a 0 is not listed, so a missing division means 0. A sweeper with none shows "No bonus pins". Empty: "No sweepers yet." | New (D-41); bad rows skipped, including a sweeper with no fee, games, or cash ratio (D-42); only nonzero pins shown (D-45) | `api/src/features/sweepers/routes.test.ts`, `sweeperRow.test.ts`, `types.test.ts`, `repository.test.ts`, `prismaRepository.db.test.ts`; `api/src/db/seedSessions.db.test.ts`; `web/src/features/sweepers/SweepersPage.test.tsx`, `api.test.ts`; `web/e2e/tournaments.spec.ts`, `web/e2e/accessibility.spec.ts` |
| SQD-20  | Squads and sweepers sort by `date`, then `startingLane`, then `id`. The API sorts, so the web app and the vendor see one order. | Yes: legacy leaves two sessions at one time in no defined order (D-45) | `api/src/shared/sessions.test.ts`, `api/src/features/squads/repository.test.ts`, `sweepers/repository.test.ts`, `prismaRepository.db.test.ts` (both); `web/src/features/sweepers/SweepersPage.test.tsx` |
| TRN-12 (squad read) | A squad's fee, finals ratio, and cash ratio are its own value if set, else the tournament's. The squad list sends the result with an override flag for each. A stored fee of 0 counts as set. | Yes: the API resolves it, where legacy screens did (D-43) | `api/src/features/squads/squadRow.test.ts`, `prismaRepository.db.test.ts`; `web/src/features/squads/SquadsPage.test.tsx` |
| DIV-14 (read part) | The sweeper list shows bonus pins per division from `SweeperDivision`. Only divisions of the sweeper's own tournament count. | Yes: nonzero only (D-45) | `api/src/features/sweepers/sweeperRow.test.ts`, `prismaRepository.db.test.ts`; `web/src/features/sweepers/SweepersPage.test.tsx` |
| API-04 (arrays) | The tournament detail carries `squads` and `sweepers` in the vendor shape, additive to the existing response. | Done, differs: see D-25 | `api/src/features/tournaments/routes.test.ts`, `types.test.ts`; `api/src/features/squads/types.test.ts`, `sweepers/types.test.ts` |

## API

| Route                                | Response                                                                                                                                                                | Errors                                                                                    | Vendor-visible                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------- |
| `GET /v1/tournaments/{id}/squads`    | `200 { squads: [{ id, date, complete, startingLane, numberOfLanes, maxPerPair, entryFee, entryFeeOverridden, finalsRatio, finalsRatioOverridden, cashRatio, cashRatioOverridden }] }` | `400` not a UUID; `404` unknown tournament; `500` bad tournament row; `503` database down | No. Web only                    |
| `GET /v1/tournaments/{id}/sweepers`  | `200 { sweepers: [{ id, date, complete, startingLane, numberOfLanes, maxPerPair, entryFee, games, cashRatio, bonusPins: [{ divisionId, divisionName, bonusPinsPerGame }] }] }` | Same                                                                                      | No. Web only                    |
| `GET /v1/tournaments/{id}`           | Adds `squads: [{ id, date, entryFee }]` and `sweepers: [{ id, date, entryFee, games }]` to the tournament                                                                | As in [tournaments.md](tournaments.md)                                                    | Yes (`API-04`). Additive (D-25) |

All are public (D-27). The API's `types.ts` and the web app's `types.ts` carry the same fields; change both together.

## Screens

- **Squads** (`/tournaments/{id}/squads`) and **Sweepers** (`/tournaments/{id}/sweepers`): a list of cards, reached from the "Squads" and "Sweepers" links in the tournament sidebar, which mark the current page. Loading, error with Try again, and empty states. No add, edit, delete, or Complete button until sign-in exists (D-21), and the date on each card links to the session's page (`LAN-15`, D-60).

## Local data

`npm run db:seed` adds three squads (one complete, one overriding fee and finals ratio, one with its own cash ratio and lane range) and two sweepers (one with pins on Open and Women; one with a NULL, a 0, and a Women row) to each of the four sample tournaments. Running it twice adds nothing.

## Not built yet

`SQD-01` to `SQD-13` (add and their checks, including the pins box on the add screen), `SQD-14` edit and delete (D-12, D-15), `SQD-15` to `SQD-18` (complete and lock; the lists only show the status), `SQD-19`, the squad and sweeper pages with lane assignments, scores, and results (the header and tabs in D-22), entry counts on the cards, and Q-10 and Q-11 (open).
