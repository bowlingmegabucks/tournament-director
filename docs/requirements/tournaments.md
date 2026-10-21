# Tournaments

Built on branch `landingPage`. Migration source: [docs/migration/tournaments.md](../migration/tournaments.md).

This slice is read-only and public (0.2.0). The data is demo data built from today's date (D-26); the next run connects the legacy database. Creating, editing, and deleting wait for sign-in (0.3.0) and commands (0.4.0 and up).

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

## Rules

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                                             | Differs from legacy                                                                                         | Tests                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TRN-11 | `GET /v1/tournaments` returns every tournament as `{ tournaments: [...] }`, with no filter or sort. Public. The web app reads this route and rejects a body of the wrong shape.                                                                                                                                                                                                                         | Yes: Home, not the list, is the start page (D-18, D-21); the web app groups and sorts the list (D-20, D-28) | `api/src/features/tournaments/routes.test.ts`, `types.test.ts`; `web/src/features/tournaments/api.test.ts`, `TournamentsPage.test.tsx`; `web/e2e/tournaments.spec.ts` |
| TRN-13 | New. The Tournaments page shows **Current and upcoming** (end date is today or later, soonest first) above **Past** (newest first). "Today" is the browser's local date. Empty groups: "None right now."; no Past heading when there are none; "No tournaments yet." when there are none at all.                                                                                                        | New rule (D-20, D-28)                                                                                       | `web/src/features/tournaments/groupTournaments.test.ts`, `TournamentsPage.test.tsx`, `format.test.ts`, `web/src/shared/today.test.ts`                                 |
| TRN-14 | New. Home shows a card for the tournament in progress, else the next upcoming one, with an "In progress" or "Upcoming" badge, dates, center, fee, and a link to it. If none is current: "No tournament is current or upcoming." and a link to all tournaments. If there are none at all: "No tournaments yet." Home also keeps the Check API button until the API reads the production database (D-29). | New rule (D-18)                                                                                             | `web/src/features/tournaments/groupTournaments.test.ts`, `web/src/features/home/HomePage.test.tsx`; `web/e2e/tournaments.spec.ts`                                     |
| TRN-15 | New. `GET /v1/tournaments/{id}` returns `{ tournament }`. An unknown id gives 404 `{ message: "Tournament not found" }`; an id that is not a UUID gives 400. The overview page at `/tournaments/{id}` shows name, dates, center, and fee. The detail response has no divisions, squads, or sweepers yet; each feature adds its array (D-25).                                                            | New rule (D-24, D-25). Matches `API-04` except the missing arrays                                           | `api/src/features/tournaments/routes.test.ts`, `repository.test.ts`; `web/src/features/tournaments/api.test.ts`, `TournamentLayout.test.tsx`                          |

## API

| Route                      | Response                                                                           | Errors                                                      | Vendor-visible |
| -------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------- |
| `GET /v1/tournaments`      | `200 { tournaments: [{ id, name, startDate, endDate, entryFee, bowlingCenter }] }` | none                                                        | Yes (`API-03`) |
| `GET /v1/tournaments/{id}` | `200 { tournament: { …same fields… } }`                                            | `400` not a UUID; `404 { message: "Tournament not found" }` | Yes (`API-04`) |

The shapes are fixed by D-09. The API's `types.ts` and the web app's `types.ts` carry the same fields; change both together, and only after a vendor change doc. The old demo route `GET /tournaments` is removed.

## Screens

- **Home** (`/`): the current tournament card, a link to all tournaments, and a System section with Check API. See TRN-14.
- **Tournaments** (`/tournaments`): the two groups. Each row is a card with a badge (current and upcoming only), the name as a link, then dates, center, and fee. Loading, error with Try again, and empty states. See TRN-13.
- **Tournament overview** (`/tournaments/{id}`): name, dates, center, fee, beside the tournament sidebar. Not-found and error states. See TRN-15 and [navigation.md](navigation.md).

## Not built yet

`TRN-01` to `TRN-09` (create form and its checks), `TRN-10` (edit, delete, complete; Q-03), `TRN-12` (squad overrides). There is no New tournament button until sign-in exists.
