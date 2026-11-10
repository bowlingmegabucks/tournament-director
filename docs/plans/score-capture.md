# Plan: score capture

Branch: `scores`. Delete this file when the work is done.

## Scope

| Rule                     | Bucket                                                                                                                                                                                                      | Note                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| SCR-01                   | In                                                                                                                                                                                                          | Score 1 to 300, API and form                                                                  |
| SCR-02                   | In                                                                                                                                                                                                          | Ids are UUIDs, game is a whole number from 1                                                  |
| SCR-03                   | In, differs                                                                                                                                                                                                 | Earlier empty games fill with 0 (D-229)                                                       |
| SCR-04                   | In                                                                                                                                                                                                          | One game per save, so a duplicate cannot happen; a repeat save updates                        |
| SCR-05, SCR-06           | In, differs                                                                                                                                                                                                 | One score per save, no replace-the-squad (D-228)                                              |
| SCR-14, SQD-17           | In                                                                                                                                                                                                          | Server refuses save, clear, and skip change on a complete session or tournament (D-231, D-10) |
| Number pad               | `PairSheet.test.tsx` "score boxes ask for the number pad" (inputmode, pattern, maxlength, no `type=number`) and "drops a letter typed or pasted"; the lane filter boxes the same; e2e checks the attributes |
| SCR-15                   | In, changed                                                                                                                                                                                                 | Per-field "Saved" mark, no "Scores updated" box (D-228)                                       |
| SCR-18                   | In, changed                                                                                                                                                                                                 | The 15 s poll becomes the public stream (D-232)                                               |
| SCR-16, SCR-17           | Already done                                                                                                                                                                                                | Scores page and route; gain the live line and blank cells (D-237)                             |
| RPT-07                   | Dropped                                                                                                                                                                                                     | Paste from the clipboard (D-67)                                                               |
| SCR-07 to 13             | Already done                                                                                                                                                                                                |                                                                                               |
| LAN-18, LAN-19           | Already done                                                                                                                                                                                                | The cross; reused, and now fed by a stored skip (D-235)                                       |
| New: SCR-19              | In                                                                                                                                                                                                          | `PUT` and `DELETE` one score                                                                  |
| New: SCR-20              | In                                                                                                                                                                                                          | Public score stream                                                                           |
| New: SCR-21              | In                                                                                                                                                                                                          | Game board and pair sheet (D-230)                                                             |
| New: SCR-22              | In                                                                                                                                                                                                          | `GET …/scores/games`: bowlers by the lane they bowl each game (D-234)                         |
| New: SCR-23              | In                                                                                                                                                                                                          | Stored skip: `GET` and `PUT …/skip`; the recap dialog uses it (D-235)                         |
| Results live             | Later                                                                                                                                                                                                       | Next slice (D-233, Q-41)                                                                      |
| Edit after Complete      | Later                                                                                                                                                                                                       | D-10 locks it; no reopen                                                                      |
| Lane breakdown mid-squad | Later                                                                                                                                                                                                       | Out of scope (D-236)                                                                          |

## Decisions used

- D-10: a complete squad or sweeper is locked.
- D-68: scratch pins only; handicap and bonus pins are results concerns.
- D-70: the Scores tab and route stay public.
- D-72: the 15 s poll goes (replaced by D-232).
- D-217, D-218, D-221: one stream per session on the hub, a message is a signal, one instance.
- D-222, D-233: results keep their poll and cache this slice.
- D-223: the rate limit is 100 a minute per address; D-232 gives live routes their own bucket.
- D-97: `scores.write` belongs to the score keeper, director, and admin.
- D-228 to D-237: new in this run (save model, gap fill, game board, complete lock, public stream, results next, games route, stored skip, breakdown out of scope, blank cells).

## Differs from legacy

| Rule           | Legacy                                                     | New app                                             | Decision     |
| -------------- | ---------------------------------------------------------- | --------------------------------------------------- | ------------ |
| SCR-05, SCR-06 | Save sends every row; a failed bowler's scores are deleted | One score per save; nothing else is touched         | D-228        |
| SCR-03         | Gap in games is refused                                    | Gap fills with 0                                    | D-229        |
| SCR-14         | Screens off; server accepts                                | Server refuses                                      | D-231        |
| SCR-13         | One grid, paste                                            | Game board and pair sheet, by the lane of each game | D-230, D-234 |
| LAN-19         | Skip chosen at print time, not stored                      | Stored for each session                             | D-235        |
| Live           | Desktop only                                               | Stream for every viewer                             | D-232        |

## API

All web-only (D-09). `{kind}` is `squads` or `sweepers`. Mounted beside the existing scores routes.

| Route                                                      | Access                         | Success                                                       | Errors                                                                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/tournaments/{id}/{kind}/{sessionId}/scores/games` | `scores.write`                 | `200 { session, skip, games, withoutLane }` (below)           | `400` not a UUID; `404` tournament or session; `422` bowlers per pair not 2 to 5 (as the lane page); `500` bad tournament row; `503` database                                             |
| `PUT …/scores/{registrationId}/{game}` body `{ score }`    | `scores.write`, no API key     | `200 { scores, total }` for that bowler                       | `400` score not a whole number from 1 to 300, or game below 1 or above the session's games; `404` tournament, session, or bowler not entered; `409` session or tournament complete; `503` |
| `DELETE …/scores/{registrationId}/{game}`                  | `scores.write`                 | `200 { scores, total }`                                       | as `PUT`, plus `404` no score to clear, `409` a later game holds a score ("Clear game N first.")                                                                                          |
| `GET …/scores/events`                                      | public                         | `text/event-stream`                                           | `404` unknown session, `503` too many streams                                                                                                                                             |
| `GET …/skip`                                               | `lanes.read` or `scores.write` | `200 { skip: "staggered" \| "same" }` (staggered when no row) | `404`, `503`                                                                                                                                                                              |
| `PUT …/skip` body `{ skip }`                               | `scores.write`                 | `200 { skip }`                                                | `400` other value; `404`; `409` complete session or tournament                                                                                                                            |

**`games` response.** `session { id, kind, date, complete, games }`, `skip`, then `games[]`, exactly one per game 1 to `session.games` (a stored game above that is ignored here: only a complete tournament can hold one, and it takes no entry, D-238), each `{ game, entered, total, pairs[] }`. A pair is `{ firstLane, lanes, bowlers[] }`. A bowler is `{ registrationId, name, divisionName, lane, score, scores, total }`: `lane` is the label for that game (`13A`), `score` is that game's score or `null`, `scores` is every game (so the sheet shows the earlier ones and the "will fill with 0" hint), and `total` is the scratch sum. Pairs sort by first lane, bowlers by lane then letter. `withoutLane` counts bowlers with no lane (no sheet, no entry). Never sent: SSN, gender, birth date, address, email, phone, average, payments (BWL-17). `lane` comes from `cross.ts` (LAN-19) with the stored skip.

- The `games` route is not cached (signed in, and a save must show at once).
- A `PUT` of game N with earlier games empty saves 0 for each (D-229), in one serializable transaction with the score. The response lists them.
- Writing a score over a filled 0 replaces it. Writing the same value again returns `200` and publishes nothing.
- After a write that changed something: drop this session's cached public scores answer, then `events.publish(sessionId, 'scores')` (D-232). A skip change publishes `'lanes'` (entry and recap views refetch).
- `ChangeKind` gains `'scores'`. The lane page ignores that kind; the Scores tab and the entry pages refetch on every kind.
- The score stream reuses `createSessionEventsRouter`; its `check` needs the tournament and session only.
- **Rate limit:** a second limiter, `LIVE_RATE_LIMIT_MAX` (default 600 a minute) per address, covers every method on `/v1/tournaments/:id/(squads|sweepers)/:sessionId/scores…` and `…/skip`, including `PUT`, `DELETE`, and the stream. The general limiter skips those paths. Every other route stays at 100.
- The recap route and `games` both call one `lanesByGame` helper with the stored skip; the recap response keeps sending both patterns (the dialog still switches with no request), and gains `skip`, the stored one.
- Logs hold ids, the game, and the count of filled games, never a name.

## Web

Mockups: [index](score-capture-mockups/index.html), [board](score-capture-mockups/board.html), [pair sheet](score-capture-mockups/pair-sheet.html), [live Scores tab](score-capture-mockups/scores-live.html), [tablet and desktop](score-capture-mockups/wide.html).

- **Routes** (in the squad and sweeper portal, behind `RequirePermission scores.write`): `scores/entry` (goes to the lowest game with a missing score, game 1 when none is missing), `scores/entry/:game` (board), `scores/entry/:game/:firstLane` (pair sheet). A deep link signed out goes to `/login`.
- **Scores tab:** an "Enter scores" link in `<Can permission="scores.write">`, hidden on a complete session or tournament. A Live status line on top. The 15 s poll goes. A blank cell for no score (D-237).
- **Board:** a game switch (`aria-pressed` buttons, each with "n of m"), a skip line ("Skip: Staggered" with Change, which saves through `PUT …/skip`), Find a bowler (a word starts a word of the name; results link to that bowler's sheet in the picked game), the From and To lane filter (kept on the device in `localStorage`, in try/catch), and one tile per pair with "n of m in" and a badge with words. States: loading, error with Try again, setup error (422 message with a lanes link), empty (no lanes yet; the filter shows nothing), complete (read only), live line.
- **Pair sheet:** previous and next pair links and a link back to the game; one block per bowler: lane label, name, running scratch total, a large numeric field (see **Number-only input** below; label "Lane 13A, Dana Rivers, game 2"), a mark (`role="status"`), the earlier games as text ("Game 1: 178", "0 · missed"), and the "saving game 3 saves games 1 and 2 as 0" hint when earlier games are empty. A visible **Next** button (and Enter on a keyboard) saves and moves to the next bowler; after the last, focus goes to the Next pair link. When all scores for the pair and game are in, it says so. Empty box and leave on a saved score clears it (refused with a message when a later game exists). Invalid input shows the message next to the field and does not save. No bowler on the lanes any more: a message and a link to the board.
- **Number-only input.** Each score box is `<input type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next" autocomplete="off" maxlength="3">`, so a phone shows the number pad and nothing else. It is not `type="number"` (that adds spinners, accepts `e` and `-`, and scrolls on a wheel). The change handler also drops any character that is not a digit, so a paste or a hardware keyboard cannot add one. The iOS number pad has no Return key, so the **Next** button is the way on, and the last bowler's button reads **Done**. The Lane filter boxes and Find a bowler follow the same rule where they hold numbers (the filter) and `type="search"` with `enterkeyhint="search"` (the name box).
- **Drafts without effects:** a box shows its draft if the keeper typed one, else the server value, computed during render. A draft clears when its save succeeds. A live update never replaces a draft.
- **Saving:** `useSaveScore` (TanStack mutation per cell) writes the response into the `games` cache and the stream's `changed` message refetches it.
- **Live:** `useSessionEvents` becomes a shared hook taking the stream path, the query keys, and an optional `onChange`, so the lanes page, the Scores tab, and the board all use it. Reconnect refetches once. `LiveStatus` moves to `shared/` and is reused.
- **Public Scores tab:** rows changed by a push stand out for a few seconds; the status line names the bowlers and the game (D-237).
- **Recap dialog:** the skip radios start from the stored skip and save on change (D-235); the print uses the stored one. A signed-in user without `scores.write` sees it fixed, not changeable.
- **Tablet and desktop (48 rem and up):** the board and the pair sheet sit side by side (a master and detail). The board is the left pane (game switch, skip, Find a bowler, filter, tiles); the picked pair's sheet fills the right pane and its tile is marked current (`aria-current`). The address still changes with each pick, so a link to a sheet works and Back works. Nothing picked shows "Pick a pair to enter its scores." The sheet is a grid: lane, bowler, the earlier games as text, the game field, Next, total, and the saved mark. In portrait the board narrows to one column of tiles and the saved mark hides behind the field's border state and a status for assistive tech (`role="status"` stays). Below 48 rem it is the phone layout, one screen at a time. **Scrolling:** on a phone the tile list is part of the page scroll. From 48 rem the left pane sticks to the top at the height of the screen; the game switch, skip, Find a bowler, and filter stay put, and only the tile list scrolls, vertically (`overflow-block: auto`, an `aria-label`, no horizontal scroll). The current tile scrolls into view when the page opens on a pair, using a ref on that tile and no effect. Both layouts use the same components; only the container changes.
- **Phone:** one column, targets at least `--target-min`, the field 3.5 rem tall, no horizontal scroll.
- **Mocks:** MSW handlers for the new routes (`games`, `PUT`, `DELETE`, `skip`) with made-up lane labels, as the recap handler does. The stream stays off under mocks as on the lane page.

## Data

- **New table `SessionSkip`** (`SessionId CHAR(36)` primary key, `Skip` VARCHAR(16)), made by `api/prisma/score-tables.sql`, written like `auth-tables.sql` (create if missing, safe to run again, run once per database, tests run the same file). Modeled in `schema.prisma`; WinForms ignores it. The header comment of `auth-tables.sql` ("the only tables we add") is updated. Production: run the script before the deploy that ships this slice, and add the step to `docs/deployment.md` and `docs/api-standards.md#database`.
- `SquadScores` has no schema change. It is keyed `(BowlerId, SquadId, Game)`; the writer finds `BowlerId` through the registration inside the transaction.
- `scorePlan.ts` (pure): `planSave` and `planClear` take the session facts, the bowler's stored games, and the request, and return what to write (the score plus fill zeros) or a refusal. `lanesByGame` (pure) builds the `games` view from the lane page, the stored scores, and the skip.
- `ScoreWriter` interface with an in-memory twin and a Prisma version (serializable transaction, `withRetry`, `withDatabaseErrors`), as the lane writer. `SkipStore` the same way.
- A `ScoreCache` object wraps the TTL cache so the writer path can drop one session.
- Types: `ScoreSaveResult`, `GamesView`, `Skip` in both `types.ts` files; change both together.

## Tests

| Rule                   | Proof                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SCR-01                 | `scorePlan.test.ts` "refuses 0 and 301 (SCR-01)"; `scoreRoutes.test.ts` 400; `PairSheet.test.tsx` shows "Enter a score from 1 to 300."                                                            |
| SCR-02                 | `scoreRoutes.test.ts` non-UUID, game 0, game above the session's games                                                                                                                            |
| SCR-03 (D-229)         | `scorePlan.test.ts` "fills earlier games with 0"; `scorePrismaWriter.db.test.ts` same in one transaction; `PairSheet.test.tsx` hint text                                                          |
| SCR-04                 | `scorePlan.test.ts` "a second save of a game updates it"; `db` case                                                                                                                               |
| SCR-05, SCR-06 (D-228) | `scorePrismaWriter.db.test.ts` "a save leaves other bowlers' scores alone"                                                                                                                        |
| SCR-14, SQD-17 (D-231) | `scoreRoutes.test.ts` 409 on a complete session and a complete tournament (save, clear, skip); `PairSheet.test.tsx` read only                                                                     |
| SCR-15                 | `PairSheet.test.tsx` "shows Saved" and "shows Not saved with Try again"                                                                                                                           |
| SCR-18 (D-232)         | `ScoresPage.live.test.tsx` refetches on `changed`; no poll                                                                                                                                        |
| SCR-19                 | routes tests: success shape, 404s, clear refusal when a later game exists, repeat save publishes nothing                                                                                          |
| SCR-20                 | `scoreEventsRoutes.test.ts` public, 404, heartbeat, receives the `scores` kind                                                                                                                    |
| SCR-21                 | `GameBoard.test.tsx` (game switch, counts, filter, Find a bowler, empty and error states), `PairSheet.test.tsx` (focus moves, hint, draft kept on a live update), `useSaveScore.test.tsx`         |
| SCR-22 (D-234)         | `lanesByGame.test.ts`: a bowler's lane per game matches `cross.ts` for staggered and same; pairs in game 2 hold bowlers from other start pairs; `scoreRoutes.test.ts` shape and no private fields |
| SCR-23 (D-235)         | `skipRoutes.test.ts` default staggered, set, 400, 409; `skipStore.db.test.ts`; `RecapDialog.test.tsx` starts from and saves the stored skip                                                       |
| Cache                  | `scoreRoutes.test.ts` "a save drops the cached public page"                                                                                                                                       |
| Rate limit             | `rateLimit.test.ts` live paths use the higher bucket; other routes stay at 100                                                                                                                    |
| Permission             | access tests: `scores.write` for score keeper, director, admin; none for signed out or the API key; the Scores tab link hidden without it                                                         |
| Journey                | `web/e2e/scores.spec.ts`: sign in, pick game 2, enter a pair, see it on the public tab; add the routes to `accessibility.spec.ts`                                                                 |

Stryker runs on `scorePlan.ts`, `lanesByGame`, the writer, and the web logic.

## Steps

1. `score-tables.sql`, `schema.prisma`, `SkipStore`, `GET` and `PUT …/skip`, tests; wire the test schema helper.
2. `lanesByGame` and `GET …/scores/games`; the recap route reads the stored skip; tests.
3. `scorePlan.ts` and tests (rules only).
4. `ScoreWriter` (in memory), routes `PUT` and `DELETE`, access, cache drop, publish, tests.
5. Prisma writer and `*.db.test.ts`; wire in `server.ts` and `app.ts`.
6. Public score stream and the `scores` kind; the lane page ignores it; tests.
7. Live rate-limit bucket and config; tests.
8. Web: shared `useSessionEvents` and `LiveStatus`; the Scores tab goes live (poll removed), blank cells, fresh rows, "Enter scores" link; the recap dialog's stored skip.
9. Web: `useSaveScore`, board, pair sheet, routes, permission guard, MSW handlers.
10. e2e and axe; `docs/api-standards.md` and `docs/deployment.md` (the table script, the limit, the stream).
11. Check (`npm run check`), `test:mutation:fast`, fix survivors.

Each step ends with lint, typecheck, and tests green.

## Not doing

- Results on the stream: Q-41, next slice. Squad, sweeper, and finals results keep their 15 s poll and 5 s cache.
- Reopen a complete session, or edit a score after Complete.
- Handicap, bonus pins, and rank on the entry screens (D-68).
- Paste from the clipboard (D-67).
- Per-game lane overrides when a lane breaks (D-236): use Find a bowler.
- A lock or "who is on this pair" marker: keepers split by lane range (D-230).
- A check that a score looks too low or high, beyond 1 to 300.
- Offline queueing: a failed save shows "Not saved" and the keeper retries.
