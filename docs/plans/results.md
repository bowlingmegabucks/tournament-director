# Plan: squad and sweeper results

Branch: `squadResults` (you made it; the skill's default is `migrate-results`). Delete this file when the work is done.

Mockups: [docs/plans/results-mockups/index.html](results-mockups/index.html). Test cases: [docs/requirements/results.md](../requirements/results.md) (IDs like `SQ-4` below point there).

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| RES-01, SQD-19 | In | Use every saved score |
| RES-02 to RES-09 | In | Squad results per division. Crash fixes (D-02) |
| RES-10, RES-11, RES-11a, RES-11b | In | Tables, lines, columns, header. Tie marks (D-14), Games column (D-76) |
| RES-22 to RES-25a | In | Sweeper results. "No scores" is a message (D-77) |
| SCR-07, SCR-08, SCR-09 | In | Handicap and bonus pins in totals. `handicap()` already exists in `api/src/features/lanes/` |
| SCR-11, SCR-12 | In | Ranking and places |
| RPT-01 to RPT-03, RPT-04a, RPT-04b | In | Printable report, from the browser (D-78) |
| RES-30 to RES-34 | In, new | New rules, listed below |
| SCR-10, SQD-20 | Already done | |
| SQD-15, SQD-16 | Later | Complete. Results already read stored zeros |
| RES-12 to RES-21a, RPT-04c, RPT-04d | Later | At-large and seeding. Test cases recorded |
| RES-26 to RES-29a | Later | Super sweeper. Test cases recorded |

New rules (no legacy twin): **RES-30** did-not-finish and no-show sections (D-75, from legacy issue #92). **RES-31** the two web-only routes. **RES-32** the Results tab. **RES-33** print. **RES-34** the 15-second refresh (D-79). **RES-35** a stored ratio that cannot work gives a clear message.

## Decisions used

- D-02: fix defects. D-06: a paid no-show is an entry. D-08: no advancers means one casher. D-10: a complete session does not change.
- D-14, D-16: ties settled by tie-breakers, marks on the standings, a full tie flagged.
- D-22, D-23, D-60: the page header and tabs; Results is a third tab.
- D-45: session order. D-51: skip and log a bad stored row. D-68: handicap and bonus pins arrive with results.
- D-62, D-63: browser print, sponsor image. D-69, D-72, D-73: the Scores tab pattern, polling, no sideways scroll.
- D-74: public for good. D-75: did not finish and no show. D-76: Games column. D-77: no-scores message. D-78: print layout. D-79: refresh. D-80: one division at a time. D-81: earlier advancers. D-82: division under the sweeper name. D-83: ratio of 0 or less.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| RES-02, RES-30 | Everyone with a score is ranked | A complete squad lists did-not-finish and no-show bowlers apart, with no place. They still count as entries | D-75 |
| RES-08, RES-09 | An earlier advancer cashes only at or above the cut, and is left out of the other cash places. Crashes if `A` = 0 with an earlier advancer, or if too few bowlers fill `C` | An earlier advancer ranks like everyone else but cannot advance, so cashes when the rank puts them in a cash place (also when `A` = 0). The tag shows only at or above the cut. No crash; fills what it can | D-81, D-02 |
| RES-22 | Sweeper rows show no division | The division shows under the name | D-82 |
| RES-11 | Lines only | Marks on bowlers tied across a line, with the tie-breaker | D-14, D-16 |
| RES-11a | Fixed columns | A Games column while game counts differ | D-76 |
| RES-25 | Error "No scores entered for sweeper" | "No scores entered yet." | D-77 |
| RPT-03 | Save as PDF, print as images | Browser print, one division per page | D-78 |
| RES-35 (new) | Divide by zero | 422 with a message | D-02 |

## API

Two web-only routes, in `api/src/features/results/`. Public (D-74), declared `public` in `app.ts` (D-27). Not vendor-visible (D-09).

| Route | Response | Errors |
| --- | --- | --- |
| `GET /v1/tournaments/{id}/squads/{sessionId}/results` | `200 SquadResults` | `400` not a UUID; `404` unknown tournament or squad; `422` ratio cannot work; `500` bad tournament row; `503` database down |
| `GET /v1/tournaments/{id}/sweepers/{sessionId}/results` | `200 SweeperResults` | Same, `404` for a sweeper |

```
SquadResults {
  session: { id, kind: 'squad', date, complete, games }
  finalsRatio, cashRatio                      // the squad's effective ratios (D-43)
  divisions: [{                               // by name; a division with no entries is left out
    id, name, number, entries,
    showHandicap, showGames,                  // RES-11a, D-76
    rows: [ResultRow],                        // placed bowlers in display order
    didNotFinish: [ResultRow], noShows: [{ registrationId, name }]   // complete squads only (D-75)
  }]
}
ResultRow {
  registrationId, name, place,
  group: 'advancer' | 'casher' | 'other',     // the page draws Cut Line / Cash Line where the group changes
  total, highGame, handicap, games,           // handicap per game; total and highGame include it
  advancedEarlier: boolean,                   // true only for an earlier advancer at or above the cut score (D-81)
  tie: null | { line: 'cut' | 'cash', outcome: 'won' | 'lost' | 'full',
                decidedBy: { kind: 'games' } | { kind: 'game', rank: number } }   // rank 1 = high game
}
SweeperResults {
  session: { id, kind: 'sweeper', date, complete, games }
  cashRatio, entries, cashers, cutScore: number | null
  rows: [ResultRow & { divisionName, bonusPins }]   // one list; group is 'casher' or 'other'
}
```

Never sent (BWL-17): SSN, gender, birth date, address, email, phone, average, payments. The query names columns, and the reads already exist (`listEntries`, `listScores`).

### How it works

Pure functions, tested alone, in `api/src/features/results/`:

- `ranking.ts`: `compareEntries` (SCR-11) and an entry builder: games, scratch total, high game, handicap per game (squad: `handicap()`; sweeper: bonus pins).
- `squadResults.ts`: one division of one squad. Inputs: entries with scores, the set of earlier advancers (by bowler id), finals and cash ratio, the squad's `games`, `complete`.
  1. `N` = entries with at least one stored score. When complete, split off no-shows (all scores 0) and did-not-finish (fewer than `games`, not a no-show).
  2. Rank the rest. `A` = `floor(N / finals)`. `C` = 1 if `A` = 0, else `max(floor(N / cash) - A, 0)`.
  3. Advancers: the first `A` ranked bowlers who are not earlier advancers. Cut total: the last advancer's total (none when `A` = 0 or nobody advances).
  4. Cashers (D-81): the next `C` bowlers in rank order after the advancers, earlier advancers included, plus any earlier advancer whose total is at or above the cut total and is not already among them. So the cashers can number more than `C`. With no cut, only the first `C` cash. If fewer bowlers remain than `C`, all of them cash. `advancedEarlier` is true only for an earlier advancer at or above the cut total.
  5. Everyone else is "other", in rank order. Places number advancers, cashers, others.
- `ties.ts`: marks for D-14 and D-16. At each line, take the last bowler above it and every bowler with the same total on either side. If both sides have one, mark them: the first of games bowled, high game, 2nd-highest game, and so on that separates the last bowler above from the first below is `decidedBy`; if none, the outcome is `full`. At the cut line, earlier advancers are not in the group (they cash by RES-08).
- `sweeperResults.ts`: rank everyone; `max(floor(N / cash), 1)` cashers, never more than `N`; `cutScore` is the last casher's total; marks at the cash line.
- `loadResults.ts`: the tournament must exist; find the session; list the tournament's squads (they come sorted by `compareSessions`); read entries and scores for every squad up to and including this one; fold in date order, passing each squad's advancers to the next; return this squad's result. Entries whose division is not the tournament's are skipped and logged once (D-51).

Ratios of 0 or less give 422 `{ message }` (RES-35). Cost of a squad request: 2 reads per squad up to this one, plus the tournament and divisions. No new repository and no schema change.

## Web

New folder `web/src/features/results/`. Page, hook, and API call follow the Scores tab (`ScoresPage.tsx`, `useScores.ts`, `api.ts`).

- **Route and tab.** `.../squads/{id}/results` and `.../sweepers/{id}/results`. A third tab "Results" after Scores in `SessionPortal`. Page title `Results · {date} · {tournament} · Tournament Director`.
- **Layout (D-80).** [One division at a time](results-mockups/squad-single.html). A toolbar with a "Division" list (each option shows its entry count; hidden when there is one division) and a "Print all divisions" button, the ratios, then the chosen division. The first division shows at first, and the choice stays in the address as `?division=<id>`, so a reload keeps it; an id that matches no division falls back to the first. A sweeper has no list. The stacked layout ([squad-stacked.html](results-mockups/squad-stacked.html)) was not chosen.
- **Rows.** `DivisionResults` renders one `<table>`: Place, Name, Total, HG, then HDCP and Games when the API says so. "Cut Line", "No Advancers", and "Cash Line" are divider rows. Below 40rem each row becomes a block (no sideways scroll, D-73). Tie marks sit under the name. Did-not-finish and no-show sections follow the table. Sweeper results use the same table with the division under each name (D-82).
- **Earlier advancers (D-81).** [Variant A](results-mockups/previous-advancers.html): a tag "Advanced earlier" by the name and one note under the table, only for an earlier advancer at or above the cut. The other three variants were not chosen. Same look in print, and no color needed.
- **States** ([states.html](results-mockups/states.html), [sweeper.html](results-mockups/sweeper.html)). Loading uses `Loading` with rows. Error uses `QueryError`. Empty is "No scores entered yet." Ratio problems show the 422 message in an alert.
- **Refresh.** `useResults` polls every 15 s, stops when the session is complete, and keeps the last results when a refresh fails (D-79).
- **Print** ([print.html](results-mockups/print.html)). The Print button renders a hidden print copy in a portal, waits for the sponsor image, and calls `window.print()`, as the recap sheets do (D-62). Letter portrait, 0.5 in margin, one `<section>` per division with a page break between: title ("Squad Results" or "Sweeper Results"), `Date: MM/dd/yyyy - hh:mm tt`, `Division: name`, the sponsor image, then the table with its header row repeated on each page. Black on white. The print helper in `recapSheets/print.ts` moves to `web/src/shared/print.ts` and takes a name, so both features share it.
- **Mocks.** Factories in `src/mocks/data.ts` and MSW handlers for the two routes.

## Data

No schema change and no new table. Types: Zod schemas in `api/src/features/results/types.ts`, matching TypeScript types and runtime checks in `web/src/features/results/`. Change both together, as the Scores feature does.

## Tests

Every case is written out in [docs/requirements/results.md](../requirements/results.md).

| Rule | Test |
| --- | --- |
| SCR-11, SCR-12 | `ranking.test.ts`: RK-1 to RK-15 |
| SCR-07 to SCR-09 | `handicap.test.ts` (exists, HD-1); `ranking.test.ts` HD-2 to HD-5 |
| RES-02 to RES-09 | `squadResults.test.ts`: SQ-1 to SQ-26 |
| RES-11 (D-14, D-16) | `ties.test.ts`: TI-1 to TI-10 |
| RES-30 (D-75) | `squadResults.test.ts`: DN-1 to DN-7 |
| RES-01, SQD-19, RES-06 | `loadResults.test.ts`: FL-1 to FL-9 |
| RES-11a, RES-11b | `squadResults.test.ts` RW-1 to RW-6; `ResultsPage.test.tsx` RW-2 to RW-5, RW-7, RW-8 |
| RES-22 to RES-25a | `sweeperResults.test.ts`: SW-1 to SW-12 |
| RES-31, RES-35 | `routes.test.ts`: RT-1 to RT-4; `app.test.ts` (access label) |
| RES-32, RES-34 | `ResultsPage.test.tsx`, `SessionPortal.test.tsx` (tab), `api.test.ts`: WB-1 to WB-3, WB-5 |
| RES-33, RPT-01 to RPT-03 | `PrintResults.test.tsx`, `shared/print.test.ts` (moved): WB-4 |
| Whole path | One `results.db.test.ts` through `createApp` with a real MariaDB: two squads, an earlier advancer in squad 2. e2e: open a squad, open Results, see a division table and a Print button; add the path to `accessibility.spec.ts` |

Mutation tests run on the pure functions; survivors get new assertions, not a lower threshold.

## Steps

Each step ends with lint, typecheck, and tests green.

1. `ranking.ts` and tests (RK, HD). Entry builder.
2. `squadResults.ts` with the A/C maths, earlier advancers, did-not-finish and no-show (SQ, DN).
3. `ties.ts` and tests (TI). Wire the marks into squad results.
4. `sweeperResults.ts` and tests (SW).
5. `types.ts` (Zod), `loadResults.ts`, `routes.ts`, wiring and access label in `app.ts`; tests (FL, RT).
6. `results.db.test.ts`. Check that `db:seed` gives the sample squads at least one advancer and one casher; add sample bowlers if not.
7. Web: types, `api.ts`, `useResults.ts`, mocks and factories (WB-1).
8. Web: `DivisionResults`, `ResultsPage`, the route and tab, narrow layout (WB-1, WB-2, WB-3, WB-5, RW).
9. Move the print helper to `shared/print.ts` (recap sheets stay green). Add `PrintResults` and its CSS (WB-4).
10. e2e and axe.
11. Mutation run on `ranking`, `squadResults`, `ties`, `sweeperResults`; fix survivors.
12. Record (Phase 5): the requirements file, Status columns, Defects index, v1 list, `api-access.md`.

## Not doing

- At-large, finals seeding, super sweeper. Test cases are recorded.
- Complete (SQD-15, SQD-16), score entry, and the server lock (D-10).
- Cash amounts or payouts. The page ranks and draws lines only.
- Running totals across squads (legacy #79). It needs its own discussion.
- A PDF or a server-built report (D-78).
- Did-not-finish sections for sweepers.
- A cache for the results route. A full squad poll costs a handful of reads; add a short cache only if load shows a problem.
- A way to resolve a full tie. The page flags it; the director picks (D-16).

## To settle in review

Nothing open. Settled: layout (D-80), earlier advancers (D-81), division under the sweeper name (D-82), ratio of 0 or less gives a 422 message (D-83). Also agreed: the tie wording ("Tied on total at the cut line. Won the spot on high game." / "Lost the spot on high game." / "Full tie at the cut line. The director decides."), the division in the address, and the branch name `squadResults`.
