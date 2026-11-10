# Plan: live results

Branch: `results`. Delete this file when the work is done.

Two parts: (1) the Results tab goes live and ranks "through the last full game" with a Live toggle; (2) a TV page at `/tournaments/{id}/liveResults` that scrolls every squad, sweeper, and the super sweeper. Mockups: [results-mockups/](results-mockups/index.html).

## Scope

Legacy has no live results and no TV view, so the new rules have new IDs (`RES-40` onward, next free after `RES-39`).

| Rule | Bucket | Note |
| --- | --- | --- |
| `RES-01`, `SQD-19`, `RES-36` (D-84) | Already done | Results use every saved score; "Unofficial results" until complete. The TV shows the notice too |
| `RES-34` (D-79) | **In: replaced** | The 15 s poll goes; the stream replaces it (D-241) |
| `SCR-11`, `SCR-12` | **In: applied to partial data** | Ranking is unchanged. Steady mode ranks on the games every bowler has (D-239) |
| `RES-40` | In | Squad ranking modes: through the last full game (default) and live |
| `RES-55` | `fullGame.test.ts`: a flagged entry is left out of the fewest; every entry flagged leaves none out; a complete session ignores flags; `squadResults.test.ts`: the walk-off case, a bowler with 2 games stops holding back game 3 |
| `RES-56` | `squadResults.test.ts`, `sweeperResults.test.ts`, `superSweeper.test.ts`: `dnf` on the row while open and not after Complete; `ScoreColumns.test.tsx`, `SquadResultsPage.test.tsx`: the tag |
| `SCR-24` | `dnfRoutes.test.ts`: `PUT` and `DELETE`, a repeat is `204`, `404`s, `409` for a complete session or tournament or a bowler with no score, the API key cannot reach them, needs `scores.write`; `prismaDnfWriter.db.test.ts`: on MariaDB; `PairSheet.test.tsx`: the button, the flagged state, Undo, a refusal |
| `SCR-25` | `prismaScoreWriter.db.test.ts`, `scoreRoutes.test.ts`: a score for a flagged bowler removes the flag and publishes; `PairSheet.test.tsx`: the flagged state goes after a save |
| `RES-41` | In | Sweeper uses the same rule |
| `RES-42` | In | Super sweeper uses the same rule, and its page gets the toggle (D-252) |
| `RES-55` | In | The counted games leave out a DNF-flagged bowler (D-248) |
| `RES-56` | In | Open results tag a flagged bowler "DNF" (D-251) |
| `SCR-24` | In | The keeper sets and undoes the DNF flag on the pair sheet (D-248, D-249) |
| `SCR-25` | In | A saved score clears the flag (D-250) |
| `RES-43` | In | A complete session ranks the same in both modes |
| `RES-44` | In | Results tab live over the session stream; wait 2 s; no poll |
| `RES-45` | In | Mode toggle on the squad, sweeper, and super sweeper pages, kept in `?mode=` |
| `RES-46` | In | A game not full yet shows dimmed, with a legend; not counted |
| `RES-47` | In | `GET /v1/tournaments/{id}/live-results`: the TV's first load |
| `RES-48` | In | `division` filter on the squad results route: the TV's update fetch |
| `RES-49` | In | Tournament stream; a save that fills a game sends `{ session, division, game }` |
| `RES-50` | In | TV page: scrolls on its own through every session with scores |
| `RES-51` | In | TV notice strip, queued |
| `RES-52` | In | TV keeps alive: 60 s refetch, wake lock, "Out of date since" line |
| `RES-53` | In | "Reduce motion" turns the scroll into a page flip |
| `RES-54` | In | Sidebar link "Live results"; public; own rate-limit bucket |
| `RES-12` to `RES-21a` | Not live (D-247) | At-large and seeding keep their 15 s poll and what they count today |
| `RPT-01` to `RPT-04d` | Already done | Print uses the loaded data, so it follows the mode on screen |
| Running totals (#79), Q-33 for other pages | Later | Not this slice |

**Defects.** None in the Defects index touches these rules.

**Integration API.** Nothing the registration site sees changes. Every new route is web-only and `public` (D-09, D-242).

**Proposed features.** Add "live results TV page" and "DNF flag" to `proposed-features.md` and mark it built.

## Decisions used

- D-239: two modes; `?mode=full-game|live`; a game counts when every bowler in the division has it; later scores dimmed; cached apart.
- D-240: sweepers and the super sweeper follow the same rule. D-252: the super sweeper page gets the toggle.
- D-248 to D-251: the DNF flag (`SessionDnf`), set on the pair sheet, cleared by a saved score, shown as a "DNF" tag on open results.
- D-241: the Results tab refetches over the session stream after 2 s; the 15 s poll goes. Answers Q-41.
- D-242: the TV page is public, no controls, steady mode only, a sidebar link.
- D-243: new tournament stream; `{ session, division, game }` per division that gained a full game.
- D-244: first load in full; then one division at a time.
- D-245: a notice strip, one message at a time, about 8 s each, no squad name.
- D-246: 60 s safety refetch, wake lock, "Out of date since" line.
- D-247: at-large and seeding are not live.
- D-232: score routes and streams have their own rate-limit bucket; a save drops the cache first. D-217, D-218: SSE on the in-process hub, no data in a message, one instance.
- D-10: a complete session cannot change, so it opens no stream. D-75, D-76, D-81, D-84, D-88: kept as built.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| Live results | None; a report is run on demand | The Results tab and a TV page update by themselves | D-241, D-242 |
| `SCR-11` on partial data | Not defined (reports run after a squad) | Steady mode ranks on the last full game; Live ranks on every saved score | D-239 |
| TV display | None | New page | D-242 to D-246 |

## API

All routes are web-only, `public`, and use no SSN, birth date, address, email, phone, average, or payment (BWL-17).

### Ranking modes (`RES-40` to `RES-43`)

`GET /v1/tournaments/{id}/squads/{sessionId}/results` and the sweeper twin gain `?mode=full-game|live`. No value means `full-game`; anything else is `400`. The answer gains:

```
mode: 'full-game' | 'live'
divisions[].throughGame: number | null   // steady mode: games counted; live mode: null
rows[].dnf: boolean                      // squad, sweeper, and super sweeper rows: flagged while the session is open (D-251)
SweeperResults.throughGame: number | null
```

- **Counted games in a division** = the fewest games any entry in it has, **leaving out flagged (DNF) entries** (D-248; if every entry is flagged, none is left out). A score save fills earlier empty games with 0 (D-229), so each bowler's games are one run from game 1 and the minimum is the last full game. An entry is a bowler with at least one saved score (RES-02).
- **Steady mode on an open session.** Each entry's games, total, handicap total, high game, and tie-breakers use only the first `throughGame` games. Rows keep every saved game in `scores`, so the page can dim games above `throughGame`. Ties, lines, advancers, and cashers follow the counted data.
- **A complete session** counts every game in both modes (`throughGame` = the session's `games`; a bowler with fewer games still goes to Did not finish, RES-30).
- **Live mode** is today's behavior, unchanged.
- **Sweeper:** one list across divisions: the counted games are the fewest of any entry in the sweeper.
- **Super sweeper (`GET …/super-sweeper`):** the route keeps its 15 s poll (D-247 leaves the finals pages alone) and gains `?mode=`. In steady mode each sweeper's counted games are its own last full game while that sweeper is open, so the super sweeper and the sweeper tab agree; the page has the same toggle (D-252). Its answer gains `mode` and, for each sweeper, `throughGame`.
- Cache key now holds the mode and division. A save drops every key of the session (the shared cache below).

### Division filter (`RES-48`)

`GET …/squads/{sessionId}/results?division={divisionId}` returns the same shape with only that division in `divisions`. An id that is not in the squad's results gives an empty `divisions` list (as an empty division is left out, D-77). The server still works out the whole squad, since the cut line needs earlier squads.

### TV feed (`RES-47`)

`GET /v1/tournaments/{id}/live-results` (always steady mode, cached 5 s):

```
LiveResults {
  tournament: { id, name }
  generatedAt                      // ISO time, for "Updated 3:41 pm"
  sessions: [                      // sessions with scores, by date then starting lane
    { kind: 'squad', results: SquadResults }
    | { kind: 'sweeper', results: SweeperResults }
  ]
  superSweeper: SuperSweeperResults | null   // null with no sweeper scores
}
```

Errors: `400` not a UUID; `404` unknown tournament; `422` a ratio that cannot work (D-83); `503` database down. Built on the same loaders as the finals pages (`loadRuns`, which already works out every squad in order); if one pass cannot give each squad's divisions, it calls `loadSquadResults` for each session, which is cheap at about ten sessions and cached.

### Tournament stream (`RES-49`)

`GET /v1/tournaments/{id}/live-results/events`: SSE on the hub (D-217), keyed by tournament id, public, with the heartbeat and `x-accel-buffering: no` of the other streams. It counts in the score routes' rate-limit bucket (D-232, D-223). A message:

```
{ kind: 'game-full', sessionId, sessionKind, divisionId?, game }   // a game just filled
{ kind: 'reopened',  sessionId, sessionKind, divisionId? }         // a clear or an added bowler lowered the count
{ kind: 'complete',  sessionId, sessionKind }                      // the session is complete
```

A message carries only these ids and numbers, never a score (D-218). The `ChangeEvent` type gains an optional `detail`; the per-session streams send none, so they are untouched.

**What sends them.** Before a score save, clear, or fill the API reads each division's counted games for that session; after the write it reads them again and publishes one message for each division where the count changed: up is `game-full` (with the new count as `game`), down is `reopened`. The cost is two small reads per save. The complete routes publish `complete`. A sweeper has no division, so its message names the session and game.

Entry and lane changes do not send a tournament message: they rarely move a full game, and the 60 s refetch covers them.

### DNF flag (`SCR-24`, `SCR-25`, `RES-55`)

- **Table.** `SessionDnf (SessionId, RegistrationId)`, primary key on both, added to `api/prisma/score-tables.sql` and run once per database (local, tests through Testcontainers, production). The Prisma schema gains the model by hand; WinForms never reads it. `docs/api-standards.md#database` and `docs/deployment.md` name the script.
- **Routes** (web-only, `scores.write`, the API key cannot reach them, D-249): `PUT` and `DELETE /v1/tournaments/{id}/squads/{sessionId}/scores/{registrationId}/dnf`, and the sweeper twin. `204` on success, and the same again for a repeat. `404` for an unknown tournament, session, or a registration that is not in the session; `409` with `errors` for a complete session or tournament, or for a bowler with no saved score (`PUT` only). One serializable transaction with retry, like the score writer.
- **Clearing by a score.** The score save (`PUT …/{registrationId}/{game}`) deletes the bowler's flag row in its own transaction (D-250). The fill of earlier games and the `complete` route are unchanged; `complete` leaves the rows alone and the results ignore them for a complete session (D-248).
- **Games view.** Each bowler in `GET …/scores/games` gains `dnf`. The public Scores tab does not show it.
- **Events.** A flag change runs the same before and after read as a score save (the counted games move), so it publishes `game-full` or `reopened` on the tournament stream (D-251), and `scores` on the session stream so the keeper's other screens redraw.

### Shared cache

`scoreCache.ts` already holds `dropSession`. Results routes use the same `ScoreCache` object so one drop clears the scores page and every results key of the session. `dropCacheOnPublish` stays the single wrapper.

## Web

Mockups: [index](results-mockups/index.html), [results-tab](results-mockups/results-tab.html), [tv-scroll](results-mockups/tv-scroll.html) (layout A, chosen), [tv-flip](results-mockups/tv-flip.html) (the reduced-motion fallback), [tv-states](results-mockups/tv-states.html).

### Results tab (`web/src/features/results/`)

- `ModeToggle.tsx`: a radio group "Ranking" styled as two segments: "Through game N" and "Live". `useChosenMode.ts` keeps it in `?mode=` beside `?division=`; a missing or unknown value is steady. N is `throughGame` of the chosen division.
- `useResults.ts`: drop `refetchInterval`. The squad and sweeper hooks take the mode and key on it. A new `useResultsEvents` (like `useScoreEvents`, through `useLivePage`) refetches 2 s after the last message and once on reconnect; it is off for a complete session. The tab shows the shared `LiveStatus` line. A failed refetch keeps the last results.
- `ScoreColumns.tsx` and `DivisionResults.tsx`: derive the figures from `scores.slice(0, throughGame)`; dim games at or above `throughGame` (italic, a dagger, and a hidden "not counted yet" for screen readers); show the legend "† Game N is not full yet…" and "Ranked through game N. Game N+1 has k of n scores." Cards on a phone show "G4 215 †". Sweeper table the same.
- The page title and print copy follow the mode: print draws the data on screen, so a dimmed game prints with its dagger and legend.
- `SuperSweeperPage.tsx`: the same `ModeToggle` and `useChosenMode`; it keeps its 15 s poll with the mode in the query key (D-252). Rows show the "DNF" tag of the sweeper it applies to when that sweeper is open.
- "DNF" tag: the results rows (squad, sweeper, TV) show a small bordered tag by the name when `dnf` is true, with the words for screen readers (D-251).
- Sidebar: a "Live results" link after Seeding, to `/tournaments/{id}/liveResults`.

### Pair sheet (`web/src/features/scores/`)

`PairSheet.tsx`: a "Did not finish" button beside each bowler's box (needs `scores.write`, hidden for a complete session). It sends `PUT …/dnf` through a `useSetDnf` mutation. A flagged bowler shows "Did not finish" with an Undo button in place of the button; the box stays, and a saved score clears the flag (the answer redraws the sheet). Refusals show with the other marks ("failed" with the message). The button asks nothing: Undo is the safety. The empty-box rule is unchanged: an empty box that never held a score does nothing on blur, and one that held a score clears it (D-228).

### TV page (`web/src/features/liveResults/`)

Route `liveResults` under the tournament, outside the sidebar and top bar (full screen). One `<h1>` ("Live results"), landmarks, `lang`, and a page `<title>`.

- `LiveResultsPage.tsx`: loading, error, empty, and filled states as in the mockup.
- `useLiveResults.ts`: the first-load query of `live-results`, stored under one key; `refetchInterval` 60 s (D-246). The stream is `useEventStream` on `live-results/events`.
- `useDivisionUpdates.ts`: on `game-full` or `reopened`, fetch the one division (`?division=`) and replace that division in the cached `LiveResults`; on `complete`, refetch that session; on a reconnect, refetch all. A sweeper message refetches the sweeper.
- `NoticeStrip.tsx` and `noticeQueue.ts`: a queue of strings shown about 8 s each: "Open Division – Game 3 complete", "Sweeper – Game 2 complete", "Session complete – results are official"; idle text "Updated 3:41 pm". `reopened` posts nothing. The updated table gets a gold outline for a few seconds.
- `AutoScroll.tsx` and `useAutoScroll.ts`: a steady scroll (about 40 px a second) through the list plus a copy of it, so the loop has no jump; the copy is `aria-hidden`. A swap keeps the scroll offset. This is the one place that needs an effect: it drives the DOM on an animation frame, an outside system, not derived state. It pauses while the tab is hidden. If the list is shorter than the screen, nothing scrolls.
- `PageFlip.tsx`: with `prefers-reduced-motion: reduce`, one division at a time every 20 s, with a progress bar and dots (layout B). Same data, same notices.
- `useWakeLock.ts`: asks for a screen wake lock, asks again when the tab becomes visible, and does nothing in a browser without it.
- `OfflineLine.tsx`: when a refetch fails or the stream is closed past a grace period, the last results stay and "Out of date since 3:42 pm" shows in a corner.
- Tokens: add `--font-size-tv-body`, `--font-size-tv-head`, `--font-size-tv-small` to `tokens.css`, and check contrast on both themes.
- Mocks: MSW handlers and factories for `live-results`, the division filter, and a fake stream, in `src/mocks/`.

States to cover: loading, first-load error (no button; it retries every minute), empty ("No scores entered yet."), filled, offline, reduced motion.

## Data

No schema change. New types: `RankMode`, `LiveResults`, `LiveEvent` in `api/src/features/results/types.ts` and the web `types.ts`. `throughGame` and `mode` join `SquadResults` and `SweeperResults`. No stored mode (D-239).

## Tests

| Rule | Test (file, case) |
| --- | --- |
| `RES-40` | `api/…/results/fullGame.test.ts`: the counted games are the fewest any entry has; 4 bowlers with 3 games and 2 with 4 count 3; rows keep game 4 in `scores`. `squadResults.test.ts`: the owner's case, a +166 four-game bowler ranks below a +150 leader in steady and above in live |
| `RES-40` | `squadResults.test.ts`: cut and cash lines and ties follow the counted data; a bowler added late (first score in game 3, games 1 and 2 zero) |
| `RES-41` | `sweeperResults.test.ts`: divisions count together; steady and live differ |
| `RES-42` | `superSweeper.test.ts`: an open sweeper counts its last full game; a complete one counts all; `SuperSweeperPage.test.tsx`: the toggle and `?mode=` |
| `RES-43` | `squadResults.test.ts`: a complete session gives equal output in both modes; a did-not-finish bowler still goes to the section |
| `RES-44` | `web/…/SquadResultsPage.test.tsx`, `SweeperResultsPage.test.tsx`: a `changed` message refetches once after 2 s, and a burst refetches once; no timer poll; a complete session opens no stream; a failed refetch keeps the last results (replaces the 15 s tests of `RES-34`) |
| `RES-44` | `api/…/results/routes.test.ts`: a score save drops the cached results of that session (both modes and the division) before it publishes |
| `RES-45` | `ModeToggle.test.tsx`, `useChosenMode.test.tsx`, and the three page tests: the default is steady; `?mode=live` selects live; an unknown value is steady; the label reads "Through game N"; `routes.test.ts`: a bad `mode` is `400` |
| `RES-46` | `ScoreColumns.test.tsx`, `SquadResultsPage.test.tsx`: a game above `throughGame` is dimmed, has the dagger and the legend, and is not in the figures; phone card text; sweeper twin |
| `RES-47` | `liveResultsRoutes.test.ts`: shape, order, sessions without scores left out, `404`, `422`, `400`, cached 5 s; `liveResults.db.test.ts`: against MariaDB with two squads and a sweeper |
| `RES-48` | `routes.test.ts`: `?division=` returns one division; an unknown id gives an empty list; the cut line still uses earlier squads |
| `RES-49` | `fullGames.test.ts`: before and after reads give `game-full` for a rise and `reopened` for a fall, and nothing when unchanged; `scoreRoutes.test.ts`: a save publishes the message; a clear publishes `reopened`; the complete route publishes `complete`; `liveEventsRoutes.test.ts`: the stream is public, sends the heartbeat, and sends no scores |
| `RES-50` | `LiveResultsPage.test.tsx`: the states; every session with scores shows, in date order; `useAutoScroll.test.tsx`: moves on a fake frame clock, loops, keeps its offset when a table is swapped, does not move while hidden; `useDivisionUpdates.test.tsx`: a division message fetches only that division and replaces it |
| `RES-51` | `noticeQueue.test.ts`, `NoticeStrip.test.tsx`: queue order, 8 s each, idle text, `reopened` says nothing |
| `RES-52` | `useLiveResults.test.tsx`: the 60 s refetch; `useWakeLock.test.tsx`: requests and renews, and is silent without support; `OfflineLine.test.tsx`: shows after a failed refetch and keeps the last results |
| `RES-53` | `LiveResultsPage.test.tsx`: with reduced motion the page flips division by division, with no scroll |
| `RES-54` | `app.test.ts`: the three new routes are `public`; `SidebarNav` test: the "Live results" link shows for everyone; rate-limit bucket test for the new stream path |
| Whole slice | `web/e2e/liveResults.spec.ts`: the TV page loads with mocks, shows a strip when a message arrives, and passes axe in both color schemes (add the path to `accessibility.spec.ts`); a Results-tab test of the toggle |

Mutation: run `npm run test:mutation:fast` for `fullGame`, `fullGames`, `noticeQueue`, and the hooks; fix survivors.

## Steps

Each step ends green: lint, typecheck, tests, format check in each folder it touches.

1. API: `fullGame` (counted games) and the `mode` option in the entries and results code, with unit tests (`RES-40` to `RES-43`).
2. API: `?mode=` and `?division=` on the results routes, the shared cache, and `throughGame` and `mode` in the answers (`RES-45`, `RES-48`).
3. API: the `SessionDnf` table, model, writer, and routes; the score save clears the flag; the games view gains `dnf`; counted games leave flagged entries out (`SCR-24`, `SCR-25`, `RES-55`).
4. API: the `fullGames` before and after read, the tournament stream, the `detail` on `ChangeEvent`, the publish calls in the score and complete routes, the rate-limit bucket (`RES-49`, `RES-54`).
5. API: `GET …/live-results` (`RES-47`) with its database test.
6. Web: types, api calls, mocks, and the mode in the query keys.
7. Web: the Results tab and the super sweeper page: toggle, dimmed games, legend, "DNF" tag, stream (not the super sweeper), no poll (`RES-44` to `RES-46`, `RES-56`).
8. Web: the pair sheet's "Did not finish" button and Undo (`SCR-24`, `SCR-25`).
9. Web: sidebar link and the full-screen route (`RES-54`).
10. Web: the TV page: query, states, `AutoScroll`, `useDivisionUpdates` (`RES-50`).
11. Web: notice strip, offline line, wake lock, 60 s refetch, page flip, TV tokens (`RES-51` to `RES-53`).
12. E2E and axe; mutation runs; `docs/deployment.md` and `docs/api-standards.md` note the `SessionDnf` script and any App Service note for the stream.
13. Record: requirements, the migration docs, Q-41, the plan removed.

## Not doing

- **Live at-large and seeding.** They keep the poll (D-247).
- **A stream for the super sweeper page.** It keeps the 15 s poll, with the toggle. Moving it to the tournament stream is a small later step.
- **A DNF flag on the Scores tab.** The public Scores tab does not show it.
- **A toggle on the TV page.** It always uses steady mode (D-239, D-242).
- **A chooser for which sessions the TV shows.** It shows every session with scores (D-242).
- **A nightly reload** (D-246).
- **A tournament message for entry and lane changes.** The 60 s refetch covers them.
- **More than one API instance.** The hub is in the process (D-224).
- **A running per-game total** on squad reports (#79).
- **Lanes that break down mid-squad** (D-236).
