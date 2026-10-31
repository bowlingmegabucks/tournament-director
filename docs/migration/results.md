# Results

Five result views: squad results, at-large, finals seeding, sweeper results, and super sweeper results. None are stored. Each is computed from scores on request.

All lists rank with `SCR-11` and number places with `SCR-12`. "Total" means scratch plus handicap (or bonus pins). All division counts round **down**.

Source: `business logic/Squads/Results/`, `business logic/Tournaments/Results/`, `business logic/Tournaments/Seeding/`, `business logic/Sweepers/Results/`, `business logic/Models/*Result*.cs`, `presentation/*/Results/`, `presentation/Tournaments/Seeding/`.

| ID | Rule | Status |
| --- | --- | --- |
| RES-01 | Results use every score saved so far. They do not wait for a squad to be complete. **D-74:** squad and sweeper results are public for good. **D-79:** the tab polls every 15 s until the session is complete. **D-84:** while the session is not complete, the page and the printout say "Unofficial results". | Done, differs (D-79, D-84) |

## Squad results

Computed per squad, per division. Squads are processed in date order, because a bowler who advanced in an earlier squad is treated differently in later ones.

### Rules

| ID | Rule | Status |
| --- | --- | --- |
| RES-02 | **Entries** `N` = bowlers in the division with at least one score in the squad. No-shows count once the squad is complete (`SQD-15`). **D-75:** a no-show or a bowler who did not finish still counts, but never advances or cashes, and lists in its own section. | Done, differs (D-75) |
| RES-03 | **Ratios:** squad finals ratio if set, else tournament. Same for cash ratio (`TRN-12`). | Done |
| RES-04 | **Advance spots** `A = floor(N / finalsRatio)`. | Done |
| RES-05 | **Extra cash spots** `C` (beyond the advancers): if `A = 0`, then `C = 1`; else `C = max(floor(N / cashRatio) − A, 0)`. So any division with entries pays at least one spot. | Done |
| RES-06 | **Previous advancers** = bowlers in this division who advanced in any earlier squad. | Done |
| RES-07 | **Advancers** = the top `A` bowlers, skipping previous advancers. | Done, differs (D-81) |
| RES-08 | **Cashers**, in two steps: (1) every previous advancer whose total is **at or above** the last advancer's total (they would have advanced, so they cash instead); (2) then the best remaining bowlers (not advancing, not previous advancers) until there are `C` cashers. If step 1 already reaches `C`, step 2 adds no one, and the cashers can number **more** than `C`. **D-81:** step 2 no longer skips previous advancers: they rank like everyone else, so one below the cut cashes when the rank puts them in a cash place. Only the advancing spots exclude them. | Done, differs (D-81, D-02) |
| RES-09 | **Non-qualifiers** = everyone else, in rank order. A previous advancer below the cut lands here unless the rank puts them in a cash place (D-81). | Done, differs (D-81) |

**Defects** (do not copy): if `A = 0` and a previous advancer bowled the squad, legacy crashes (there is no last advancer to compare with). If there are not enough bowlers left to fill `C`, legacy crashes. The new app should fill what it can. **D-81:** with `A = 0` there is no cut, so the top `C` bowlers cash and a previous advancer is not excluded.

### Worked examples

Finals ratio 8, cash ratio 5.

| Case | Entries | A | C | Result |
| --- | --- | --- | --- | --- |
| Normal | 40 | 5 | `floor(40/5) − 5 = 3` | Top 5 advance, next 3 cash, 32 do not |
| Small | 4 | 0 | 1 | No advancers, top 1 cashes |
| Medium | 6 | 0 | 1 | No advancers, top 1 cashes |

When `A = 0`, `C` is always 1, even if the cash ratio allows more: 7 entries with cash ratio 3 gives `floor(7/3) = 2`, but only 1 cashes. **D-08:** keep this.

Previous advancers (from legacy tests for GitHub issue 9). 40 entries, so `A = 5`, `C = 3`. Five bowlers (A to E) advanced in an earlier squad.

| Situation | Previous advancers this squad | Advancers | Cashers |
| --- | --- | --- | --- |
| 1 | A scores 300 (top). B to E score last | Best 5 who are not A to E | A, then the next 2 best (3 total) |
| 2 | A, B, C score top 3. D, E score last | Best 5 who are not A to E | A, B, C (3 total; no one else) |
| 3 | A to E score top 5 | Next 5 best | A, B, C, D, E (5 total, more than `C`) |

### Display

| ID | Rule | Status |
| --- | --- | --- |
| RES-10 | One table per division, divisions sorted by name. Places run 1 to N through advancers, then cashers, then non-qualifiers. | Done |
| RES-11 | A "Cut Line" row follows the advancers ("No Advancers" when there are none). A "Cash Line" row follows the cashers. **D-14:** the cut line always splits advancers (above) from non-advancers (below). When bowlers on both sides of a line share the same total, the new standings mark them and say which tie-breaker decided it (for example "won on high game"). | Done, differs (D-14) |
| RES-11a | Columns: Place, Name, Total, HG (high game with handicap), HDCP. HDCP shows only if someone in the division has a handicap above 0. **D-76:** a Games column shows while the division's game counts differ. **D-75:** on a complete squad, "Did not finish" and "No show" sections follow the non-qualifiers. | Done, differs (D-75, D-76) |
| RES-11b | Header: "Squad Results", squad date and time, division. |

## At-large

After the squads, more finals spots open so the total number of finalists in a division matches the tournament-wide ratio.

| ID | Rule | Status |
| --- | --- | --- |
| RES-12 | **Total spots** `S = floor(E / tournament.finalsRatio)`, where `E` = the division's entries summed over every squad (a bowler in 3 squads counts 3 times). Squad finals ratio overrides are **ignored** here. See Q-13. **D-84:** the at-large list stays unofficial until every squad of the tournament is complete. |  |
| RES-13 | `Q` = advancers from all squads. If `S ≤ Q`, there are no at-large spots. |  |
| RES-14 | **Pool**: every casher and non-qualifier from every squad, minus any bowler who advanced from a squad. Each bowler appears once, with their **best squad** (highest total; on a tie, the earliest squad). |  |
| RES-15 | **At-large advancers** = the top `S − Q` of the pool. |  |
| RES-16 | **Previous casher** flag: an at-large advancer who cashed in any squad. Reports show a dollar-sign icon. It tells the director this bowler already received a squad cash payout. It happens because the finals ratio (say 1 in 7) is tighter than the cash ratio (1 in 5): a bowler can cash without advancing, then make the at-large. The app changes no amounts (D-07). |  |

Example: 3 squads in a division with 30, 27, and 23 entries, ratio 8. `E = 80`, `S = 10`. Squad advancers: `floor(30/8) + floor(27/8) + floor(23/8) = 3 + 3 + 2 = 8`. Two at-large spots go to the best two bowlers in the pool.

Display (`RES-17`): one table per division. Columns: Place, Squad (date as `MM/dd hh:mm tt`), Name, Total, HG, Casher (icon). Only the at-large advancers are listed. Header "At Large" and the division.

## Finals seeding

| ID | Rule | Status |
| --- | --- | --- |
| RES-18 | **Finalists** = squad advancers plus at-large advancers. **D-84:** seeding stays unofficial until every squad of the tournament is complete. |  |
| RES-19 | Each bowler's seeding score is their **best squad entry** across all squads in the division, not necessarily the squad they advanced from. |  |
| RES-20 | Finalists rank by `SCR-11` and take seeds 1, 2, 3, .... Then every non-finalist follows in rank order, numbering on from the last seed. A "Cut Line" separates the two groups. |  |
| RES-21 | The Casher icon marks at-large advancers who cashed in a squad (`RES-16`). |  |
| RES-21a | Columns: Seed (`#1`), Name, Total, HG, Casher. One table per division. Header "Finals Seeding" and the division. |  |

Running the finals is out of scope. The app stops at the seeding list.

## Sweeper results

| ID | Rule | Status |
| --- | --- | --- |
| RES-22 | Entries = every bowler with a score in the sweeper. **One list for the whole sweeper.** Divisions set bonus pins only; results are not split by division. **D-82:** each row shows the bowler's division under the name. | Done, differs (D-82) |
| RES-23 | Total = scratch + bonus pins × games (`SCR-09`). | Done |
| RES-24 | **Cashers** = `max(floor(N / sweeper.cashRatio), 1)`. The top ones cash. The cut score is the last casher's total. | Done |
| RES-25 | No scores yet: error "No scores entered for sweeper". **D-77:** the new app shows the plain message "No scores entered yet." instead. | Done, differs (D-77) |
| RES-25a | Columns: Place, Name, Total, HG. A "Cash Line" row follows the cashers. Header "Sweeper Results" and the sweeper date. | Done |

## Super sweeper results

| ID | Rule | Status |
| --- | --- | --- |
| RES-26 | Bowlers = registrations in the tournament with `superSweeper` on. **D-84:** super sweeper results stay unofficial until every sweeper of the tournament is complete. |  |
| RES-27 | Each bowler gets **one combined entry**: every game from every sweeper. Total = all scratch pins + bonus pins × all games. |  |
| RES-28 | **Cashers** = `max(floor(N / tournament.superSweeperCashRatio), 1)`. |  |
| RES-29 | No scores yet: same error as `RES-25`. |  |
| RES-29a | Same columns as sweeper results. Header "Super Sweeper Results", no date. |  |

**Defects** (do not copy):

- Bonus pins for the combined entry come from the bowler's **first** sweeper score row and are applied to every game. If a division's bonus pins differ between sweepers, the total is wrong. Use each sweeper's own pins.
- The ranking's game count uses distinct game numbers, so it does not see that a bowler missed a whole sweeper (`SCR-11` note). Nothing checks that the bowler bowled every sweeper. See Q-14.
- With `superSweeperCashRatio = 0`, results fail with divide by zero (`TRN-09`). **D-17:** old tournaments keep 0; the new app shows a clear message for them instead of crashing.
