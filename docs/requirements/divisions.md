# Divisions

Built on branch `tournamentDivisionsList`. Migration source: [docs/migration/divisions.md](../migration/divisions.md).

This slice is read-only and public (0.2.0). The API reads the legacy `Divisions` table in the MariaDB database through Prisma (D-30). Adding, editing, and deleting wait for sign-in (0.3.0) and commands (0.4.0 and up).

## Fields

What `GET /v1/tournaments/{id}/divisions` returns for a division.

| Field                              | Type             | Required | Notes                                        |
| ---------------------------------- | ---------------- | -------- | -------------------------------------------- |
| `id`                               | UUID             | yes      |                                              |
| `number`                           | integer          | yes      | Display order. Not unique in old data (D-38) |
| `name`                             | text             | yes      | Not empty                                    |
| `gender`                           | `Male`, `Female` | no       | `null` means any. Stored as 0, 1, or NULL    |
| `minimumAge`, `maximumAge`         | integer          | no       | Age on the tournament start date             |
| `minimumAverage`, `maximumAverage` | integer          | no       |                                              |
| `handicapPercentage`               | integer          | no       | A whole percent: stored `0.90` is `90`       |
| `handicapBase`                     | integer          | no       | The score handicap counts up to              |
| `maximumHandicapPerGame`           | integer          | no       | Cap on handicap per game                     |

The vendor detail route (`API-04`) carries only `id, name, minimumAge, maximumAge, minimumAverage, maximumAverage, gender` per division (D-37, D-09).

A stored row is read when it has a UUID `id`, a non-empty `name`, a whole `number`, whole-number limits or NULL, and a gender of 0, 1, or NULL. Any other row is skipped and logged with its id (D-39). `DIV-01` to `DIV-11` do not run on read, so a stored number of 0 or an odd age range still shows.

## Rules

| ID            | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Differs from legacy                                                                                                              | Tests                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DIV-12 (list) | `GET /v1/tournaments/{id}/divisions` returns `{ divisions: [...] }` for the tournament, public and read only. An unknown tournament gives 404 `{ message: "Tournament not found" }`, an id that is not a UUID 400, a stored tournament that breaks its shape 500, a database outage 503. `GET /v1/tournaments/{id}` also carries the vendor-shape `divisions` array. The Divisions page shows a table with number, name, gender, ages, averages, and handicap (`Any` for no limit, `Scratch` for no handicap, `90% of 220, max 40 a game`). Empty: "No divisions yet." Add, edit, and delete are not built. | Yes: two routes (D-37), bad rows skipped (D-39), a web table with no buttons (D-40); percent shown whole as legacy's screen does | `api/src/features/divisions/routes.test.ts`, `divisionRow.test.ts`, `types.test.ts`, `prismaRepository.db.test.ts`; `api/src/features/tournaments/routes.test.ts`; `api/src/db/seedDivisions.db.test.ts`; `web/src/features/divisions/DivisionsPage.test.tsx`, `api.test.ts`, `format.test.ts`; `web/src/features/tournaments/TournamentLayout.test.tsx`; `web/e2e/tournaments.spec.ts`, `web/e2e/accessibility.spec.ts` |
| DIV-13        | Divisions are sorted by `number`, then `name`. The API sorts, so the web app and the vendor see one order.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Yes: the name breaks a tie, since old rows may share a number (D-38)                                                             | `api/src/features/divisions/repository.test.ts`, `prismaRepository.db.test.ts`, `routes.test.ts`; `web/src/features/divisions/DivisionsPage.test.tsx`; `web/e2e/tournaments.spec.ts`                                                                                                                                                                                                                                     |

## API

| Route                                | Response                                                                                                                                                              | Errors                                                                                    | Vendor-visible                  |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------- |
| `GET /v1/tournaments/{id}/divisions` | `200 { divisions: [{ id, number, name, gender, minimumAge, maximumAge, minimumAverage, maximumAverage, handicapPercentage, handicapBase, maximumHandicapPerGame }] }` | `400` not a UUID; `404` unknown tournament; `500` bad tournament row; `503` database down | No. Web only                    |
| `GET /v1/tournaments/{id}`           | `200 { tournament: { …, divisions: [{ id, name, minimumAge, maximumAge, minimumAverage, maximumAverage, gender }] } }`                                                | As in [tournaments.md](tournaments.md)                                                    | Yes (`API-04`). Additive (D-25) |

Both are public (D-27). The API's `types.ts` and the web app's `types.ts` carry the same fields; change both together.

## Screens

- **Divisions** (`/tournaments/{id}/divisions`): a table, reached from the "Divisions" link in the tournament sidebar, which is marked as the current page there. Loading, error with Try again, and empty states. On narrow screens each row becomes a card. No add, edit, or delete button until sign-in exists (D-21).

## Local data

`npm run db:seed` adds Open, Women, and Scratch divisions to each of the four sample tournaments. Running it twice adds nothing.

## Not built yet

`DIV-01` to `DIV-11` (add and their checks), `DIV-12` add, edit, and delete (D-12, D-15), `DIV-14` (the add screen's pins box; the read part is in [squads-and-sweepers.md](squads-and-sweepers.md)), `DIV-15` (new: a unique number per tournament on add and edit, D-38; the database key waits for 1.0.0), eligibility checks at registration, and the handicap formula.
