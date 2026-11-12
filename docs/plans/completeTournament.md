# Plan: complete tournament

Branch: `completeTournament`. Delete this file when the work is done.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| TRN-10 (complete) | In | Web-only `POST …/complete`, `GET …/complete-info`, overview button and dialog (D-256 to D-260). |
| SQD-15, SQD-16 | In, reused | The zero-fill and flag run once per open session from the tournament transaction. No new zero-fill code. |
| SQD-17, SQD-18 | Already done | A complete tournament already refuses everything under it; no reopen. |
| TRN-31 | Already done | Badge and hidden Edit read `completed`. The hidden Danger zone is extended (see Web). |
| TRN-08, SQD-19, REG-33 | Already done | |
| Score-keeper complete | Later | Own permission later (D-193). |

New requirement IDs (next free after `TRN-37`): `TRN-38` to `TRN-43`, listed under Tests.

## Decisions used

- D-130: final, no undo, freezes the tournament; typed name; `tournaments.write`.
- D-196: its own slice, after Complete squad and sweeper.
- D-190, D-191: squad zeros and sweeper flag, reused.
- D-192: refusal style, one serializable transaction with retry, checks inside it.
- D-256: route, response, log line. D-257: two refusals. D-258: all or nothing. D-259: complete-info and dialog. D-260: button, toast, refetch.
- D-136: typed-name dialog. D-215: red outline trigger, Danger zone. D-84, D-88: "Unofficial results" clears with the sessions.
- D-96, D-09: permission not role; web-only.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| TRN-10 | No action; `Completed` never set | Complete action, final, typed name | D-130, D-256 to D-260 |
| SQD-15 | One sentence confirm, per squad | Same zero-fill, now also driven from the tournament action | D-190, D-256 |

## API

All web-only (D-09); `tournaments.write`; the API key gets `403`, signed out `401`.

| Route | Success | Errors |
| --- | --- | --- |
| `POST /v1/tournaments/{id}/complete` | `200 { completed: true, squadsCompleted, sweepersCompleted, noShowCount }` (only sessions this call closed) | `400` id not a UUID; `404 { message: "Tournament not found" }`; `409 { message, errors: { tournament } }` for already complete ("This tournament is already complete") or no squad ("Add a squad before you complete this tournament"); `409 errors.session` when a stored session cannot be read |
| `GET /v1/tournaments/{id}/complete-info` | `200 { completeInfo: { squadCount, openSquadCount, openSweeperCount, noScoreCount, partialCount } }` | `400`, `404` |

Save order in one serializable transaction with `withRetry`: read the tournament and all sessions, apply D-257, for each open session run the existing complete step (zeros for squads, flag for both), set `Completed`. After commit, publish a `changed` event to each closed session (as `complete` does) and drop the live caches the squad complete drops. Log "Tournament completed" with `actorId`, tournament id, three counts; no name.

Refactor: `shared/sessionCompleteStore.ts` keeps `createSessionCompleter`, but its transaction body moves to an exported `completeSessionIn(tx, …)` that both the session completer and the tournament writer call. The tournament writer reads each session through the same `readCompleted` the squad and sweeper writers use, so the unreadable-row refusal matches.

## Web

Mockups: [docs/plans/completeTournament-mockups/index.html](completeTournament-mockups/index.html) (`overview.html`, `dialog.html`).

- **Overview.** `DangerZone` takes an array of items (description plus trigger) so the director sees one zone with "Complete tournament" and the admin sees it with "Delete tournament" below, divided. `<Can permission="tournaments.write">` wraps the complete item; `tournaments.delete` the delete item. The zone renders only when at least one item shows, and only while the tournament is open.
- **`CompleteTournamentButton`** (beside `DeleteTournamentButton`): trigger, dialog, toast. Mirrors the delete flow: `closes` ref, a failure line, a refusal toast.
- **`CompleteTournamentDialog`**: titled "Complete this tournament?". Reads `useCompleteInfo` on open. States: loading (`Loading`), load error with "Try again" and no Complete button, counts (zero-count lines drop; none open says "Every squad and sweeper is already complete, so no scores will be saved."), saving, save failure line. Typed name (`nameMatches`) turns on the red button. Cancel has focus first.
- **After save.** Success toast ("Tournament completed. 3 squads and 1 sweeper closed, 7 bowlers got zeros."), then invalidate tournament, settings, squads, sweepers, lanes, scores, results, finals and live-results queries. Refusals show an error toast that stays until dismissed; `already complete` also refetches settings.
- **Hooks and API calls.** `useCompleteInfo`, `useCompleteTournament`, `completeTournament` and `getCompleteInfo` in `api.ts`, `TournamentCompleteRefusedError`. MSW handlers and factory in `src/mocks/`.

## Data

No schema change. Writes `Tournaments.Completed`, `Squads.Complete`, `SquadScores`.

## Tests

| Rule | Test |
| --- | --- |
| TRN-38 route, permission, response counts (D-256) | `completeRoutes.test.ts`: 200 body; 401, 403 key, 403 keeper; 400; 404 |
| TRN-39 refusals (D-257) | `completePlan.test.ts` and routes: already complete, no squad, sweepers alone, all closed allowed, part scores allowed |
| TRN-40 all or nothing, serializable, retry, zeros once (D-258, D-190) | `prismaWriterComplete.db.test.ts`: zeros for no-shows only, sweeper flag, skipped complete session, unreadable row leaves nothing, a failed write rolls back |
| TRN-41 complete-info (D-259) | `completeInfoRoutes.test.ts` and `.db.test.ts` counts |
| TRN-42 button, Danger zone, permissions, hides when complete (D-260, TRN-31) | `TournamentOverview.test.tsx`, `CompleteTournament.test.tsx` |
| TRN-43 dialog states, typed name, toast, refetch, refusal toast | `CompleteTournament.test.tsx` |
| Events and cache | `completeRoutes.test.ts`: each closed session gets a `changed` event; live cache dropped |
| Mutation | `npm run test:mutation:fast` in `api/` and `web/` on the new files |
| Journey | `web/e2e/completeTournament.spec.ts` (mocks): open dialog, wrong name keeps button off, complete, badge shows, links hide. axe scan of the dialog added to `accessibility.spec.ts` |
| Lifecycle stage 8 | Update [lifecycle-e2e.md](lifecycle-e2e.md): stage 8 no longer waits; add scripted failures (complete twice, complete with no squad) |

## Steps

1. API: `completePlan.ts` (pure rules) with tests; export `completeSessionIn` from the shared store and keep the session tests green.
2. API: writer interface, fake writer, Prisma writer, `*.db.test.ts`.
3. API: routes, mount under `tournaments.write`, events, cache, logging, route tests.
4. Web: `api.ts`, hooks, mocks, tests.
5. Web: `DangerZone` items, button, dialog, overview wiring, tests.
6. e2e and axe; lifecycle plan edit.
7. `npm run check`; mutation on new files; fix survivors.

Each step ends green and is committed with the rule IDs.

## Not doing

- Reopen or undo (D-130).
- A score-keeper permission (D-193).
- Repeating the dialog's counts in the save (D-258).
- Completing from the edit page (D-260).
- A tournament-level print or report; none exists in legacy.
