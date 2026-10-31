# Results (at-large, finals seeding, super sweeper)

Built on branch `finalResults`. Migration source: [docs/migration/results.md](../migration/results.md) (`RES-12` to `RES-21a`, `RES-26` to `RES-29a`), [scores.md](../migration/scores.md) (`SCR-11`, `SCR-12`), and [reports.md](../migration/reports.md) (`RPT-04b` to `RPT-04d`). The squad and sweeper results are in [results.md](results.md); this slice reuses their ranking, tie marks, and print copy.

The three views span the tournament, so they are not tabs of a squad. At-large and Seeding sit in the tournament sidebar; the super sweeper opens from the Sweepers page (D-87). All three are public for good (D-85), print from the browser, and say "Unofficial results" until every squad (at-large, seeding) or every sweeper (super sweeper) is complete (D-84, D-88).

## Fields

No new stored data. The results are computed on each request from the squads, sweepers, divisions, registrations, and saved scores. One new read: the tournament's finals ratio and super sweeper cash ratio (`TournamentRepository.getRatios`; the Prisma model gained the `SuperSweperCashRatio` column, mapped with `@map`).

| Field | Source | Notes |
| ----- | ------ | ----- |
| `E` | The division's entries summed over every squad | A bowler in 3 squads counts 3 times. No-shows and bowlers who did not finish count (D-06, D-75). RES-12 |
| `S` | `floor(E / tournament finals ratio)` | A squad's own finals ratio is ignored (D-86) |
| `Q` | Advancers from all squads | RES-13 |
| At-large spots | `max(S - Q, 0)` | RES-13, RES-15 |
| Seeding score | Each bowler's best entry across all squads | Highest total; a tie goes to the earliest squad (RES-14, RES-19) |
| Super sweeper total | Sum of each sweeper's scratch plus that sweeper's bonus pins times games bowled | A missed game earns no pins (D-90) |

## Rules

Tests live in `api/src/features/results/` and `web/src/features/results/` (the `Tests` column gives the file; test names cite the rule). End-to-end tests are in `web/e2e/tournaments.spec.ts` and `accessibility.spec.ts`.

| ID | Requirement | Differs from legacy | Tests |
| -- | ----------- | ------------------- | ----- |
| RES-12 | Total spots `S = floor(E / tournament finals ratio)`. A squad's own ratio is ignored. | Yes: marked unofficial until every squad is complete (D-84, D-88) | `finals.test.ts`, `loadFinals.test.ts` |
| RES-13 | `Q` = advancers from all squads. With `S <= Q` there are no at-large spots. | | `finals.test.ts` |
| RES-14 | The pool is every casher and non-qualifier of every squad, less anyone who advanced in any squad. Each bowler is in it once, with the best squad (highest total; a tie goes to the earliest). | Yes: a did-not-finish or no-show bowler is not in it (D-91) | `finals.test.ts` |
| RES-15 | At-large advancers are the top `S - Q` of the pool, ranked by `SCR-11`. | | `finals.test.ts` |
| RES-16 | A "previous casher" mark flags an at-large advancer who cashed on a squad. The app changes no amounts (D-07). | | `finals.test.ts`, `loadFinals.test.ts`, `AtLargePage.test.tsx` |
| RES-17 | One table per division: Place, Squad (`MM/dd hh:mm tt`), Name, Total, HG, Casher. A division with no open spots says so. | Yes: one division at a time (D-89) | `AtLargePage.test.tsx`, `AtLargeTable` via the page tests, e2e |
| RES-18 | Finalists are the squad advancers plus the at-large advancers. | Yes: unofficial until every squad is complete (D-84, D-88) | `finals.test.ts`, `loadFinals.test.ts` |
| RES-19 | A bowler's seeding score is their best entry across all squads, not necessarily the squad they advanced from. | | `finals.test.ts`, `loadFinals.test.ts` |
| RES-20 | Finalists take seeds 1, 2, 3 in `SCR-11` order; everyone else follows, numbering on, after a "Cut Line". | | `finals.test.ts`, `format.test.ts`, `SeedingPage.test.tsx` |
| RES-21, RES-21a | The casher mark flags at-large advancers who cashed. Columns: Seed (`#1`), Squad, Name, Total, HG, HDCP only when someone in the division has a handicap above 0, Casher. | Yes: Squad and HDCP added (D-92) | `SeedingPage.test.tsx`, `loadFinals.test.ts` |
| RES-26 | The bowlers are the registrations with the super sweeper on. | Yes: unofficial until every sweeper is complete (D-84, D-88) | `superSweeper.test.ts`, `loadFinals.test.ts` |
| RES-27 | One combined entry from every sweeper. Each game takes its own sweeper's bonus pins. | Yes: legacy used the first sweeper's pins for every game (D-90, D-02) | `superSweeper.test.ts` |
| RES-28 | Cashers are `max(floor(N / super sweeper cash ratio), 1)`, never more than `N`. | Yes: a ratio of 0 or less gives a clear message (D-93, D-17) | `superSweeper.test.ts`, `loadFinals.test.ts`, `finalsRoutes.test.ts` |
| RES-29, RES-29a | No scores shows "No scores entered yet." Columns: Place, Name (with division and tags), one per sweeper, Total, HG, and a "Cash Line" after the last casher. | Yes: a column per sweeper and a plain message (D-77, D-90) | `SuperSweeperPage.test.tsx` |
| RES-37 | New. Three web-only routes serve the views. Public for good (D-85). Not vendor-visible (D-09). | New | `finalsRoutes.test.ts`, `app.test.ts`, `finals.db.test.ts` |
| RES-38 | New. The sidebar gains "At-large" and "Seeding"; the Sweepers page links to "Super sweeper results", hidden with no sweepers. | New (D-87) | `TournamentLayout.test.tsx`, `SweepersPage.test.tsx`, e2e |
| RES-39 | New. At-large and seeding print from the browser, one division per letter page: "Print this division" (the chosen one) and "Print all divisions". Squad results gain "Print this division" too. The super sweeper prints one list. | New (D-89) | `PrintResults.test.tsx`, `useResultsPrint.test.tsx`, the four page tests, e2e print tests |
| RES-40 | New. The pages ask again every 15 seconds until every squad (or sweeper) is complete. A failed refresh keeps the last results. Until then the page and every printed page say "Unofficial results". | New (D-88) | the three page tests |
| RES-41 | New. In a complete sweeper, a super sweeper bowler with no score, or fewer games than the sweeper has, gets 0 for each missing game and no bonus pins. The row carries "Missed a sweeper" or "Did not finish a sweeper" and a note naming the sweeper. An open sweeper adds nothing and shows a dash. | New (D-90, Q-14) | `superSweeper.test.ts`, `SuperSweeperPage.test.tsx`, `format.test.ts` |
| RES-42 | New. A tournament finals ratio, a squad ratio, or the super sweeper cash ratio of 0 or less answers 422 `{ message }`. | New (D-93, D-17, D-83) | `loadFinals.test.ts`, `finalsRoutes.test.ts`, the page tests, `api.test.ts` |
| SCR-11 | Ranking is unchanged. Games bowled for the super sweeper counts every game (zero-filled ones included), not distinct game numbers. | Yes (D-90) | `superSweeper.test.ts` |

## API

Three routes, all web-only and public (D-85, D-09). Zod schemas are in `api/src/features/results/types.ts`; the web types in `web/src/features/results/types.ts` match. Errors: `400` not a UUID, `404` unknown tournament, `422` a ratio of 0 or less, `500` a bad tournament row, `503` the database is down. `complete` is true only when the tournament has squads (or sweepers) and every one is complete.

| Route | Response |
| ----- | -------- |
| `GET /v1/tournaments/{id}/at-large` | `AtLargeResults` |
| `GET /v1/tournaments/{id}/seeding` | `SeedingResults` |
| `GET /v1/tournaments/{id}/super-sweeper` | `SuperSweeperResults` |

```
AtLargeResults {
  complete, finalsRatio                         // the tournament's (D-86)
  divisions: [{ id, number, name,               // by name; a division with no entries is left out
    entries: E, totalSpots: S, squadAdvancers: Q, atLargeSpots,
    rows: [{ registrationId, name, place, squadDate, total, highGame, previousCasher, ties }] }]
}

SeedingResults {
  complete, finalsRatio,
  divisions: [{ id, number, name, entries, finalists, atLarge, showHandicap,
    rows: [{ registrationId, name, seed, group: 'finalist' | 'other', squadDate,
             total, highGame, handicap, previousCasher, ties }] }]
}

SuperSweeperResults {
  complete, cashRatio, entries, cashers, cutScore,
  sweepers: [{ id, date, games, complete }],    // date order: one column each
  rows: [{ registrationId, name, place, group: 'casher' | 'other', divisionName,
           sweeperTotals: (number | null)[],    // aligned with `sweepers`; null = open, no score yet
           total, highGame, games, ties,
           flags: [{ kind: 'missed' | 'unfinished', sweeperId, gamesBowled }] }]
}
```

The routes send no SSN, gender, birth date, address, email, phone, average, or payments (BWL-17).

## Screens

- **At-large** (`/tournaments/{id}/at-large`). A "Division" list (only with more than one), kept in `?division=`; "Print this division" and "Print all divisions"; the unofficial notice; a summary line ("80 entries, 10 finals spots (ratio 8), 8 advanced from squads, 2 at-large spots"); the table. The tie mark calls the cut "the last at-large spot".
- **Seeding** (`/tournaments/{id}/seeding`). The same chooser and buttons; a summary line ("10 finalists (8 from squads, 2 at-large), 70 others"); the table with a "Cut Line".
- **Super sweeper** (`/tournaments/{id}/super-sweeper`). A link back to Sweepers, a "Print results" button, the notice, a summary line (entries, cashing, cut score), and the table. A row is a block under 40 rem, with the sweeper date above each figure; there is no sideways scroll.
- **States.** Each page uses the shared `Loading`, `QueryError` with Try again (the 422 message shows as it comes), and "No scores entered yet." with no rows.
- **Print.** One division per letter page (8.5 x 11 in, 0.5 in margin), black on white, with the sponsor image; "UNOFFICIAL RESULTS" on every page until complete. No PDF save (D-62).

## Test cases

Each case is one test. The Source column says where it came from: `legacy Name` (a WinForms unit test, ported), `gap` (legacy has no test; we added one), or `doc` (a worked example in the migration docs). Cases AL-6, SD-6, and SS-2 test legacy error flows (a mock returns an error); the new app has no twin, and the route and loader tests cover the same ground (an unknown tournament is a 404, a ratio of 0 or less is a 422, the database being down is a 503). AL-5 and SS-1 are legacy checks that a mock was called; `loadFinals.test.ts` checks the real result instead (AL-5b above). Every legacy test of the at-large and seeding calculators and business logic has a port or a replacement: AL-1 to AL-4, AL-5b, SD-1b, SD-2b, SD-8.

### At-large (RES-12 to RES-17)

Files: `api/src/features/results/finals.test.ts` (the calculation) and `loadFinals.test.ts` (reading squads, the complete flag, ratios).

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
| AL-10 | A squad has its own finals ratio | At-large still uses the tournament ratio (RES-12, D-86) | gap |
| AL-11 | A tie for the last at-large spot | The same tie marks as squads (D-14) | gap |
| AL-12 | Two divisions | Each is worked out alone | gap |
| AL-14 | Some squad of the tournament is not complete | The at-large list is marked unofficial; it is official only when every squad is complete (D-84) | gap |
| AL-5b | Two divisions with 5 and 6 entries at tournament ratio 5 | Each division reports its own entries (5 and 6) and its own spots (1 and 1) | legacy `TournamentResultsBOTests` (`Entries` of 5 and 6; ratio 5 passed to each division) |
| AL-13 | The display | Columns Place, Squad (`MM/dd hh:mm tt`), Name, Total, HG, Casher | doc (RES-17) |
| AL-13b | Two divisions with at-large advancers, one of whom cashed on a squad | Places run from 1 in each division; only the bowler who cashed is flagged | legacy `TournamentResultsAdapterTests` (places 1, 2 in each division; one previous casher) |

### Finals seeding (RES-18 to RES-21a)

Files: `api/src/features/results/finals.test.ts` and `loadFinals.test.ts`.

| ID | Case | Expected | Source |
| --- | --- | --- | --- |
| SD-1 | Squad advancers 297 and 299, an at-large 250, other scores 150, 198, 197, 167, no re-entries | Seeds 299, 297, 250. Non-finalists 198, 197, 167, 150, numbering on | legacy `Execute_NoReEntries_CorrectSeedingReturned` |
| SD-1b | The exact legacy data across two squads: advancers 297 (squad 1) and 299 (squad 2), the at-large 250 in squad 1, others 150, 198, 197, 167 | Finalists 299, 297, 250; others 198, 197, 167, 150 | legacy `Execute_NoReEntries_CorrectSeedingReturned`, ported with the at-large result given |
| SD-2b | The exact legacy data with the re-entering bowler (198 in squad 1, 167 in squad 2) | One entry for the bowler, the better one; others 198, 197, 150 | legacy `Execute_ReEntries_CorrectSeedingReturned`, ported |
| SD-2c | The at-large result lists bowlers who cashed (some not in the seeding at all) | Only the at-large finalists who cashed are flagged. Legacy passed the whole list on; the new app lists only those who are finalists | legacy `Execute_ReEntries_CorrectSeedingReturned` (the `AtLargeCashers` assert) |
| SD-8 | Two divisions of six bowlers | Seeds run 1 to 6 in each division, finalists first | legacy `TournamentSeedingAdapterTests` (seeds 1 to 5 in each division) |
| SD-2 | One bowler appears twice (198 and 167) | Counts once, with the best entry (198). Non-finalists 198, 197, 150. The at-large casher flags carry over | legacy `Execute_ReEntries_CorrectSeedingReturned` |
| SD-3 | A finalist who advanced from squad 1 but scored higher in squad 2 | Seeded on the squad 2 score (RES-19) | gap |
| SD-4 | Ranking uses SCR-11 with handicap | As squads | gap (legacy issue #122 asks for handicap on the report) |
| SD-5 | The "Cut Line" between finalists and the rest | Present | doc |
| SD-6 | Errors from the tournament result | Error flow | legacy `TournamentSeedingBOTests` |
| SD-7 | Some squad of the tournament is not complete | The seeding is marked unofficial; official only when every squad is complete (D-84) | gap |

### Super sweeper (RES-26 to RES-29a)

Files: `api/src/features/results/superSweeper.test.ts` (the calculation) and `loadFinals.test.ts` (reading sweepers, the complete flag, the ratio).

| ID | Case | Expected | Source |
| --- | --- | --- | --- |
| SS-1 | A tournament with 2 sweepers | Scores of both are read | legacy `RetrieveScoresExecute_CalledCorrectly` |
| SS-2 | An error reading the tournament or scores | Error flow | legacy `...HasError_ErrorFlow` |
| SS-3 | No scores | The same message as a sweeper (D-77) | legacy `NoScoreFlow` |
| SS-4 | 4 super sweeper bowlers, 2 games, cash ratio 2 | 2 cashers, cut score 411 | legacy `SuperSweeperSuccess_SweeperCutReturnedWithCorrectFields` |
| SS-5 | Same, cash ratio 500 | 1 casher, cut score 415 | legacy `CashRatioMakesCasherCountLessThan1` |
| SS-6 | A bowler who is not in the super sweeper (scores 300, 300) | Left out of the results | legacy `BowlerNotInSuperSweepers` |
| SS-7 | Two sweepers with different bonus pins | Each game gets its own sweeper's pins | gap: legacy uses the first sweeper's pins for every game (RES-27 defect) |
| SS-8 | A bowler who skipped a whole sweeper, or did not finish one, in a complete sweeper | Scores 0 for the missing games, no bonus pins, a tag and a note (D-90); an open sweeper adds nothing | gap (D-90) |
| SS-9 | Games bowled | Counts every game, zero-filled ones included (D-90), so a bowler with 6 games over 2 sweepers ranks above one with 3 | gap |
| SS-10 | Cash ratio 0 on an old tournament | A clear message, not a crash (D-17) | gap |
| SS-11 | Cash ratio 1 | Every bowler cashes | gap |
| SS-12 | Results reached from the sweeper list (D-23, D-87) | A "Super sweeper results" link above the cards, hidden with no sweepers; the route is public (D-85) | gap |
| SS-13 | Some sweeper of the tournament is not complete | The super sweeper results are marked unofficial; official only when every sweeper is complete (D-84) | gap |
