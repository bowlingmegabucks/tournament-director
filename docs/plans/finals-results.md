# Plan: finals results (at-large, finals seeding, super sweeper)

Branch: `finalResults` (already created, so no `migrate-` branch). Delete this file when the work is done.

Mockups: [finals-results-mockups/index.html](finals-results-mockups/index.html).

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| RES-12 to RES-16 | In | At-large spots, pool, previous casher (D-86, D-91) |
| RES-17 | In | At-large display (D-89) |
| RES-18 to RES-21a | In | Finals seeding (D-92) |
| RES-26 to RES-29a | In | Super sweeper; fixes the RES-27 defect (D-90, D-93) |
| RPT-04b (super sweeper), RPT-04c, RPT-04d | In | Browser print (D-89) |
| RES-37 to RES-42 | In, new | New requirement rows: routes, pages, navigation, refresh and unofficial, print this division, zero-fill |
| RPT-04a, RPT-04b (sweeper) | In, small | "Print this division" added to squad results (owner request) |
| Q-03 (complete tournament) | Later | Not needed: "official" comes from the squads and sweepers |
| Running the finals | Dropped | The app stops at the seed list |

## Decisions used

- D-85: public for good, web-only routes.
- D-86: at-large uses the tournament finals ratio (Q-13).
- D-87: sidebar At-large and Seeding; Super sweeper button on the Sweepers page.
- D-88: unofficial until every squad (or sweeper) is complete; poll every 15 s until then.
- D-89: one division at a time; "Print this division" and "Print all divisions"; one super sweeper list.
- D-90: missed sweeper scores zero, tagged; one column per sweeper; each sweeper's own bonus pins (Q-14).
- D-91: no-show and did-not-finish bowlers are not in the at-large pool.
- D-92: seeding columns Seed, Squad, Name, Total, HG, HDCP, Casher.
- D-93: tie marks; ratio of 0 or less gives 422.
- D-06, D-07, D-14, D-16, D-17, D-75, D-77, D-81, D-83, D-84: carried over from squad results.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| RES-12 | Unofficial label: none | "Unofficial results" until every squad is complete | D-84, D-88 |
| RES-14 | A no-show could sit in the pool | Not in the pool | D-91 |
| RES-17, RES-21a | One PDF per division | One division on screen; print this or all | D-89 |
| RES-21a | No Squad or HDCP column | Both added (HDCP only when someone has one) | D-92 |
| RES-27 | First sweeper's pins on every game | Each game takes its own sweeper's pins | D-90, D-02 |
| RES-26 | Only bowlers with scores | Opted-in bowlers who missed a complete sweeper rank with zeros and a tag | D-90 |
| RES-28 | Ratio 0 divides by zero | Clear 422 message | D-93, D-17 |
| SCR-11 note | Counts distinct game numbers | Counts all games (zero-filled for complete sweepers) | D-90 |
| RES-29 | Error "No scores entered for sweeper" | Plain "No scores entered yet." | D-77 |

## API

Three web-only, public routes (D-85, D-09). Errors as the session results: `400` not a UUID, `404` unknown tournament, `422` ratio of 0 or less (D-93), `500` bad tournament row, `503` database down. All carry `complete` (D-88).

| Route | Response |
| --- | --- |
| `GET /v1/tournaments/{id}/at-large` | `AtLargeResults` |
| `GET /v1/tournaments/{id}/seeding` | `SeedingResults` |
| `GET /v1/tournaments/{id}/super-sweeper` | `SuperSweeperResults` |

```
AtLargeResults {
  complete: boolean            // every squad complete (D-88); false with no squads scored? see below
  finalsRatio: number          // the tournament's (D-86)
  divisions: [{                // by name; a division with no entries is left out
    id, number, name,
    entries: E, totalSpots: S, squadAdvancers: Q, atLargeSpots: max(S - Q, 0),
    rows: [{ registrationId, name, place, squadDate, total, highGame, previousCasher, ties }]
  }]
}

SeedingResults {
  complete, finalsRatio,
  divisions: [{
    id, number, name, entries, finalists, atLarge, showHandicap,
    rows: [{ registrationId, name, seed, group: 'finalist' | 'other',
             squadDate, total, highGame, handicap, previousCasher, ties }]
  }]
}

SuperSweeperResults {
  complete,                    // every sweeper complete
  cashRatio, entries, cashers, cutScore,
  sweepers: [{ id, date, games, complete }],            // date order; one column each
  rows: [{ registrationId, name, place, group: 'casher' | 'other', divisionName,
           sweeperTotals: (number | null)[],            // aligned with `sweepers`; null = open, no score yet
           total, highGame, games, ties,
           flags: [{ kind: 'missed' | 'unfinished', sweeperId, gamesBowled }] }]
}
```

- `complete` is true only when the tournament has at least one squad (or sweeper) and all of them are complete. A tournament with none shows the empty message.
- `previousCasher` (D-07): the at-large advancer cashed in any squad. A seeding finalist who came through at-large carries it too.
- The routes send no SSN, gender, birth date, address, email, phone, average, or payments (BWL-17).
- The tournament's finals ratio and super sweeper cash ratio are not in the vendor `Tournament` shape. A new read, `getRatios(tournamentId)`, on `TournamentRepository` returns both (Prisma model gains the `SuperSweperCashRatio` column, mapped with `@map`; no migration).

### How the numbers work

1. **All squads.** Refactor `loadResults.ts` so one function works out every squad in date order, passing advancers on (RES-06). `loadSquadResults` keeps its "up to this squad" behavior by using the same function. Output per squad: date, `complete`, per-division outcome and entries.
2. **At-large (RES-12 to RES-16).** Per division: `E` = sum of `entryCount` over squads; `S = floor(E / tournament finals ratio)`; `Q` = sum of advancers; spots = `S - Q`. Pool = every casher and non-qualifier of every squad, less anyone who advanced in any squad. Did-not-finish and no-shows are not in it (D-91). A bowler appears once, with the best entry (highest total; tie goes to the earliest squad). Top `S - Q` of the pool, ranked by `SCR-11`, are the at-large advancers. `previousCasher` = the bowler was a casher in any squad.
3. **Seeding (RES-18 to RES-20).** Finalists = squad advancers plus at-large advancers. Each bowler takes their best entry across all squads (RES-19; includes entries from the squad they advanced in). Finalists rank by `SCR-11` and take seeds 1..n; everyone else (still not no-show or did-not-finish) follows in rank order. The Cut Line sits between the groups.
4. **Super sweeper (RES-26 to RES-29a, D-90).** For each sweeper in date order, build entries with the sweeper's own bonus pins. A bowler is in the list when `superSweeper` is on in any of their sweeper entries. Per sweeper: sweeper total = scratch + bonus pins × games bowled. If the sweeper is complete, a bowler with no score or fewer games than `games` gets 0 for each missing game and a flag; an open sweeper adds nothing (`null` when no score). Overall: `total` = sum of sweeper totals; `highGame` = best single game + that sweeper's pins; `games` = count of games including zero-filled; ranked by `SCR-11` over these. Cashers = `max(floor(N / ratio), 1)`, never more than `N`.
5. **Ties (D-93).** Reuse `ties.ts`: extract a helper that marks bowlers who share a total across a line, so at-large (last spot), seeding (cut line), and super sweeper (cash line) reuse it.

## Web

Files go in `web/src/features/results/` (the pages share the print and table pieces):

- `AtLargePage.tsx`, `SeedingPage.tsx`, `SuperSweeperPage.tsx` and their tests.
- `AtLargeTable.tsx`, `SeedingTable.tsx`, `SuperSweeperTable.tsx`: reuse `ResultsTable.module.css`. A row is a block under 40 rem; the per-sweeper columns carry `data-label` with the date.
- `DivisionChooser.tsx`: pulled out of `SquadResultsPage` so three pages share the "Division" list and the `?division=` handling.
- `useFinalsResults.ts`: `useAtLarge`, `useSeeding`, `useSuperSweeper`, polling every 15 s until `complete` (D-88). Failed refresh keeps the last results. Query keys under `tournamentKeys.detail(id)`.
- `api.ts` additions: fetch and guard the three shapes; a 422 raises `ResultsUnavailableError`.
- `types.ts` additions matching the API.
- `PrintResults.tsx`: take any of the five result shapes. New `PrintFinalsResults` pieces for at-large and seeding (one `section` per division, letter portrait, header, sponsor image, "UNOFFICIAL RESULTS"), and a super sweeper list.
- `useResultsPrint.ts`: `print(scope)` where scope is `'all'` or the chosen division id; the portal prints only what the scope names. Squad results gain "Print this division" next to "Print all divisions" (owner request).
- `UnofficialNotice.tsx`: add `kind: 'tournament-squads' | 'tournament-sweepers'` wording: "Not every squad is complete, so scores and places can still change." (seeding: "seeds").
- Sidebar: `TournamentLayout.tsx` gains "At-large" and "Seeding" after "Registrations". Routes in `App.tsx`: `at-large`, `seeding`, `super-sweeper`.
- Sweepers page: a "Super sweeper results" link above the cards, hidden with no sweepers.
- States on every page: `Loading` with rows, `QueryError` with Try again, "No scores entered yet.", and a 422 message in the error block.
- Mockups: navigation, at-large, seeding, super-sweeper, print.

## Data

No stored data. One schema read change: the Prisma `Tournaments` model gains `superSweeperCashRatio` (`@map("SuperSweperCashRatio")`); `db:seed` sets a ratio and adds sample super sweeper bowlers across two or more sweepers.

## Tests

Reuse the case IDs in [docs/requirements/results.md](../requirements/results.md) (AL-1 to AL-14, SD-1 to SD-7, SS-1 to SS-13). Test names cite the rule. Every In rule has a test:

| Rule | Test file and case |
| --- | --- |
| RES-12, D-86 | `api/.../atLarge.test.ts`: AL-7 (30, 27, 23 entries gives S = 10, Q = 8), AL-10 (squad override ignored), AL-1 and AL-2 (no spots) |
| RES-13 | `atLarge.test.ts`: AL-1, AL-2 |
| RES-14, D-91 | `atLarge.test.ts`: AL-8, AL-9, new case: did-not-finish and no-show not in pool |
| RES-15 | `atLarge.test.ts`: AL-3 |
| RES-16, D-07 | `atLarge.test.ts`: AL-4 |
| D-93 (ties) | `atLarge.test.ts`: AL-11; `ties.test.ts`: the extracted helper |
| RES-17, AL-12, AL-13 | `AtLargePage.test.tsx`: columns, one division at a time, `?division=` |
| RES-18, RES-19 | `seeding.test.ts`: SD-1, SD-2, SD-3 |
| RES-20, RES-21, RES-21a | `seeding.test.ts`: SD-1, SD-5; `SeedingPage.test.tsx`: Cut Line, Squad and HDCP columns (D-92), SD-4 |
| RES-26 | `superSweeper.test.ts`: SS-1, SS-6 |
| RES-27, D-90 | `superSweeper.test.ts`: SS-7 (own pins), SS-8 (zero-fill: missed, unfinished, open adds none), SS-9 |
| RES-28, D-93 | `superSweeper.test.ts`: SS-4, SS-5, SS-10 (ratio 0 gives 422), SS-11 |
| RES-29, RES-29a | `SuperSweeperPage.test.tsx`: SS-3, columns, tags, dash for open, no Games column |
| D-84, D-88 | `atLarge.test.ts` AL-14, `seeding.test.ts` SD-7, `superSweeper.test.ts` SS-13; the three page tests show or hide the notice |
| RES-37 routes | `routes.test.ts` per route; `app.test.ts` lists the access labels; `finals.db.test.ts` (Testcontainers) |
| RES-38 pages and navigation | `TournamentLayout.test.tsx`; `SweepersPage.test.tsx` (button shown, hidden with none); e2e journey |
| RES-39 print this division | `PrintResults.test.tsx`, `useResultsPrint.test.tsx`, squad, at-large, and seeding page tests |
| RES-40 refresh | the page tests, as `SquadResultsPage.test.tsx` WB-3 |
| Accessibility | add the three paths to `web/e2e/accessibility.spec.ts` |
| Mutation | `npm run test:mutation` in `api/` and `web/`; fix survivors |

## Steps

Each step ends green (lint, typecheck, tests, format).

1. Prisma and `TournamentRepository.getRatios` (in-memory fake and Prisma; `db.test`); `db:seed` extension.
2. Refactor `loadResults.ts` to work out all squads once; the existing tests must stay green.
3. Extract the tie-mark helper in `ties.ts`; its tests.
4. At-large: `atLarge.ts` (pure), tests AL-1 to AL-14.
5. Seeding: `seeding.ts` (pure), tests SD-1 to SD-7.
6. Super sweeper: `superSweeper.ts` (pure), tests SS-1 to SS-13.
7. Types, loaders, and routes for the three; mount in `app.ts` with `public` labels; route, `app`, and db tests.
8. Web types, `api.ts`, hooks.
9. `DivisionChooser`; `useResultsPrint` scope; "Print this division" on squad results; tests.
10. At-large page and table; tests.
11. Seeding page and table; tests.
12. Super sweeper page and table; tests.
13. Print copies for the three; print tests.
14. Sidebar items, routes, Sweepers page button; layout and page tests.
15. e2e journey and axe paths; MSW handlers and factories in `web/src/mocks/`.
16. `npm run check`, `test:e2e`, `test:mutation`; fix survivors.

## Not doing

- Running the finals (stepladder or bracket): out of scope.
- Locking the pages behind sign-in: they are public for good (D-85).
- A push channel: polling stays until Q-33.
- A "complete tournament" flag (Q-03): "official" comes from the squads and sweepers.
- Payout amounts: the app marks previous cashers only (D-07).
- A super sweeper registrant who is in none of the sweepers' entry lists: REG-06 stops this, so the page cannot see them.
