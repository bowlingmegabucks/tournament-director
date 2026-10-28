# Tournaments

Source: `business logic/Tournaments/`, `business logic/Models/TournamentModel.cs`, `main/Tournaments/`, `main/Controls/TournamentControl.cs`.

## Fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | yes | Made by the app |
| `name` | text | yes | |
| `start` | date | yes | First day. Ages are measured on this date (`BWL-09`) |
| `end` | date | yes | Last day. Squad and sweeper times must fall between `start` 00:00 and `end` 23:59:59 |
| `entryFee` | money, 2 places | yes | Default fee for each squad entry. A squad can override it |
| `games` | integer | yes | Games per qualifying squad. Sweepers set their own |
| `finalsRatio` | decimal, 1 place | yes | 1 in N entries advance |
| `cashRatio` | decimal, 1 place | yes | 1 in N entries cash |
| `superSweeperCashRatio` | decimal, 1 place | yes (stored) | 1 in N super sweeper bowlers cash. Column is `SuperSweperCashRatio` |
| `bowlingCenter` | text | yes | Name of the venue |
| `completed` | boolean | yes | Always false in practice; see `TRN-10` |

The screen limits: fee up to 999.99, games up to 99, ratios up to 99.9.

## Rules

| ID | Rule | Status |
| --- | --- | --- |
| TRN-01 | Name is required. "Name is required" |  |
| TRN-02 | Start must be on or before end. "Start date must be before end date" / "End date must be after start date" |  |
| TRN-03 | Entry fee must be greater than 0. "Entry fee must be greater than $0" |  |
| TRN-04 | Games must be at least 1. "Must have at least one game" |  |
| TRN-05 | Finals ratio must be greater than 1. "Finals ratio must be greater than 1" |  |
| TRN-06 | Cash ratio must be greater than 1. "Cash ratio must be greater than 1" |  |
| TRN-07 | Bowling center is required. "Bowling center is required" |  |
| TRN-08 | A new tournament cannot be marked completed. "Tournament is already completed" |  |
| TRN-09 | Super sweeper cash ratio has **no** validation and defaults to 0. **Defect:** with 0, super sweeper results divide by zero and fail. **D-13:** the new app requires at least 1 on save. **D-17:** existing 0 values stay in the database; their super sweeper results show a clear message instead of crashing. |  |
| TRN-10 | Legacy can only **create** and **list** tournaments. There is no edit, delete, or "complete tournament" action. The `Completed` flag is never set to true. **D-12, D-15:** the new app adds editing and deleting; when each is allowed, and what it affects, is decided when we build it. "Complete tournament" is open (Q-03). |  |
| TRN-11 | The list shows every tournament. The server applies no filter or sort. **D-20:** the new app groups the list (current and upcoming, then past) and sorts it by date. **D-18, D-19, D-21:** the list is not the landing page; Home is. **D-24 to D-28:** row fields, overview page, routes, and where grouping happens. **D-30 to D-35:** the list reads the legacy database through Prisma; bad rows are skipped (D-31). | Done, differs (D-18, D-20, D-28, D-31, D-32) |
| TRN-12 | **Effective values for a squad:** fee = squad fee if set, else tournament fee. Finals ratio and cash ratio work the same way. At-large and seeding always use the tournament finals ratio (`RES-12`). **D-43:** the squad list sends the resolved values with override flags (built); results use them later. | Done, differs (D-43) |

The ratio is "1 in N". With `finalsRatio = 8` and 40 entries, `floor(40 / 8) = 5` advance. Calculations always round down. See [results.md](results.md).

## Screens

- **Tournament list** (start screen): grid of tournaments; "New Tournament" opens the add form; "Open" opens the tournament portal.
- **Add tournament**: all fields above. On success it opens the new tournament's portal.
- **Tournament portal**: menu to divisions, squads, sweepers, registrations, at-large results, seeding, super sweeper results. See [screens.md](screens.md).

## API

`GET /v1/tournaments` and `GET /v1/tournaments/{id}` are public (no API key). They return only what the registration site needs. See [integration-api.md](integration-api.md).
