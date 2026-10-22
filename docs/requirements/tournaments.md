# Tournaments

Built on branches `landingPage` and `tournamentList`. Migration source: [docs/migration/tournaments.md](../migration/tournaments.md).

This slice is read-only and public (0.2.0). The API reads the legacy `Tournaments` table in the MariaDB database through Prisma (D-26, D-30). Creating, editing, and deleting wait for sign-in (0.3.0) and commands (0.4.0 and up).

## Fields

What the API returns for a tournament. Dates are `YYYY-MM-DD`, with no time zone.

| Field           | Type        | Required | Notes                         |
| --------------- | ----------- | -------- | ----------------------------- |
| `id`            | UUID        | yes      |                               |
| `name`          | text        | yes      |                               |
| `startDate`     | date        | yes      | First day                     |
| `endDate`       | date        | yes      | Last day                      |
| `entryFee`      | number, > 0 | yes      | Default fee for a squad entry |
| `bowlingCenter` | text        | yes      | Name of the venue             |

These are the vendor summary fields (D-24, D-09). Games, the three ratios, and `completed` appear when a feature needs them.

How a stored row becomes those fields:

| Column          | Field                  | Notes                                                       |
| --------------- | ---------------------- | ----------------------------------------------------------- |
| `Id`            | `id`                   | `char(36)`                                                  |
| `Name`          | `name`                 |                                                             |
| `Start`, `End`  | `startDate`, `endDate` | `datetime(6)` at midnight, read as UTC, cut to `YYYY-MM-DD` |
| `EntryFee`      | `entryFee`             | `decimal(5,2)` to a number                                  |
| `BowlingCenter` | `bowlingCenter`        |                                                             |

The other columns (`Games`, the ratios, `Completed`, `SuperSweperCashRatio`) are not read yet (D-30).

## Rules

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Differs from legacy                                                                                                                                               | Tests                                                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TRN-11 | `GET /v1/tournaments` returns every stored tournament as `{ tournaments: [...] }`, with no filter or sort. Public. A stored row that breaks the vendor shape (empty name, fee 0, unreadable date, id that is not a UUID) is skipped and logged with its id. If the database cannot be reached the route answers 503 `{ message: "Database unavailable" }`. The web app reads this route and rejects a body of the wrong shape.                                     | Yes: Home, not the list, is the start page (D-18, D-21); the web app groups and sorts the list (D-20, D-28); bad rows are skipped (D-31); outage gives 503 (D-32) | `api/src/features/tournaments/tournamentRow.test.ts`, `prismaRepository.db.test.ts`, `routes.test.ts`, `types.test.ts`; `web/src/features/tournaments/api.test.ts`, `TournamentsPage.test.tsx`; `web/e2e/tournaments.spec.ts` |
| TRN-13 | New. The Tournaments page shows **Current and upcoming** (end date is today or later, soonest first) above **Past** (newest first). "Today" is the browser's local date. Empty groups: "None right now."; no Past heading when there are none; "No tournaments yet." when there are none at all.                                                                                                                                                                   | New rule (D-20, D-28)                                                                                                                                             | `web/src/features/tournaments/groupTournaments.test.ts`, `TournamentsPage.test.tsx`, `format.test.ts`, `web/src/shared/today.test.ts`                                                                                         |
| TRN-14 | New. Home shows a card for the tournament in progress, else the next upcoming one, with an "In progress" or "Upcoming" badge, dates, center, fee, and a link to it. If none is current: "No tournament is current or upcoming." and a link to all tournaments. If there are none at all: "No tournaments yet."                                                                                                                                                     | New rule (D-18)                                                                                                                                                   | `web/src/features/tournaments/groupTournaments.test.ts`, `web/src/features/home/HomePage.test.tsx`; `web/e2e/tournaments.spec.ts`                                                                                             |
| TRN-15 | New. `GET /v1/tournaments/{id}` returns `{ tournament }`. An unknown id gives 404 `{ message: "Tournament not found" }`; an id that is not a UUID gives 400; a stored row that breaks the vendor shape gives 500 (the id and problems go to the log); a database outage gives 503. The overview page at `/tournaments/{id}` shows name, dates, center, and fee. The detail response has no divisions, squads, or sweepers yet; each feature adds its array (D-25). | New rule (D-24, D-25, D-31, D-32). Matches `API-04` except the missing arrays                                                                                     | `api/src/features/tournaments/routes.test.ts`, `prismaRepository.db.test.ts`; `web/src/features/tournaments/api.test.ts`, `TournamentLayout.test.tsx`                                                                         |
| TRN-16 | New. `GET /ready` runs `SELECT 1` and answers `{ status: "ok" }`, or 503 `{ message: "Database unavailable" }` while the database cannot be reached. Public. `GET /health` never touches the database, so an outage does not restart the app.                                                                                                                                                                                                                      | New rule (D-32)                                                                                                                                                   | `api/src/shared/readyRoutes.test.ts`, `database.test.ts`, `database.db.test.ts`                                                                                                                                               |
| TRN-17 | New. `DATABASE_URL` (`mariadb://USER:PASSWORD@HOST:3306/DATABASE`) is required. Without a valid one the API does not start, and the error never prints the password. There is no demo-data fallback.                                                                                                                                                                                                                                                               | New rule (D-33)                                                                                                                                                   | `api/src/config.test.ts`                                                                                                                                                                                                      |
| TRN-18 | New. `npm run db:seed` puts four sample tournaments (one upcoming, three past) in the local database. Running it twice adds nothing. Local use only; you create the tables first.                                                                                                                                                                                                                                                                                  | New rule (D-34)                                                                                                                                                   | `api/src/db/seedTournaments.db.test.ts`                                                                                                                                                                                       |

## API

| Route                      | Response                                                                           | Errors                                                                                                 | Vendor-visible |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------- |
| `GET /v1/tournaments`      | `200 { tournaments: [{ id, name, startDate, endDate, entryFee, bowlingCenter }] }` | `503` database down                                                                                    | Yes (`API-03`) |
| `GET /v1/tournaments/{id}` | `200 { tournament: { …same fields… } }`                                            | `400` not a UUID; `404 { message: "Tournament not found" }`; `500` bad stored row; `503` database down | Yes (`API-04`) |

The shapes are fixed by D-09. The API's `types.ts` and the web app's `types.ts` carry the same fields; change both together, and only after a vendor change doc. The old demo route `GET /tournaments` is removed. The 503 is new, and appears only while the database is down. `GET /ready` (`TRN-16`) is not part of the vendor contract.

## Screens

- **Home** (`/`): the current tournament card, and a link to all tournaments. The Check API button is gone (D-29). See TRN-14.
- **Tournaments** (`/tournaments`): the two groups. Each row is a card with a badge (current and upcoming only), the name as a link, then dates, center, and fee. Loading, error with Try again, and empty states. See TRN-13.
- **Tournament overview** (`/tournaments/{id}`): name, dates, center, fee, beside the tournament sidebar. Not-found and error states. See TRN-15 and [navigation.md](navigation.md).

## Not built yet

`TRN-01` to `TRN-09` (create form and its checks), `TRN-10` (edit, delete, complete; Q-03), `TRN-12` (squad overrides). There is no New tournament button until sign-in exists.
