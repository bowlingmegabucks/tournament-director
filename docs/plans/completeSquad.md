# Plan: complete squad and sweeper

Branch: `completeSquad`. Delete this file when the work is done.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| SQD-15 | In | Complete a squad: flag plus zeros for no-shows (D-190). |
| SQD-16 | In | Complete a sweeper: flag only (D-191). |
| SQD-17 | In, for what exists | The complete routes refuse a complete session. The registration routes already refuse (`REG-17`, `REG-33`, `REG-34`). Score save and lane move do not exist yet. |
| SQD-18 | In | No reopen route. A repeat is a `409` (D-192). |
| SQD-19 | Already done | D-84. Completing flips the notice off. |
| TRN-10 | Later | Complete tournament is its own slice (D-196). |
| SCR-14 | Later | The server refusal waits for score entry. |
| REG-20 | Later | Removing a bowler from a squad (Q-37). |

## Decisions used

- D-06: a paid no-show is an entry, so it gets zeros.
- D-10: a complete session is locked on the server.
- D-22, D-60: the header holds the status and the Complete button.
- D-75: a bowler with some games stays as entered and shows as "Did not finish".
- D-84: results say "Unofficial results" until complete.
- D-90: the super sweeper treats a complete sweeper's missed games as zero when it reads, so a sweeper writes no rows.
- D-130, D-196: complete tournament comes later and calls this logic.
- D-155, D-189: one serializable transaction with a retry; checks run inside it.
- D-181, D-186: the `409 { message, errors }` refusal style.
- D-190 to D-195: this feature.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| SQD-15 | One-sentence confirm | Dialog counts the zeros it will save | D-194 |
| SQD-15, SQD-16 | Desk menu item | Header button, `squads.write` only | D-193, D-195 |
| SQD-16 | Item hides for a sweeper only | Button hides for both once complete | D-195 |
| SQD-18 | Nothing stops a repeat | Repeat is a `409` | D-192 |
| SQD-17 | Screens only | The server refuses too | D-10 |

## API

All web only (D-09). The vendor sees no change. Sweepers get their own `/sweepers/{sessionId}/complete`, the same pattern as create, edit, and delete (`/squads/...` and `/sweepers/...` twins).

| Route | Success | Errors |
| --- | --- | --- |
| `POST /v1/tournaments/{id}/squads/{sessionId}/complete` (no body) | `200 { squad, noShowCount }`, `squad` in the list shape with `complete: true` | `400` id not a UUID; `401`; `403`; `404` unknown tournament, or a session of the other kind or tournament; `409 { message, errors }` (`errors.tournament`: "This tournament is complete and cannot be changed"; `errors.session`: "This squad is already complete"); `503` |
| `POST /v1/tournaments/{id}/sweepers/{sessionId}/complete` | `200 { sweeper }` | The same, with "sweeper" |
| `GET /v1/tournaments/{id}/squads/{sessionId}/complete-info` | `200 { completeInfo: { entryCount, noScoreCount, partialCount, games } }` | `400`; `401`; `403`; `404`; `503` |
| `GET /v1/tournaments/{id}/sweepers/{sessionId}/complete-info` | `200 { completeInfo: { entryCount } }` | The same |

Access: `squads.write`, no API key. Each route gets its own `mountRoutes` entry, like delete and delete-info; the info read has its own path so the permission check cannot reach the public `:sessionId/...` reads.

**Rules in one place.** `shared/sessionComplete.ts` holds the pure part, like `sessionDelete.ts`: `planSessionComplete(facts, kind)` returns `refused` with `errors`, or `complete`. `planNoShowZeros(entries, games)` takes each entered bowler's saved game count and returns the bowlers to zero-fill. A bowler with no scores gets zeros; one with some games gets none. A bowler counted once even with two registrations.

**Storage.** `shared/sessionCompleteStore.ts` has `createSessionCompleter(client, logger, kind)`, as `createSessionDeleter` does. One serializable transaction with `withRetry`:
1. Read the tournament (`completed`, `games`); `404` if unknown.
2. Read the row of this kind and tournament (`complete`); `404` if not found.
3. Plan. A refusal returns before any write.
4. Squad only: read entries (`SquadRegistration` joined to `Registration.bowlerId`) and the squad's `SquadScore` rows, build the no-show list, `createMany` zeros for games 1 to `tournament.games`.
5. Set `complete: true`.
6. Return the squad or sweeper in the list shape and the no-show count.

The `SquadWriter` and `SweeperWriter` interfaces extend a `SessionCompleter`. The routes sit in `shared/sessionCompleteRoutes.ts` with a thin `completeRoutes.ts` in each feature, as `deleteRoutes.ts` does. The log line holds the acting user id, tournament id, session id, and (squads) `noShowCount`, never the date (D-193).

**Cache.** The squad and sweeper results and scores routes keep an answer for 5 s per session (`LIVE_CACHE_MS`, no invalidation). The Results tab can show "Unofficial" for up to 5 s after Complete. I accept this: the tab polls every 15 s. I note it in the requirements doc and don't add cache invalidation.

## Web

Mockups (open `docs/plans/completeSquad-mockups/index.html`): [header](completeSquad-mockups/header.html) and [dialogs](completeSquad-mockups/dialogs.html).

Shared in `src/shared/`, because squads and sweepers read alike (as the delete files do):
- `sessionCompleteApi.ts`: `completeSession(kind, tournamentId, sessionId)` returning `{ noShowCount }`, a `SessionCompleteRefusedError` for `409` with its reasons, plain errors for `401`, `403`, and `404`; `fetchSessionCompleteInfo`.
- `useCompleteSession.ts`: a mutation that invalidates `tournamentKeys.detail(id)` on settle. The lanes, scores, results, and list keys all sit under that key, so one call refreshes them. A refusal or `404` refreshes too: it means the page was stale.
- `useSessionCompleteInfo.ts`: a query read only while the dialog is open, `retry: false`, `gcTime: 0`.
- `CompleteSessionDialog.tsx`: the dialog in the mockup. Cancel has focus first. Complete waits for the counts; if they fail to load, the generic sentence shows and Complete still works. A failed save shows `role="alert"` in the dialog. Zero counts drop their lines.
- `CompleteSessionButton.tsx`: the button and the dialog state, in the pattern of `DeleteSessionButton`. It does not show the toast itself, because the button unmounts when the status flips; it calls `onCompleted(result)` and the portal shows the toast.

`SessionPortal.tsx`: beside the title and status, a `<Can permission="squads.write">` holding the button, hidden when `session.complete` or `tournament.completed` (the outlet's tournament has `completed`). A success toast "Squad completed. 3 bowlers got zeros." ("…1 bowler got zeros." for one; "Squad completed." for none; "Sweeper completed."), `autoDismissMs`. A refusal shows an error toast that stays until dismissed.

States: counts loading, counts failed, saving ("Completing…", both buttons disabled), failed (error in the dialog), refused (error toast). Layout works at 320px: the header wraps (the mockup does it with `flex-wrap`).

MSW (`src/mocks/handlers.ts`): `complete` and `complete-info` for both kinds. Complete sets the demo session's `complete` and returns the squad; a repeat returns `409`. `complete-info` returns plausible counts.

## Data

No schema change. Zeros are `SquadScores` rows `(bowlerId, squadId, game, 0)`, the same as legacy writes. Types: `CompleteSquadResult` and `CompleteInfo` in the web `shared/` and the API `shared/`, with the same shape (the API's `types.ts` and the web's must match).

## Tests

| Rule | Test (file and case) |
| --- | --- |
| SQD-15 (zeros) | `sessionComplete.test.ts`: a bowler with no scores is zeroed for every game; one with some games is not; two registrations of one bowler count once; no entries gives none. `sessionCompleteStore.db.test.ts`: a squad of three bowlers (none, partial, full) saves 3 zero rows for the first only, and no row changes for the others; `games` follows the tournament. |
| SQD-15 (flag) | `sessionCompleteStore.db.test.ts`: the flag is true and the zeros are in the same transaction (a failure after the flag rolls both back). |
| SQD-16 | `sessionCompleteStore.db.test.ts`: a sweeper completes and saves no rows. |
| SQD-17 | `sessionComplete.test.ts` and `db.test.ts`: a complete session and a complete tournament are refused, nothing written. Registration refusals stay covered by their tests. |
| SQD-18 | Routes test: a second call is `409`; no route or body field reopens (`PATCH` with `complete` is still `400`, covered in `updateRequest.test.ts`). |
| D-192 | `completeRoutes.test.ts` (squad and sweeper): `400`, `404` (unknown tournament, other kind, other tournament), `409` bodies, `200` bodies. A race: a score saved between read and write is counted (db test with the retry). |
| D-193 | `mountRoutes.test.ts` or the route access test: signed out `401`, API key `403`, score keeper `403`, director `200`. The log line has the actor and no date. |
| D-194 | `completeRoutes.test.ts` for `complete-info`: counts, partials, the sweeper's shape; `403`, `404`. Web: `CompleteSessionDialog.test.tsx` (every wording, loading, failed read, saving, failed save, Cancel first), `sessionCompleteApi.test.ts`, `useSessionCompleteInfo.test.tsx`, `useCompleteSession.test.tsx`. |
| D-195 | `SessionPortal.test.tsx`: the button shows to `squads.write` only, hides when the session or tournament is complete, and after a save the status reads Complete and the toast says how many got zeros. Playwright: complete a squad in the mock app, and the axe scan with the dialog open. |
| SQD-19 | Existing `results` tests; one added check that a complete squad drops "Unofficial results" on refetch. |

Mutation: `npm run test:mutation:fast` for the new API and web files; fix survivors.

## Steps

1. API rules: `sessionComplete.ts` with tests.
2. API storage: `sessionCompleteStore.ts` and the db test; wire into both prisma writers and writer interfaces (and the test fakes).
3. API routes: `sessionCompleteRoutes.ts`, the two `completeRoutes.ts`, `mountRoutes` entries, route tests, access tests.
4. Web: `sessionCompleteApi.ts`, the two hooks, MSW handlers and their tests.
5. Web: the dialog and the button with tests.
6. Web: the portal header, toast, tests; e2e and the axe scan.
7. Run lint, typecheck, test, and `format:check` in `api/` and `web/`, then e2e and mutation.

Each step ends with those checks green for the files it touches.

## Not doing

- Complete tournament (D-196): its own slice.
- Score save and lane move refusals on a complete session: the routes do not exist yet (`SCR-14`, `LAN-` move).
- Removing a bowler from a squad, so a director can refund before completing (Q-37).
- A Complete button on the cards (D-195).
- A typed confirmation (D-194).
- Undo or reopen (`SQD-18`).
- Clearing the 5 s results cache on complete; the lag is short and the tab polls.
- A new permission for the score keeper; `squads.write` for now (D-193).
- A metric for completions; the log line is enough for a rare, director-only action.
