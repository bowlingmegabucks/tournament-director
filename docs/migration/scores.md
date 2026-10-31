# Scores

Scores are scratch pins per game. Handicap and bonus pins are added when results are computed, never stored.

Source: `business logic/Scores/`, `business logic/Squads/HandicapCalculator.cs`, `business logic/Models/SquadScoreModel.cs`, `business logic/Models/BowlerSquadScoreModel.cs`, `presentation/Scores/`, `main/Scores/`.

## Storage

One row per bowler, per squad or sweeper, per game: `(BowlerId, SquadId, Game) → Score`. Game numbers start at 1.

## Entry and validation

The desk enters scores in a grid (one row per assigned bowler, one column per game), or pastes them (`RPT-07`). Save sends every row for the squad at once.

| ID | Rule | Message |
| --- | --- | --- |
| SCR-01 | Each score is 1 to 300. (0 is only written by squad completion, `SQD-15`.) | FluentValidation's default range message |
| SCR-02 | Bowler and squad ids present; game number > 0 | "Bowler Id is required", "Squad Id is required", "Game number must be greater than zero" |
| SCR-03 | A bowler's games have no gaps: the count of games equals the highest game number (games 1, 2, 3, not 1 and 3) | "Missing game for bowler" |
| SCR-04 | No game twice for one bowler | "Duplicate game for bowler" |
| SCR-05 | **Checks run per bowler.** Bowlers that pass are saved; bowlers that fail are returned to the screen and not saved. | |
| SCR-06 | **Save replaces the squad's scores.** New games are added, changed games updated, and any saved score for the squad that is not in the submission is **deleted** (so clearing a cell deletes it). | |

**Defect from SCR-05 + SCR-06:** a bowler who fails validation is left out of the save, and the replace step then deletes that bowler's saved scores. Do not copy. Validate the whole submission first, or replace per bowler.

A save with no valid rows fails, so the desk cannot clear every score in a squad at once.

The score count is not checked against the squad's game count. A bowler can have fewer games than the squad, which affects ranking (`SCR-11`).

## Handicap

| ID | Rule | Status |
| --- | --- | --- |
| SCR-07 | **Handicap per game** for a registration in a division. The function is built for the lane page ([lane-assignments.md](../requirements/lane-assignments.md)); scoring uses it later: | Done |

```
if average, handicapBase, or handicapPercentage is missing: 0
if average >= handicapBase:                                 0
otherwise: min( floor((handicapBase − average) × handicapPercentage),
                maximumHandicapPerGame ?? 999 )
```

Examples with base 220, 90%, cap 50:

| Average | Raw | Handicap |
| --- | --- | --- |
| 230 | — | 0 |
| 200 | `floor(20 × 0.9) = 18` | 18 |
| 150 | `floor(70 × 0.9) = 63` | 50 (capped) |
| none | — | 0 |

| ID | Rule | Status |
| --- | --- | --- |
| SCR-08 | Handicap is the same every game. Squad total with handicap = scratch total + handicap × games bowled. **D-68:** the score view and entry show scratch only; this applies with results. | Done |
| SCR-09 | **Sweeper bonus pins** replace handicap in sweepers: the `BonusPinsPerGame` for the bowler's division in that sweeper. Missing row or NULL = 0. Same use as handicap: total = scratch + pins × games. The lane page reads the pins ([lane-assignments.md](../requirements/lane-assignments.md)); scoring uses them later. **D-68:** not shown on the score view. | Done |
| SCR-10 | The division for a score is the bowler's current registration division in that tournament. | Done |

The old `rewrite/` spec listed set amounts (+10 handicap, +6 for 55+ or women, 0 scratch). Those are not in the code; the desk types a number per division per sweeper. See Q-11.

## Ranking and tie-breaks

Every results list (squad, at-large, seeding, sweeper, super sweeper) uses this order. Each entry carries its games, its scratch total, and its handicap per game.

| ID | Rule | Status |
| --- | --- | --- |
| SCR-11 | Compare two entries in this order; the first difference decides. **D-76:** the results page shows a Games column while counts differ. | Done, differs (D-16) |

1. **More games bowled ranks higher.** (A bowler with 3 games entered ranks above one with 2, whatever the pins.)
2. **Higher total with handicap.**
3. **Higher high game with handicap** (best scratch game + handicap).
4. **Higher 2nd-best scratch game**, then 3rd-best, and so on through the games.
5. Still equal: a full tie. Legacy leaves the order undefined. **D-16:** the new app flags a full tie at a line and the director picks. Expected to be very rare.

**Ties at a line are not widened.** If two bowlers tie on total for the last advancing spot, the tie-breakers pick one; the other does not advance. The legacy test `NoPreviousAdvancers_TieForLastAdvancer` shows it: 109 vs 109, high game 38 beats 37, and only 5 advance. **D-14:** keep this, and mark tie-breaker decisions on the standings (`RES-11`).

Example from the legacy tests (scratch, 3 games): totals 109 each. Bowler A games 35, 36, 38; bowler B 36, 36, 37. High game 38 beats 37, so A ranks first.

**Note for super sweeper:** the combined entry joins games from every sweeper, so "game 1" appears once per sweeper. Legacy's steps 1 and 4 use the number of distinct game numbers, not the number of games. **D-90:** the new app counts every game, zero-filled ones included, so a bowler who missed a whole sweeper ranks lower.

| ID | Rule | Status |
| --- | --- | --- |
| SCR-12 | Places and seeds number 1, 2, 3, ... in ranked order. Ties do not share a place. | Done |

## Screen

| ID | Rule | Status |
| --- | --- | --- |
| SCR-13 | The grid lists bowlers with a position, sorted by position (`LAN-04`). Bowlers without a position do not appear. **D-69, D-71:** the view groups by pair, adds a note and link for bowlers with no lane, and lists "Other positions" with their scores. | Done, differs (D-69, D-71, D-73) |
| SCR-14 | On a complete squad, paste and save are off (`SQD-17`). **D-10:** the new server also rejects score saves for a complete squad or sweeper. **D-69:** the view is read only in both states and says when the session is complete. | Done in part, differs (D-69); server refusal later |
| SCR-15 | Success message: "Scores updated". | |
