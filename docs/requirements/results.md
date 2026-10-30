# Results (squad and sweeper)

Built on branch `squadResults`. Migration source: [docs/migration/results.md](../migration/results.md), [scores.md](../migration/scores.md) (`SCR-07` to `SCR-12`), and [reports.md](../migration/reports.md) (`RPT-01` to `RPT-04b`).

**Status: planned, not built.** This file holds the test cases now so that none is lost. The Fields, Rules, API, and Screens sections are written in the record step after the build.

This slice builds squad results (per division) and sweeper results, on screen and for print. At-large, finals seeding, and super sweeper results come later. Their legacy test cases are listed at the end so that work starts with the cases already written.

## Test cases

Each case is one test in the new app. The Source column says where it came from:

- `legacy Name`: a test in the WinForms unit tests (`legacy/source/tests/BowlingMegabucks.TournamentManager.UnitTests/`), ported.
- `gap`: legacy has no test for it. We add one.
- `doc`: a worked example in the migration docs.

Legacy squad tests give every bowler three games of the same score (`BuildBowlerSquadScore(40)` is 40, 40, 40). Ratios are finals 8 and cash 5 unless a case says otherwise. Every squad case runs on shuffled input, as legacy does, because input order must not change the result.

### Ranking (SCR-11, SCR-12)

File: `api/src/features/results/ranking.test.ts`. Now.

| ID | Case | Expected | Source |
| --- | --- | --- | --- |
| RK-1 | 2 games (200, 201) against 3 games (200, 201, 202) | The 3-game entry ranks higher | legacy `CompareTo_OtherHasMoreGames` |
| RK-2 | 3 games against 1 game | The 3-game entry ranks higher, either way round | legacy `CompareTo_OtherHasLessGames` |
| RK-3 | Same games, one has the higher total (200, 201, 203 against 200, 201, 202) | Higher total ranks higher | legacy `CompareTo_SameTotalGames_OtherHasHigherScore` |
| RK-4 | Same games, one has the lower total | Lower total ranks lower | legacy `CompareTo_SameTotalGames_OtherHasLowerScore` |
| RK-5 | Same total (600): 200, 200, 200 against 200, 201, 199 | Higher high game (201) ranks higher | legacy `CompareTo_..._OtherHasHigherGame` |
| RK-6 | Same total (600): 200, 199, 201 against 200, 200, 200 | Higher high game (201) ranks higher | legacy `CompareTo_..._OtherHasLowerGame` |
| RK-7 | Same total and high game: 200, 200, 200, 300 against 200, 199, 201, 300 | The 2nd-highest game (201 against 200) decides | legacy `CompareTo_..._Other2ndHighIsHigher` |
| RK-8 | Same, but the other entry's 2nd-highest game is lower | The entry with the higher 2nd-highest game ranks higher | gap: the legacy test of this name asserts the RK-7 result, so this side is untested |
| RK-9 | Same total, high game, and 2nd-highest game: 300, 250, 150, 100 against 300, 250, 140, 110 | The 3rd-highest game decides | gap |
| RK-10 | Every game equal | A full tie. The order is stable (last name, first name, registration id) and the result flags it (D-16) | gap |
| RK-11 | Handicap counts in the total: scratch 600 with handicap 0 against scratch 580 with handicap 10 a game | 610 ranks above 600 | gap: legacy ranking tests are scratch only |
| RK-12 | Same total with handicap; high game is best scratch game plus handicap: scratch 250, 200, 200 with handicap 0 against scratch 243, 187, 190 with handicap 10 | The second entry's high game (253) beats 250 even though its best scratch game is lower | gap |
| RK-13 | Three entries with two tied | Places are 1, 2, 3 and a tie shares no place (SCR-12) | doc |
| RK-14 | Total of games and high game from a list of games | Score is the sum; high game is the largest | legacy `Constructor_..._GameScoresMapped` |
| RK-15 | The same entries in any order | The same ranking | legacy (the shuffle in the squad tests) |

Legacy tests of `Equals`, `GetHashCode`, and `CompareTo(null)` test C# object identity. They do not carry over.

### Handicap and bonus pins (SCR-07, SCR-08, SCR-09)

| ID | Case | Expected | Source |
| --- | --- | --- | --- |
| HD-1 | The handicap function: no average, no base or percentage, average at or above the base (215 and 216 against base 215), under the cap, over the cap | As `SCR-07` | legacy `HandicapCalculatorTests`. Already covered by `api/src/features/lanes/handicap.test.ts`; results reuse the function and add no copy |
| HD-2 | A squad entry's total is scratch plus handicap times games bowled; its high game is best scratch game plus handicap | 3 games of 200 with handicap 20: total 660, high game 220 | gap |
| HD-3 | A sweeper entry's total is scratch plus the division's bonus pins times games bowled | 2 games, +10 pins: total scratch + 20 | gap |
| HD-4 | A division with no bonus-pins row, or NULL | 0 pins (SCR-09) | gap |
| HD-5 | Games bowled is the number of stored games, so a 2-game bowler gets 2 times the handicap | As stated | gap |

### Squad results per division (RES-02 to RES-09)

File: `api/src/features/results/squadResults.test.ts`. Now.

| ID | Case | Expected | Source |
| --- | --- | --- | --- |
| SQ-1 | 40 entries, scores all different, no earlier advancers | `A` = 5, `C` = 3. The top 5 advance, the next 3 cash, 32 do not qualify | legacy `NoPreviousAdvancers_NoTies` |
| SQ-2 | Tie on total for the last advancing spot: 35, 36, 38 against 36, 36, 37 (109 each) | High game 38 beats 37. Five advance. The other bowler is the first casher | legacy `NoPreviousAdvancers_TieForLastAdvancer` |
| SQ-3 | Tie on total between ranks 10 and 11, far below the cash line | No effect on advancers or cashers (no line is crossed) | legacy `NoPreviousAdvancers_TieForLastCasher`. Its name claims a tie for the last casher; the tie is nowhere near the line |
| SQ-4 | Tie on total across the cash line (8th and 9th: 44, 45, 46 against 45, 45, 45) | The 8th cashes on high game 46; the 9th does not | gap |
| SQ-5 | 4 entries | `A` = 0, `C` = 1. The top bowler cashes, 3 do not qualify | legacy `EntriesLessThanCashRatio_NoAdvancers_OneCasher` |
| SQ-6 | 6 entries | `A` = 0, `C` = 1. The top bowler cashes, 5 do not qualify | legacy `EntriesGreaterThanCashRatioLessThanAdvanceRatio_NoAdvancers_OneCasher` |
| SQ-7 | 7 entries, cash ratio 3 | `floor(7 / 3)` = 2, but `A` = 0, so exactly 1 casher (D-08) | doc |
| SQ-8 | 39 entries | `A` = `floor(39 / 8)` = 4, not 5 (round down) | gap |
| SQ-9 | Fractional ratios: 24 entries, finals 8, cash 4.5 | `A` = 3, `C` = `floor(24 / 4.5)` - 3 = 2 | gap |
| SQ-10 | Earlier advancers A to E. A scores the top; B to E score last (GitHub issue 9, situation 1) | The best 5 who are not A to E advance. A cashes, then the next 2 best (3 cashers). 32 do not qualify | legacy `GitHubIssue9_Situation1` |
| SQ-11 | A, B, C score the top 3; D, E score last (situation 2) | Best 5 not A to E advance. A, B, C cash (3, and no one else). 32 do not qualify | legacy `GitHubIssue9_Situation2` |
| SQ-12 | A to E score the top 5 (situation 3) | The next 5 advance. A to E cash: 5 cashers, more than `C` = 3. 30 do not qualify | legacy `GitHubIssue9_Situation3` |
| SQ-13 | An earlier advancer ties the last advancer's total | Cashes (at or above, RES-08 step 1) | gap |
| SQ-14 | An earlier advancer scores below the cut and outside the cash places | Lists with the non-qualifiers in rank order, with no tag (D-81, RES-09) | gap |
| SQ-15 | `A` = 0 and an earlier advancer has the top score | No crash. The earlier advancer takes the one cash spot, with no tag. Everyone else does not qualify (D-81) | gap: legacy crashes (RES-08 defect) |
| SQ-16 | Fewer bowlers than cash places: a complete squad, 8 entries, 6 of them no-shows, finals ratio 8, cash ratio 2 | `A` = 1, `C` = 3. One bowler advances and the other ranked bowler cashes. No crash; the spots stay unfilled | gap: legacy crashes (RES-08 defect) |
| SQ-17 | Two divisions in one squad, each with its own entries | Each is worked out alone, and the result lists them by name (RES-10) | legacy `SquadResultsAdapterTests` (two divisions) |
| SQ-18 | The squad has its own finals and cash ratios | The squad's ratios apply, not the tournament's (RES-03) | gap (the route gets the effective values, D-43) |
| SQ-19 | 16 entries including 1 no-show (stored zeros) | The no-show counts: `A` = 2 (D-06) | gap |
| SQ-20 | A score for a bowler who is not entered in the squad (removed on refund) | Ignored; not an entry (D-06, D-11) | gap |
| SQ-21 | A division with no entries | Left out of the result (D-77) | gap |
| SQ-22 | Place numbers run through advancers, then cashers, then the rest | 1, 2, 3, ... with no repeat | doc (RES-10, SCR-12) |
| SQ-23 | Owner's example: 24 entries, finals 8, cash 4.5 (`A` = 3, `C` = 2). An earlier advancer scores the top (780); the third advancer scores 715 | The next 3 bowlers are places 1 to 3. The earlier advancer is place 4 with the highest score and the tag. The next bowler (701) is place 5 | doc (D-75 discussion, 2026-10-30) |
| SQ-24 | Same division. An earlier advancer scores 705 (below the cut of 715, above the next two bowlers at 701 and 698) | The earlier advancer cashes, with no tag, and uses one of the 2 cash spots. The 701 bowler cashes. The 698 bowler does not (D-81) | gap (D-81, owner 2026-10-30) |
| SQ-25 | Same division. An earlier advancer scores 664, outside the cash places | No cash, no tag. Lists with the non-qualifiers in rank order | gap (D-81) |
| SQ-26 | An earlier advancer ties the cut total and ranks below an ordinary bowler on high game | Cashes anyway (at or above the cut), with the tag | gap |

### Ties at a line (D-14, D-16)

File: `api/src/features/results/ties.test.ts`. Now.

| ID | Case | Expected | Source |
| --- | --- | --- | --- |
| TI-1 | Equal totals across the cut line, decided on high game | The advancer is marked "won on high game", the bowler below "lost on high game" | legacy `NoPreviousAdvancers_TieForLastAdvancer`, plus D-14 |
| TI-2 | Equal totals and high games; the 2nd-highest game decides | Both marked with "2nd-highest game" | gap |
| TI-3 | Equal totals but different game counts | Marked "games bowled" | gap |
| TI-4 | Full tie across the cut line | Both marked as a full tie; the director decides (D-16) | gap |
| TI-5 | Equal totals across the cash line | Same marks, on the cash line | gap |
| TI-6 | Three bowlers equal on total, one spot | The advancer and both bowlers below are marked | gap |
| TI-7 | Totals differ across the line | No mark | gap |
| TI-8 | An earlier advancer ties the last advancer's total | Not part of the cut-line tie (they cash by RES-08 step 1) | gap |
| TI-9 | A tie that does not cross a line | No mark | legacy `NoPreviousAdvancers_TieForLastCasher` (ranks 10 and 11) |
| TI-10 | A tie decided by a tie-breaker never widens the group | The number of advancers stays `A` (D-14) | legacy `NoPreviousAdvancers_TieForLastAdvancer` |

### Did not finish and no show (D-75, legacy issue #92)

File: `api/src/features/results/squadResults.test.ts`. Now.

| ID | Case | Expected | Source |
| --- | --- | --- | --- |
| DN-1 | Complete squad, a bowler with 2 of 3 games whose score would otherwise cash | Listed under "Did not finish" with no place. Does not advance or cash | gap (#92) |
| DN-2 | Complete squad, a bowler with all stored scores 0 | Listed under "No show" with no place | gap (#92) |
| DN-3 | Open squad, a bowler with 2 of 3 games | Ranks by SCR-11. No sections | gap |
| DN-4 | Both kinds count as entries | `A` and `C` count them (16 entries, `A` = 2) | gap (D-06) |
| DN-5 | Too few bowlers left to fill the spots | Spots stay unfilled; no crash | gap |
| DN-6 | Every bowler did not finish | No placed list; the section lists all | gap |
| DN-7 | A sweeper with a bowler who has fewer games | Ranks by SCR-11; a sweeper has no sections | gap |

### Squad flow: earlier squads (RES-06, SQD-19, SQD-20)

File: `api/src/features/results/loadResults.test.ts`. Now.

| ID | Case | Expected | Source |
| --- | --- | --- | --- |
| FL-1 | A tournament with a past, a current, and a future squad | Only the past and current squads' scores are read | legacy `RetrieveScoresExecute_CalledWithSquadsBeforeOrOnGivenSquadDate` |
| FL-2 | The squads are given out of order | They are worked out in date order, so an advancer in squad 1 is an earlier advancer in squad 2 | legacy `CalledInSequentialOrderBasedOnSquadDate` |
| FL-3 | Two squads at the same time | Ordered by starting lane, then id (SQD-20, D-45) | gap |
| FL-4 | An earlier squad with no scores | No earlier advancers; no error | gap |
| FL-5 | An earlier squad that is still open | Its scores so far decide who advanced (RES-01) | gap |
| FL-6 | A bowler who advanced in this squad | Is not an earlier advancer in this squad | gap |
| FL-7 | A bowler who did not finish an earlier complete squad | Did not advance there, so is not an earlier advancer | gap (D-75) |
| FL-8 | A bowler's division | Comes from the current registration (SCR-10) | gap |
| FL-9 | An entry whose division is not one of the tournament's | Skipped and logged once (D-51) | gap |

### Rows and columns (RES-11a)

File: `api/src/features/results/squadResults.test.ts` and the web page tests. Now.

| ID | Case | Expected | Source |
| --- | --- | --- | --- |
| RW-1 | A row carries place, name (`First Last, Suffix`), total, high game, handicap, games, and the group it is in | As stated | legacy `SquadResultsViewModelTests` (place, name, score, scratch score, high game, advancer, casher) |
| RW-2 | A division where no bowler has a handicap above 0 | The page has no HDCP column | gap |
| RW-3 | A division where someone has a handicap above 0 | The page has an HDCP column, and a bowler with 0 shows 0 | gap |
| RW-4 | A division whose bowlers all have the same game count | No Games column; with unequal counts, a Games column (D-76) | gap |
| RW-5 | An earlier advancer at or above the cut score | The row has `advancedEarlier` true and the page shows the tag and one note under the table. An earlier advancer below the cut, or with no cut, has it false (D-81) | gap |
| RW-7 | A squad with several divisions | The page lists a "Division" chooser with each entry count, shows the first, keeps the choice in `?division=`, and falls back to the first for an unknown id (D-80) | gap |
| RW-8 | A sweeper row | Shows the bowler's division under the name (D-82) | gap |
| RW-6 | The route sends no SSN, gender, birth date, address, email, phone, average, or payments | Only the fields in the API table (BWL-17) | gap |

### Sweeper results (RES-22 to RES-25a)

File: `api/src/features/results/sweeperResults.test.ts`. Now.

| ID | Case | Expected | Source |
| --- | --- | --- | --- |
| SW-1 | 4 bowlers, 2 games each (201, 202; 203, 204; 205, 206; 207, 208), cash ratio 2 | Order: 4th bowler first, then 3rd, 2nd, 1st. 2 cashers. Cut score 411 | legacy `SweeperCutReturnedWithCorrectFields` |
| SW-2 | Same bowlers, cash ratio 500 | `floor(4 / 500)` = 0, so 1 casher. Cut score 415 | legacy `CashRatioMakesCasherCountLessThan1` |
| SW-3 | No scores | The message "No scores entered yet." (D-77), not an error | legacy `NoScoreFlow` (the error text changes) |
| SW-4 | An unknown sweeper | 404 "Sweeper not found" | legacy `RetrieveSweeperExecuteHasError_ErrorFlow` |
| SW-5 | Cashing positions 5: places 1 to 5 | Cashers; place 6 is not | legacy `SweeperResultsViewModelTests` |
| SW-6 | Bonus pins | Total is scratch plus pins times games (HD-3) | gap |
| SW-7 | Two divisions with different bonus pins | One list for the whole sweeper, ranked on totals with each bowler's own pins (RES-22) | gap |
| SW-8 | A bowler with fewer games | Ranks below bowlers with more games (SCR-11) | gap |
| SW-9 | Equal totals across the cash line | Marks as in TI-5, using high game with bonus pins | gap |
| SW-10 | 10 entries, ratio 4, then ratio 3 | 2 cashers, then 3 (round down) | gap |
| SW-11 | The cut score | The last casher's total | legacy (the 411 and 415 asserts) |
| SW-12 | A stored cash ratio of 0 or less | 422 with a clear message; no divide by zero | gap |

### Routes and page (SCR-16 style)

| ID | Case | Expected | Source |
| --- | --- | --- | --- |
| RT-1 | `GET .../squads/{id}/results` and the sweeper twin | 200 with the shapes in the API table | gap |
| RT-2 | Unknown tournament, unknown or other-tournament session, id that is not a UUID, bad tournament row, database down | 404, 404, 400, 500, 503 as the scores route | gap |
| RT-3 | Stored ratio of 0 or less | 422 `{ message }` | gap |
| RT-4 | The route access label | `public` (D-74); `app.test.ts` lists it | gap |
| WB-1 | The page: loading, error with Try again, no scores, filled | Each state shows | gap |
| WB-2 | The page: lines | "Cut Line" after the last advancer, "No Advancers" when none, "Cash Line" after the last casher | legacy (reports) |
| WB-3 | The page refreshes every 15 s while open and stops when complete; a failed refresh keeps the last results | As D-79 | gap (copies the Scores tab test) |
| WB-4 | Print | One section per division, with the header, the sponsor image, and the table; the browser print dialog opens | gap |
| WB-5 | Narrow screen | A row is a block; no sideways scroll | gap |

## Test cases for later features

Not built in this slice. Recorded here from the legacy tests, with gaps, so the later work starts with its cases.

### At-large (RES-12 to RES-17)

File when built: `api/src/features/results/atLarge.test.ts`.

| ID | Case | Expected | Source |
| --- | --- | --- | --- |
| AL-1 | Finals ratio 2. One squad: 3 advancers and 1 casher | Total spots are fewer than the squad finalists. No at-large advancers, no earlier cashers | legacy `TotalFinalsSpotsLessThanSquadFinalistCount_ReturnsEmptyAtLargeResults` |
| AL-2 | Finals ratio 2. One squad: 2 advancers and 2 cashers | Spots equal the finalists. Empty at-large | legacy `TotalFinalsSpotsEqualToSquadFinalistCount_ReturnsEmptyAtLargeResults` |
| AL-3 | Finals ratio 2. One squad: advancers 250 and 249, no cashers, non-qualifiers 200, 199, 198, 197 | `S` = `floor(6 / 2)` = 3, `Q` = 2, so 1 at-large advancer: the 200. No earlier cashers | legacy `...NoAdvancersWhoPreviouslyCashed_ReturnsCorrectResults` |
| AL-4 | Same, but the 200 bowler cashed in the squad | One at-large advancer (200), flagged as an earlier casher (D-07) | legacy `...AdvancersHavePreviouslyCashed_ReturnsCorrectResults` |
| AL-5 | The tournament result for a division is built from every squad's result and the tournament finals ratio | Called once per division with all its squad results | legacy `TournamentResultsBOTests` (calculator called correctly, returns the model) |
| AL-6 | An error reading the tournament or the squad results | Error flow: no result | legacy `TournamentResultsBOTests` |
| AL-7 | Three squads with 30, 27, 23 entries, ratio 8 | `E` = 80, `S` = 10, `Q` = 3 + 3 + 2 = 8, so 2 at-large spots | doc |
| AL-8 | The pool | Every casher and non-qualifier of every squad, less any bowler who advanced in any squad | gap |
| AL-9 | A bowler in the pool twice | Appears once, with the best squad (highest total; on a tie, the earliest squad) | gap |
| AL-10 | A squad has its own finals ratio | At-large still uses the tournament ratio (RES-12, Q-13 open) | gap |
| AL-11 | A tie for the last at-large spot | The same tie marks as squads (D-14) | gap |
| AL-12 | Two divisions | Each is worked out alone | gap |
| AL-13 | The display | Columns Place, Squad (`MM/dd hh:mm tt`), Name, Total, HG, Casher | doc (RES-17) |

### Finals seeding (RES-18 to RES-21a)

File when built: `api/src/features/results/seeding.test.ts`.

| ID | Case | Expected | Source |
| --- | --- | --- | --- |
| SD-1 | Squad advancers 297 and 299, an at-large 250, other scores 150, 198, 197, 167, no re-entries | Seeds 299, 297, 250. Non-finalists 198, 197, 167, 150, numbering on | legacy `Execute_NoReEntries_CorrectSeedingReturned` |
| SD-2 | One bowler appears twice (198 and 167) | Counts once, with the best entry (198). Non-finalists 198, 197, 150. The at-large casher flags carry over | legacy `Execute_ReEntries_CorrectSeedingReturned` |
| SD-3 | A finalist who advanced from squad 1 but scored higher in squad 2 | Seeded on the squad 2 score (RES-19) | gap |
| SD-4 | Ranking uses SCR-11 with handicap | As squads | gap (legacy issue #122 asks for handicap on the report) |
| SD-5 | The "Cut Line" between finalists and the rest | Present | doc |
| SD-6 | Errors from the tournament result | Error flow | legacy `TournamentSeedingBOTests` |

### Super sweeper (RES-26 to RES-29a)

File when built: `api/src/features/results/superSweeper.test.ts`.

| ID | Case | Expected | Source |
| --- | --- | --- | --- |
| SS-1 | A tournament with 2 sweepers | Scores of both are read | legacy `RetrieveScoresExecute_CalledCorrectly` |
| SS-2 | An error reading the tournament or scores | Error flow | legacy `...HasError_ErrorFlow` |
| SS-3 | No scores | The same message as a sweeper (D-77) | legacy `NoScoreFlow` |
| SS-4 | 4 super sweeper bowlers, 2 games, cash ratio 2 | 2 cashers, cut score 411 | legacy `SuperSweeperSuccess_SweeperCutReturnedWithCorrectFields` |
| SS-5 | Same, cash ratio 500 | 1 casher, cut score 415 | legacy `CashRatioMakesCasherCountLessThan1` |
| SS-6 | A bowler who is not in the super sweeper (scores 300, 300) | Left out of the results | legacy `BowlerNotInSuperSweepers` |
| SS-7 | Two sweepers with different bonus pins | Each game gets its own sweeper's pins | gap: legacy uses the first sweeper's pins for every game (RES-27 defect) |
| SS-8 | A bowler who skipped a whole sweeper | Handled as Q-14 decides | gap (Q-14 open) |
| SS-9 | Games bowled | Counts distinct game numbers, per the `SCR-11` note, so a bowler with 6 games over 2 sweepers ranks above one with 3 | gap |
| SS-10 | Cash ratio 0 on an old tournament | A clear message, not a crash (D-17) | gap |
| SS-11 | Cash ratio 1 | Every bowler cashes | gap |
| SS-12 | Results reached from the sweeper list (D-23) | The route and access label are decided then | gap |
