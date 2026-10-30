# Plan: scores (view)

Branch: `scores-view` (already open, so no `migrate-scores`). Delete this file when the work is done.

This slice is the read-only Scores tab of a squad or sweeper. Entry, edit, ranking, and live push come later.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| Storage (`SquadScores`) | In (read) | A read-only Prisma model |
| SCR-10 | In | The row's division is the bowler's registration division |
| SCR-13 | In | Grouped by pair, sorted by lane then letter (`LAN-04`); no-lane note; "Other positions" (D-69, D-71) |
| SCR-14 | In (display) | A complete session shows "Scores cannot change". The server refusal waits for the save route |
| SQD-17 | In (display) | The view has no entry controls in either state |
| SCR-16 (new) | In | `GET .../scores` route, web only, public (D-69, D-70) |
| SCR-17 (new) | In | Scores tab and page |
| SCR-18 (new) | In | Poll every 15 s (D-72) |
| SCR-01 to SCR-06, SCR-15 | Later | Entry slice. SCR-05 and SCR-06 carry the D-02 defect |
| SCR-07, SCR-08, SCR-09 | Later | Results. Scratch only here (D-68). The row total is a plain sum, not SCR-08 |
| SCR-11, SCR-12 | Later | Results |
| SQD-15 | Later | The Complete feature. The view shows the 0s it writes |
| LAN-04, LAN-13 | Already done | Reused |

## Decisions used

- D-68: scratch only. No handicap, no bonus pins.
- D-69: grouped grid, route and tab paths, scratch total, blank and 0, extra columns, complete line.
- D-70: public for good.
- D-71: no-lane note with link; "Other positions" with scores.
- D-73: no pair-size check on the scores view.
- D-72: poll every 15 s until push exists.
- D-10: complete is read only (the server refusal is for the save route).
- D-58, D-60, D-61: pair layout, portal tabs, stored positions.
- D-42 style: unreadable stored rows are skipped and logged.
- Q-33 (open): live push for the entry slice. Documented, not built.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| SCR-13 | One grid sorted by position; bowlers without a position are hidden | Grouped by pair; a no-lane note and link; "Other positions" shown | D-69, D-71 |
| SCR-14 | Paste and save are off on a complete squad | No entry controls at all; a complete line | D-69 |
| Grid | An editable grid | Read only. Entry is a later slice | D-69 |
| Total | None on the grid | A scratch total per bowler | D-68, D-69 |
| Refresh | Read once per screen | Polls every 15 s | D-72 |

## API

`GET /v1/tournaments/{id}/squads/{sessionId}/scores` and `GET /v1/tournaments/{id}/sweepers/{sessionId}/scores`. Web only, not vendor-visible (D-09). Access `public`, and it stays public (D-70, D-27).

```
200 {
  session: { id, kind, date, complete, games },   // games = columns shown (D-69)
  pairs: [{ firstLane, lanes, bowlers: ScoreBowler[] }],   // only pairs with bowlers
  noLane: number,                                  // bowlers with no position (D-71)
  other: ScoreBowler[]                             // stored position fits no pair (D-61, D-71)
}
ScoreBowler = { registrationId, name, divisionName, position, scores: (number | null)[], total }
```

- `scores` has `games` entries. `null` is no score. `total` is the sum of the scores present, 0 when none.
- `games` is the larger of the session's game count (tournament `games` for a squad, the sweeper's own) and the highest stored game number.
- Pairs and bowlers sort as the lane page does (`LAN-04`). A pair with no bowlers is left out (owner, review). `other` sorts by position text.
- Errors, in the lane route's order (`LAN-14`): 400 not a UUID; 404 unknown tournament, then unknown session (or the other kind); 500 stored tournament breaks its shape; 503 database down. **No 422:** the scores view does not check bowlers per pair (D-73), so an old session with any pair size shows its scores.
- A stored score row with a game below 1 or a score that is not a whole number is skipped and logged once per process with the session id and bowler id (D-69).
- A position that fits no pair logs a warning with the registration id, once per process, as the lane route does (`LAN-17`). The same helper serves both.
- A score for a bowler who is not entered in the session is ignored (a `SquadScores` row with no `SquadRegistration`).
- Never sent: SSN, gender, birth date, average, contact details (`BWL-17`). Names, division, position, and scores only.

Reuse: `loadLanePage` already finds the tournament, the session, and the entries. It gains a returned `entries` list so the scores route does not read them twice, and an option to skip the pairs-per-pair check (the lane routes keep it; the scores route turns it off). `buildPairs` does not need `maxPerPair` for grouping, only for `capacity`, which this route does not send; `LaneEntry` gains `bowlerId` (scores link to the bowler, not the registration, `domain-model.md` fact 3). The lanes response does not change.

## Web

Mockups in [scores-mockups/](scores-mockups/index.html): `scores.html` shows every state in turn.

- **Route and tab.** `.../squads/:sessionId/scores` and `.../sweepers/:sessionId/scores` under the existing portal. The portal's tab list gains "Scores" after "Lane assignments". The portal root still opens the lanes tab.
- **`ScoresPage`** (`web/src/features/scores/`): title `Scores · {date} · {tournament} · Tournament Director`. It follows the page header from D-60.
- **One table per pair.** A heading ("Lanes 1-2"), then a `<table>` with columns Lane, Bowler (the division sits under the name), G1 to Gn ("Game n" for screen readers), Total. Row header is the bowler. A score cell is the number, a blank (with visually hidden "no score"), or "0". The Total column is bold. **No horizontal scroll** (owner rule, now in the standards): below 40rem each row becomes a block, with lane and bowler on top and the game cells wrapping in a grid under their labels ("G1", "Total"). The markup keeps explicit table roles so the layout change leaves the semantics. Checked at 320px with 6 games.
- **States.** Loading (`Loading` with rows). Error (`QueryError`, Try again). Empty: "No bowlers have entered this squad yet." (or sweeper); and "No one has a lane yet. Assign lanes first." with a link when every bowler is in `noLane`. Open: no extra line. Complete: "This squad is complete. Scores cannot change."
- **No-lane note.** "3 bowlers have no lane." with a link to the Lane assignments tab, shown above the tables when `noLane` > 0 and the session has bowlers.
- **Other positions.** A table of the same columns after the pairs, read only, with the raw stored text in the Lane column (D-71).
- **Polling.** `useScores` sets `refetchInterval: 15000`; TanStack Query pauses it in a background tab. A refetch error keeps the last data on screen and shows nothing new until it recovers (the query default). No toast on each refresh.
- **Files.** `ScoresPage.tsx`, `PairScores.tsx` (one table), `ScoreTable.tsx` if the pair and other tables share markup, `format.ts`, `api.ts`, `types.ts`, `useScores.ts`, with CSS Modules and the tokens. No new dependency.
- **Mocks.** A handler for both routes and a factory in `src/mocks/data.ts`.

## Data

- A hand-written Prisma model for `SquadScores`: `bowlerId`, `squadId`, `game`, `score`, composite id `(bowlerId, squadId, game)`, mapped column names, no relations. No migration (D-30). Reads only.
- `ScoreRepository.listScores(sessionId)` returns `{ bowlerId, game, score }[]`, with an in-memory twin for route tests, as `LaneRepository` does. A `scoreRow.ts` reads one stored row and skips a bad one (D-42 pattern).
- `db:seed` gains sample scores: a complete squad with every game and some 0s for no-shows, an open squad with a part-filled pair and one pair with no scores, a sweeper with scores. Running the seed again resets them.
- The `api/` and `web/` `types.ts` carry the same shape. Change both together.

## Tests

| Rule | Test |
| --- | --- |
| Storage | `api/src/features/scores/prismaRepository.db.test.ts`: maps game and score; returns only the session's rows; a different session's scores stay out |
| Row skip (D-69) | `api/src/features/scores/scoreRow.test.ts`: game 0 and a fractional score are skipped |
| SCR-10 | `scorePage.test.ts`: "shows the bowler's current division name (SCR-10)" |
| SCR-13 | `scorePage.test.ts`: groups by pair, lane then letter, empty pairs left out, `noLane` counts unassigned, "Other positions" carries scores; `ScoresPage.test.tsx`: renders a table per pair, the no-lane note and link, other positions |
| Blank, 0, total (D-69) | `scorePage.test.ts`: `null` for a missing game, 0 stays 0, total is the sum; `ScoresPage.test.tsx`: blank cell reads "no score", 0 shows "0" |
| Extra columns (D-69) | `scorePage.test.ts`: game 4 in a 3-game session gives 4 columns; `ScoresPage.test.tsx` shows the fourth |
| SCR-14, SQD-17 | `ScoresPage.test.tsx`: complete line; no inputs or buttons that change a score, open or complete |
| SCR-16 | `routes.test.ts`: 200 shape; squad and sweeper; 404 tournament, 404 squad, a sweeper id under `squads`; 400; a pair size outside 2 to 5 still gives 200 (D-73); 503 (a failing repository); one skipped-row warning; `app.test.ts`: mounted public; `web/src/features/scores/api.test.ts`: parses, rejects a bad body, maps 404 and 422 |
| SCR-17 | `SessionPortal.test.tsx`: Scores tab link, active on `/scores`; `ScoresPage.test.tsx`: loading, error with retry, empty states, title; `web/e2e/tournaments.spec.ts`: open a squad, click Scores, see a pair; `accessibility.spec.ts`: axe on the page, dark and light |
| SCR-18 | `useScores` test with fake timers: a second fetch after 15 s shows a changed score; no fetch while the tab is hidden |
| Mutation | `npm run test:mutation` in `api/` and `web/`, survivors fixed |

## Steps

1. API: `bowlerId` on `LaneEntry` (and the Prisma lane select), `loadLanePage` returns its entries. Existing lane tests stay green.
2. API: `scores/types.ts`, `scoreRow.ts`, `repository.ts` with the in-memory twin, `scorePage.ts`, with unit tests.
3. API: Prisma `SquadScore` model, `prismaRepository.ts`, and its `.db.test.ts`. `npm run db:generate`.
4. API: `routes.ts`, mount in `app.ts` and `server.ts` (access `public`), route tests. Update `docs/api-standards.md` only if a new pattern appears.
5. API: `db:seed` scores and the seed test.
6. Web: `types.ts`, `api.ts`, `useScores.ts`, mock handler and factory, with tests.
7. Web: `ScoresPage` and the pair table, no-lane note, other positions, states, with tests.
8. Web: Scores tab and routes in `App.tsx` and `SessionPortal.tsx`.
9. Web: e2e journey and axe path.
10. `npm run check`, e2e, mutation. Each step ends green.

## Not doing

- Entering or editing scores, the save route, the server refusal for a complete session (the entry slice).
- Handicap, bonus pins, ranking, places, results (D-68; the results feature).
- Completing a squad and the no-show zeros (the Complete feature). The view shows zeros that are already stored.
- Live push: WebSockets or SSE. Polling stands in (D-72). The analysis waits for entry (Q-33).
- A score count check against the squad's games, or flags for a bowler with fewer games (Q-21 is for results).
- A "no score" fill for bowlers with no lane: they appear only as a count (D-71).
- Print or copy of the grid (D-67).
