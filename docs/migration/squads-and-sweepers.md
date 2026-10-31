# Squads and sweepers

A **squad** is a qualifying session. A **sweeper** is a side event with its own fee, games, and prize pool. Both are rows in the `Squads` table (`SquadType` 0 and 1) and share lane assignment and score entry.

Source: `business logic/Squads/`, `business logic/Sweepers/`, `business logic/Database/Entities/*Squad*.cs`, `presentation/Squads/`, `presentation/Sweepers/`, `main/Squads/`, `main/Sweepers/`.

## Fields

### Shared

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | |
| `tournamentId` | UUID | |
| `date` | date and time | When the session starts. Sessions sort by this everywhere |
| `maxPerPair` | integer | Bowlers per lane pair. The lane screen supports 2 to 5 only (`LAN-02`) |
| `startingLane` | integer | First lane used. Odd |
| `numberOfLanes` | integer | Lanes used. Even |
| `complete` | boolean | See `SQD-15` to `SQD-18` |

### Squad only

| Field | Type | Notes |
| --- | --- | --- |
| `entryFee` | money, nullable | Override; NULL means the tournament fee |
| `finalsRatio` | decimal, nullable | Override; NULL means the tournament ratio |
| `cashRatio` | decimal, nullable | Override; NULL means the tournament ratio |

A squad has no game count. It always uses the tournament's `games`.

### Sweeper only

| Field | Type | Notes |
| --- | --- | --- |
| `entryFee` | money | Required. Column `SweeperEntryFee` |
| `games` | integer | Required |
| `cashRatio` | decimal | Required |
| `divisions` | map of division → bonus pins per game | `SweeperDivision` rows. NULL pins count as 0 |

## Validation when adding a squad

| ID | Rule | Message |
| --- | --- | --- |
| SQD-01 | Tournament exists and matches | "Tournament Id is required", "Tournament Id does not match" |
| SQD-02 | Finals ratio, if set, > 1. Cash ratio, if set, > 1 | "Finals ratio must be greater than 1", "Cash ratio must be greater than 1" |
| SQD-03 | Date is on or after tournament start (00:00) and on or before tournament end (end of day) | "Squad date must be after tournament start", "...before tournament end" |
| SQD-04 | Max per pair > 0 | "Max per pair must be greater than 0" |
| SQD-05 | Number of lanes > 0 and even | "Number of lanes must be greater than 0", "Number of lanes must be even" |
| SQD-06 | Starting lane > 0 and odd | "Starting lane must be greater than 0", "Starting lane must be odd" |
| SQD-07 | Not complete | "Cannot add a completed squad" |
| SQD-08 | Entry fee override has no rule beyond the screen (0 to 999.99) | |

## Validation when adding a sweeper

| ID | Rule | Message | Status |
| --- | --- | --- | --- |
| SQD-10 | Same as `SQD-01`, `SQD-03` to `SQD-07` (with "Sweeper" in the messages) | | |
| SQD-11 | Cash ratio > 1 (required) | "Cash ratio must be greater than 1" | |
| SQD-12 | Games > 0; entry fee > 0 | "Games must be greater than 0", "Entry fee must be greater than $0" | |
| SQD-13 | The add screen lists every division of the tournament with a bonus-pins box. Each saves as a `SweeperDivision` row. **D-45:** the sweeper list shows each division with pins other than 0 (read part built). | | |

## Behavior

| ID | Rule | Status |
| --- | --- | --- |
| SQD-14 | Legacy can only **add** squads and sweepers. No edit or delete. **D-12:** the new app adds editing; a squad or sweeper with any scores is locked from editing. Field-by-field rules are decided when we build it. **D-41 to D-45:** the read-only lists are built (`SQD-21`, `SQD-22`). **D-15:** deleting is allowed too; when, and what happens to registrations, is part of the same discussion. |  |
| SQD-15 | **Complete a squad.** Confirm: "Are you sure you want to complete this squad?" Sets `complete`. Then, for every bowler registered to the squad who has **no** scores in it, saves a score of **0** for each game 1 to `tournament.games`. Bowlers with some games entered get nothing filled in. |  |
| SQD-16 | **Complete a sweeper.** Sets `complete` only. No zeros are filled in. The menu item hides once the sweeper is complete; the squad menu item does not hide. |  |
| SQD-17 | **What "complete" locks.** On the desk: lane assignment is read-only, and score paste and save are off. The add registration screen hides complete sessions. API update refuses to add complete sessions (`REG-33`). Adding super sweeper is refused if any of the bowler's sweepers are complete (`REG-17`). The **server** does not block score saves or lane moves on complete sessions; only the screens do. **D-10:** the new server locks a complete session: no score changes, lane moves, removals, or refunds. |  |
| SQD-18 | There is no way to undo "complete". |  |
| SQD-19 | Results do not wait for "complete". They use whatever scores exist (`RES-01`). **D-84:** the results page marks them "Unofficial results" until the session is complete. | Done, differs (D-84) |
| SQD-20 | Order between squads is by `date`. "Earlier squad" in the results rules means an earlier `date`. Two squads with the same date and time have no defined order. **D-45:** the new app breaks a tie by `startingLane`, then `id`. | Done, differs (D-45) |

**Why zeros for no-shows matter:** the zeros make the no-show an entry. Entries drive how many advance and cash (`RES-02`). So a paid no-show still adds to the prize spots. **D-06:** keep this. A refunded entry is removed from the squad instead, so it stops counting. Refunds must happen before the squad is completed (D-10, D-11).

## Lists (new)

Legacy has no list rule; the desk picks a session from a list screen (see [screens.md](screens.md)). These two rules are new (D-41 to D-45).

| ID | Rule | Status |
| --- | --- | --- |
| SQD-21 | **Squad list.** `GET /v1/tournaments/{id}/squads` returns the tournament's squads sorted by `date` (`SQD-20`, D-45), with the effective fee and ratios and override flags (D-43). Unreadable rows are skipped (D-42). | Done, differs (D-41 to D-45) |
| SQD-22 | **Sweeper list.** `GET /v1/tournaments/{id}/sweepers` returns the sweepers the same way, each with its bonus pins, listing only divisions where they are not 0 (D-45). | Done, differs (D-41 to D-45) |

## Squad portal

Title is the squad date (`MM/dd/yyyy hh:mmtt`). Menu: lane assignments, scores, results, complete. The sweeper portal is the same. See [screens.md](screens.md).
