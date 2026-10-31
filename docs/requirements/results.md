# Results (squad and sweeper)

Built on branch `squadResults`. Migration source: [docs/migration/results.md](../migration/results.md), [scores.md](../migration/scores.md) (`SCR-07` to `SCR-12`), and [reports.md](../migration/reports.md) (`RPT-01` to `RPT-04b`).

This slice builds squad results (per division) and sweeper results, on screen and for print. At-large, finals seeding, and super sweeper results are in [finals-results.md](finals-results.md).

## Fields

No new stored data. Results are computed on each request from the squads, sweepers, divisions, registrations, and saved scores the earlier features already read. The response shapes are in the API section.

| Field | Source | Notes |
| ----- | ------ | ----- |
| Entries `N` | Bowlers in the division with at least one stored score | A no-show and a bowler who did not finish count (D-06, D-75) |
| Total | Scratch plus handicap (squad) or bonus pins (sweeper) times games bowled | SCR-08, SCR-09 |
| High game | Best scratch game plus the same handicap or bonus pins | SCR-11 |
| Spots | `A = floor(N / finalsRatio)`; `C = 1` if `A = 0`, else `max(floor(N / cashRatio) - A, 0)`; sweeper cashers `max(floor(N / ratio), 1)`, never more than `N` | RES-04, RES-05, RES-24 |

## Rules

Tests live in `api/src/features/results/` and `web/src/features/results/` (the `Tests` column gives the file; the test names cite the rule). End-to-end tests are in `web/e2e/tournaments.spec.ts` and `accessibility.spec.ts`.

| ID | Requirement | Differs from legacy | Tests |
| -- | ----------- | ------------------- | ----- |
| RES-01, SQD-19 | Results use every score saved so far. They do not wait for a squad to be complete. | Yes: an incomplete session is marked "Unofficial results" (D-84); the page refreshes (D-79) | `loadResults.test.ts`, `SquadResultsPage.test.tsx` |
| RES-02 | `N` counts bowlers in the division with at least one stored score. | Yes: a no-show or a bowler who did not finish counts but never advances or cashes (D-75) | `entries.test.ts`, `squadResults.test.ts` |
| RES-03 | The squad's finals and cash ratios apply when set, else the tournament's (D-43). | | `loadResults.test.ts`, `routes.test.ts` |
| RES-04, RES-05 | `A` and `C` as in the Fields table, rounded down. With `A = 0`, exactly one bowler cashes (D-08). | | `squadResults.test.ts` |
| RES-06 | An earlier advancer is a bowler of this division who advanced in an earlier squad, by date, then starting lane, then id (SQD-20, D-45). | | `loadResults.test.ts` |
| RES-07 | The advancers are the best `A` bowlers who are not earlier advancers. | | `squadResults.test.ts` |
| RES-08 | Cashers are the next `C` bowlers after the advancers in rank order, plus any earlier advancer at or above the cut. An earlier advancer ranks like everyone else and cashes when the rank puts them in a cash place. With `A = 0` the first `C` bowlers in rank order cash. No crash when there are too few bowlers. | Yes (D-81, D-02) | `squadResults.test.ts` |
| RES-09 | Everyone else lists in rank order. | | `squadResults.test.ts` |
| RES-10 | One table per division, divisions sorted by name, places 1, 2, 3 through advancers, cashers, then the rest. A division with no entries is left out (D-77). The screen shows one division at a time (D-80). | Yes: one division at a time | `divisionResult.test.ts`, `SquadResultsPage.test.tsx` |
| RES-11 | A "Cut Line" row follows the advancers ("No Advancers" when none) and a "Cash Line" row follows the cashers. Bowlers tied across a line get a mark that says which tie-breaker decided it, or that it was a full tie (D-14, D-16). | Yes: tie marks | `ties.test.ts`, `SquadResultsPage.test.tsx` |
| RES-11a | Columns: Place, Name, Total, HG, HDCP only when someone in the division has a handicap above 0. A Games column shows while the game counts differ (D-76). A "Advanced earlier" tag shows on an earlier advancer at or above the cut (D-81). On a complete squad "Did not finish" and "No show" sections follow the others (RES-30). | Yes (D-75, D-76, D-81) | `divisionResult.test.ts`, `SquadResultsPage.test.tsx` |
| RES-11b | Print header: "Squad Results", the date and time, the division. | | `PrintResults.test.tsx` |
| RES-22 | One list for the whole sweeper, ranked on totals with each bowler's own bonus pins. Each row shows the division under the name. | Yes: division shown (D-82) | `sweeperResults.test.ts`, `SweeperResultsPage.test.tsx` |
| RES-23, SCR-09 | Total is scratch plus bonus pins times games bowled. A division with no bonus-pins row has 0. | | `entries.test.ts` |
| RES-24 | Cashers are `max(floor(N / ratio), 1)`, never more than `N`. The cut score is the last casher's total. | | `sweeperResults.test.ts` |
| RES-25 | A sweeper or squad with no scores shows "No scores entered yet." | Yes: a message, not an error (D-77) | `SweeperResultsPage.test.tsx`, `SquadResultsPage.test.tsx` |
| RES-25a | Sweeper columns: Place, Name, Total, HG. A "Cash Line" row follows the cashers. Print header "Sweeper Results" and the date. | | `SweeperResultsPage.test.tsx`, `PrintResults.test.tsx` |
| SCR-07, SCR-08 | A squad total is scratch plus the handicap times games bowled. The handicap comes from the existing `handicap()` in the lanes feature. | | `entries.test.ts` |
| SCR-11 | Ranking: more games, higher total, higher high game, then the 2nd-best scratch game and on. A full tie orders by last name, first name, then registration id, and is flagged (D-16). | Yes: stable order for a full tie (D-16) | `ranking.test.ts` |
| SCR-12 | Places number 1, 2, 3 in rank order. Ties do not share a place. | | `divisionResult.test.ts` |
| RPT-01 to RPT-03, RPT-04a, RPT-04b | Print from the browser: one division per page for a squad, one list for a sweeper, letter portrait, the sponsor image in the header. | Yes: browser print, no PDF save (D-78) | `PrintResults.test.tsx`, `shared/print.test.ts`, e2e print tests |
| RES-30 | New. On a complete squad, a bowler with fewer stored games than the squad's `games` lists under "Did not finish", and a bowler whose stored scores are all 0 lists under "No show". Neither has a place, advances, or cashes. Both still count in `N`. Squads only. | New (D-75, legacy issue #92) | `squadResults.test.ts`, `divisionResult.test.ts` |
| RES-31 | New. Two web-only routes serve the results (API section). Public for good (D-74). Not vendor-visible (D-09). | New | `routes.test.ts`, `app.test.ts`, `results.db.test.ts` |
| RES-32 | New. The squad and sweeper page has a Results tab. | New | `SessionPortal` tests, `SquadResultsPage.test.tsx`, `SweeperResultsPage.test.tsx`, e2e |
| RES-33 | New. "Print all divisions" (squad) and "Print results" (sweeper) open the browser print dialog with the print copy. A squad also has "Print this division", which prints only the chosen division (RES-39, D-89). | New (D-78, D-89) | `PrintResults.test.tsx`, `useResultsPrint` page tests, e2e print tests |
| RES-34 | New. The tab asks again every 15 seconds until the session is complete. A failed refresh keeps the last results. | New (D-79) | `SquadResultsPage.test.tsx`, `SweeperResultsPage.test.tsx` |
| RES-35 | New. A stored ratio of 0 or less answers 422 with a message instead of dividing by zero. | New (D-83, D-02) | `loadResults.test.ts`, `routes.test.ts`, `api.test.ts`, page tests |
| RES-36 | New. While the squad or sweeper is not complete, the page and every printed page say "Unofficial results". A complete session shows no notice. | New (D-84) | `SquadResultsPage.test.tsx`, `SweeperResultsPage.test.tsx`, `PrintResults.test.tsx` |

Built later, on branch `finalResults`: `RES-12` to `RES-21a` (at-large and seeding), `RES-26` to `RES-29a` (super sweeper), `RPT-04b` (super sweeper), `RPT-04c`, `RPT-04d`: see [finals-results.md](finals-results.md). Still later: `SQD-15`, `SQD-16`.

## API

Both routes are web-only and public (D-74, D-09). Zod schemas are in `api/src/features/results/types.ts`; the web types in `web/src/features/results/types.ts` match.

| Route | Response | Errors |
| ----- | -------- | ------ |
| `GET /v1/tournaments/{id}/squads/{sessionId}/results` | `200 SquadResults` | `400` not a UUID; `404` unknown tournament or squad; `422` ratio cannot work; `500` bad tournament row; `503` database down |
| `GET /v1/tournaments/{id}/sweepers/{sessionId}/results` | `200 SweeperResults` | Same, `404` for a sweeper |

```
SquadResults {
  session: { id, kind: 'squad', date, complete, games }
  finalsRatio, cashRatio                  // the squad's effective ratios
  divisions: [{                           // by name; empty divisions left out
    id, number, name, entries, showHandicap, showGames,
    rows: [{ registrationId, name, place, total, highGame, games, handicap,
             group: 'advancer' | 'casher' | 'other',
             advancedEarlier,
             ties: [{ line: 'cut' | 'cash', outcome: 'won' | 'lost' | 'full',
                      decidedBy: { kind: 'games' } | { kind: 'game', rank } | null }] }],
    didNotFinish: [{ registrationId, name, total, highGame, games, handicap }],
    noShows: [{ registrationId, name }]
  }]
}

SweeperResults {
  session: { id, kind: 'sweeper', date, complete, games }
  cashRatio, entries, cashers, cutScore   // cutScore is null with no entries
  rows: [{ registrationId, name, place, total, highGame, games, ties,
           group: 'casher' | 'other', divisionName, bonusPins }]
}
```

The routes send no SSN, gender, birth date, address, email, phone, average, or payments (BWL-17). `session.complete` drives the unofficial notice (D-84) and stops the refresh (D-79).

## Screens

- **Results tab** on the squad and sweeper page, after Lane assignments and Scores. It loads with the shared `Loading` indicator, shows `QueryError` with Try again on a failure, and "No scores entered yet." when nothing is scored.
- **Unofficial notice.** A bordered note above the results: "Unofficial results. This squad is not complete, so scores and places can still change." (or "sweeper"). It shows only while the session is open.
- **Squad.** A "Division" chooser (only with more than one division) lists each division with its entry count. The choice stays in `?division=`; an unknown id falls back to the first division. A line shows the finals and cash ratios. The table has the lines, tie marks, tags, and sections described above. A row is a block on a narrow screen; there is no sideways scroll.
- **Sweeper.** One table with a summary line (entries, cashing, cut score). Each row shows the division under the name.
- **Print.** "Print all divisions" and "Print results" put a print copy on the page and open the browser print dialog. Each division prints on its own letter page (8.5 x 11 in, 0.5 in margin), black on white, with the title, date, division, and sponsor image. An open session prints "UNOFFICIAL RESULTS" under the header on every page.

## Test cases

Built with this slice (the first sections down to the "later features" heading). Each case is one test in the new app. The Source column says where it came from:

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
| RK-13 | Three entries with two tied | Places are 1, 2, 3 and a tie shares no place (SCR-12). Tested in `divisionResult.test.ts` | doc |
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

### Unofficial notice (RES-36, D-84)

Files: `SquadResultsPage.test.tsx`, `SweeperResultsPage.test.tsx`, `PrintResults.test.tsx`.

| ID | Case | Expected | Source |
| --- | --- | --- | --- |
| UN-1 | A squad that is not complete | The page says "Unofficial results. This squad is not complete, so scores and places can still change." | gap (D-84) |
| UN-2 | A complete squad | No notice | gap |
| UN-3 | A sweeper that is not complete, and a complete one | The notice says "sweeper"; none once complete | gap |
| UN-4 | Print of an open squad | "UNOFFICIAL RESULTS" on every division page | gap |
| UN-5 | Print of an open sweeper; print of a complete squad or sweeper | The mark on the open sweeper; none on a complete one | gap |

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
