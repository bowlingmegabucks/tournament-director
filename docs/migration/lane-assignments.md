# Lane assignments

Each bowler on a squad or sweeper gets a **position**: a lane number plus a seat letter on that lane pair. The same screen also builds the **cross** (lane per game) printed on recap sheets.

Source: `presentation/LaneAssignments/` (lane generation and cross logic live here, not in business logic), `business logic/LaneAssignments/`, `business logic/Models/LaneAssignmentModel.cs`, `main/LaneAssignments/LaneAssignmentsForm.cs`.

## Positions

| ID | Rule | Status |
| --- | --- | --- |
| LAN-01 | A position is `<lane><letter>`, for example `15A`. Stored in `SquadRegistration.LaneAssignment` (max 3 characters). Empty string means not assigned. | Done, differs (D-56, D-58) |
| LAN-02 | Seats per pair depend on `maxPerPair`. For the pair `i` (odd) and `i+1` (even): | Done, differs (D-56) |

| maxPerPair | Odd lane `i` | Even lane `i+1` | Example for pair 1-2 |
| --- | --- | --- | --- |
| 2 | A | B | `1A 2B` |
| 3 | A | B, C | `1A 2B 2C` |
| 4 | A, B | C, D | `1A 1B 2C 2D` |
| 5 | A, B | C, D, E | `1A 1B 2C 2D 2E` |

Any other value: the screen shows an error and disables itself. (Squad validation allows any value above 0, so 1 or 6 saves but cannot be assigned. See Q-10.)

**D-56:** the new app fills a pair in the order `A`, `C`, `B`, `D`, `E` (odd lane A, even lane C, odd lane B, even lane D, even lane E), takes the first free seat, never renumbers, and stops at 5. The letters above stay valid when stored (D-61).

| ID | Rule | Status |
| --- | --- | --- |
| LAN-03 | Pairs run from `startingLane` up to `startingLane + numberOfLanes − 1`, two lanes at a time. Starting lane 11 with 10 lanes gives pairs 11-12, 13-14, 15-16, 17-18, 19-20. The screen refuses an even starting lane ("Starting lane must be odd") or an odd lane count ("Number of lanes must be even"). | Done, differs (D-58) |
| LAN-04 | Sort order: lane number, then letter. | Done |

**D-58:** each pair is a drop zone, drawn from `startingLane` and `numberOfLanes`.

## Moving a bowler

The desk drags a bowler onto a position, or back to "unassigned". Several desk PCs can work at once, so the move checks for stale data.

**D-55, D-57:** the new app drags a bowler onto a **pair**, and the API picks the seat. The page, the drag, and an on-screen move (nothing saves) come first; the command comes after the lock-down release. `LAN-07` and `LAN-08` fall away; `LAN-05`, `LAN-06`, and `LAN-09` carry over.

| ID | Rule | Message |
| --- | --- | --- |
| LAN-05 | The bowler must be on this squad | "Bowler is not registered for squad" | |
| LAN-06 | Moving to the current position does nothing | | |
| LAN-07 | The bowler's saved position must equal the position the screen thinks it is (the "original" sent with the move) | "Bowler has already been moved from {original}.  Please refresh and verify correct lane assignment" | Dropped (D-57) |
| LAN-08 | The target must be empty | "Lane {target} is already assigned.  Please refresh for updated lane assignments" | Dropped (D-57) |
| LAN-09 | An empty target unassigns the bowler | | |

## What the screen shows

| ID | Rule | Status |
| --- | --- | --- |
| LAN-10 | Two areas: unassigned bowlers and the lane grid. Plus a count of entries per division. | Done, differs (D-58) |
| LAN-11 | Each bowler shows name, division, average, and handicap. On a squad, handicap comes from the division formula (`SCR-07`). On a sweeper, it is the division's bonus pins (`SCR-09`), and the bowler also shows Y/N for super sweeper. | Done |
| LAN-12 | Actions: add an already-registered bowler to this squad (`REG-21`), new registration (`REG-22`), remove from squad (`REG-20`), copy assignments to clipboard (`RPT-06`), generate recap sheets (the "staggered skip" checkbox sits with them; see [the cross](#the-cross-lane-per-game)). | |
| LAN-13 | A complete squad opens read-only (`SQD-17`). | Done, differs (D-10) |

**D-55:** all of `LAN-12` is Later. **D-58:** `LAN-10` and `LAN-11` are built, with an on-screen move that saves nothing; "unassigned" is a NULL or empty position. **D-59:** public for 0.2.0, then signed-in only. **D-60:** reached from a squad portal page. **D-10:** the server lock on a complete session comes with the move command. The lasting record is [lane-assignments.md](../requirements/lane-assignments.md).

## The cross (lane per game)

Bowlers change lanes every game. The app works out each bowler's lane for each game and prints it on the recap sheet. The desk picks one of two patterns with a "staggered skip" checkbox.

### Inputs

1. **Lanes in use**: every lane that has at least one assigned bowler, plus the other lane of its pair. Sorted. Unused pairs at the end drop out.
2. **Skip**, from the number of lanes in use:

| Lanes in use | Skip |
| --- | --- |
| up to 16 | 0 |
| 17 to 24 | 1 |
| 25 to 32 | 2 |
| 33 to 40 | 3 |
| 41 to 48 | 4 |
| 49 to 56 | 5 |
| more than 56 | 6 |

3. The bowler's starting lane and letter, and the game count (tournament `games` for a squad, sweeper `games` for a sweeper).

### Steps

1. Game 1 is the starting lane.
2. For each next game, move forward through the "lanes in use" list by a step, wrapping at the end:
   - **Same skip:** step = `(skip + 1) × 2` every game.
   - **Staggered skip:** step depends on the game number `g`, using `(g − 1) mod 4`:
     - 0 or 1: `(skip + 1) × 2`
     - 2: `(skip + 2) × 2`
     - 3: `max(skip × 2, 2)`
3. Steps work on the lane from step 2 before any swap. After all games are worked out, on games 2, 4, 6, ... the bowler swaps to the **other lane of the pair** (odd lane + 1, even lane − 1). Odd games keep the lane.
4. The letter never changes. Each game prints as `<lane><letter>`.

### Worked examples (checked with a script)

| Lanes in use | Pattern | Start | Games | Cross |
| --- | --- | --- | --- | --- |
| 1-16 | same | 1A | 6 | 1A 4A 5A 8A 9A 12A |
| 1-16 | same | 2B | 6 | 2B 3B 6B 7B 10B 11B |
| 1-16 | staggered | 1A | 6 | 1A 4A 7A 10A 11A 14A |
| 1-24 | same | 1A | 6 | 1A 6A 9A 14A 17A 22A |
| 1-24 | staggered | 1A | 8 | 1A 6A 11A 14A 17A 22A 3A 6A |

Use these as test cases.
