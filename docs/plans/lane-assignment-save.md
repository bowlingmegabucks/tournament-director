# Plan: lane assignment save and live updates

Branch: `migrate-lane-assignment-save`. Delete this file when the work is done.

Slice two of lane assignments (D-55). The move saves, and every open lane page for a session updates over SSE. The channel is built to be reused by Scores and Results later (D-222).

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| LAN-05 | In | Registration not on this session: `404` |
| LAN-06 | In | Same pair: `200`, no write, no event |
| LAN-07, LAN-08 | Dropped | D-57: the server picks the seat |
| LAN-09 | In | `lane: null` unassigns |
| LAN-13 | In (server half) | Complete session or tournament: `409` (D-10, SQD-17) |
| LAN-16 | In (changes) | Save replaces the on-screen move; optimistic with undo (D-220) |
| LAN-14 | In (changes) | Adds the write route and the events route |
| LAN-18 (new) | In | The `PUT` move command (D-216) |
| LAN-19 (new) | In | The events stream and its page status line (D-217, D-218) |
| LAN-20 (new) | In | Registration writes and session changes publish (D-219) |
| LAN-12 | Already done | Add, new registration, remove: edit registration run |
| SCR-17, D-79 polling | Later | Scores and Results move to the stream in their own slice (D-222) |

New rule IDs continue the requirements file (`LAN-14` to `LAN-17` exist; the recap work took `LAN-18` and `LAN-19` in `recap-sheets.md`). Check for the next free ID before writing the requirements file and renumber here if needed.

## Decisions used

- D-10, SQD-17: complete session locks lane moves on the server.
- D-56: seat order `A C B D E`; first free seat; nobody is renumbered.
- D-57, D-216: server picks the seat; body is the odd lane of the pair or `null`.
- D-61: a legacy letter in the pair counts as a taken seat.
- D-96: routes ask for a permission, never a role. `lanes.assign` already exists; director and admin hold it.
- D-217, D-218: SSE per session; message is a change signal; refetch.
- D-219: registration writes publish to every session they touch.
- D-220: drop moves at once; undo on refusal.
- D-221, Q-39: one instance.
- D-222: Scores and Results keep polling for now.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| LAN-07, LAN-08 | The client sends the original and the target position; the server compares | Client sends only the target pair; the server picks the seat | D-57, D-216 |
| LAN-13 | Only the screen locks a complete squad | The server refuses too | D-10 |
| (new) | Other desks see a change only after a manual refresh | Open lane pages update over SSE | D-217 |

## API

All web-only (D-09). The registration site never calls them.

| Route | Access | Answer |
| --- | --- | --- |
| `PUT /v1/tournaments/{id}/squads/{sessionId}/lanes/{registrationId}` and `/sweepers/` twin | `lanes.assign`, no API key | Body `{ lane: number \| null }`. `200 { position }` (`''` when unassigned). `400` body not valid, `lane` not the first lane of a pair of this session, or an id not a UUID. `404` unknown tournament, session, or registration not on it (`LAN-05`). `409 { message }` pair full (names the pair, "Lanes 1-2 are full (4 of 4). Pick another pair."), or session or tournament complete. `422` bowlers per pair not 2 to 5 (as the lane page). `503` database down. |
| `GET /v1/tournaments/{id}/squads/{sessionId}/events` and `/sweepers/` twin | `lanes.read`, no API key | `text/event-stream`. `event: changed`, `data: {"kind":"lanes"\|"entries","version":n}`. `retry: 5000` first. A `: heartbeat` comment every 25 s. `404` as the lane route. `503 { message }` past the connection cap (500). |

Rules for the move (`planLaneMove`, a pure function over facts read in the transaction):

1. Read in one `Serializable` transaction with `withRetry`: the tournament's `Completed`, the session (dates, lanes, `maxPerPair`, `complete`), and every `SquadRegistration` row of the session (a squad and a sweeper share the table).
2. Tournament or session complete: refuse.
3. The registration has no row in this session: not on session.
4. `null`: write `''`. If the stored value is already `''` or NULL, change nothing.
5. `lane` must be the first lane of a pair (`buildPairs`); else `400`.
6. The bowler is already in that pair: change nothing, return the stored position (`LAN-06`).
7. Count the others in the pair (stored positions that parse to a lane of the pair; D-61). At or over `maxPerPair`: full.
8. Seat: first letter in `SEAT_ORDER` not used by the others; letters `A` and `B` sit on the first lane, `C` to `E` on the second. Write `<lane><letter>`.

Publish: after the commit the route publishes `lanes` for the session, unless nothing changed. A failed publish is logged and never fails the save.

`api/src/shared/events/` (new, reusable):

- `sessionEvents.ts`: `createSessionEvents(logger, meter)` returns `{ subscribe(sessionId, send), publish(sessionId, kind), closeAll(), count() }`. In memory. `version` is a counter per process.
- `sseRoute.ts`: `createSseRouter(hub, findSession, label)` sets `content-type: text/event-stream`, `cache-control: no-cache, no-transform`, `x-accel-buffering: no`, flushes headers, writes `retry`, starts the heartbeat, and unsubscribes on `close`. It runs after the session lookup so an unknown id is a plain `404`.
- Mounted outside the rate limit's cost and ahead of any body parser; `telemetry.ts` ignores `/events` request spans (a stream lasts hours) as it does `/health`.
- **Shutdown.** `handleProcessEvents` waits for open requests to finish, and a stream never does. `server.ts` calls `hub.closeAll()` first on SIGTERM, ending every response, so a deploy does not hit the 10 s timeout and exit 1.
- Metric `tournament_director.events.connections` (gauge) and `tournament_director.events.published` (counter, label `kind`); logs at `debug`: connect, disconnect, publish with session id and subscriber count. Never a name.

Registration publishing: `publishingRegistrationWriter(inner, hub)` in `features/registrations/` wraps `save`, `deleteRegistration`, and `removeForDesk`. Before the call it reads the registration's current session ids (`getDetail`); after a success it publishes `entries` to the union of those and `addSessionIds` and `removeSessionIds`. `server.ts` builds the wrapped writer, so the vendor and desk routes do not change.

Session changes: the squad and sweeper `complete` and `PATCH` routes publish `lanes` after success, so an open page drops to read only or redraws its pairs. (Review point 2.)

## Web

Mockups: [index](lane-assignment-save-mockups/index.html), [lane-states](lane-assignment-save-mockups/lane-states.html).

- `useSessionEvents(kind, tournamentId, sessionId, enabled)` (new, `features/lanes/`). Opens `new EventSource(apiUrl(path), { withCredentials: true })`; on `changed` it invalidates the lane query; on `open` after an error it invalidates once (the reconnect refetch); returns `'live' | 'reconnecting' | 'off'`. `readyState === CLOSED` (the browser gives up on a 401 or 403) is `off`. A tab in the background keeps its stream; a wake refetches through the query's `refetchOnWindowFocus`. It opens only when the session is open and the user holds `lanes.read`. This is a `useEffect` for an outside subscription, the case the React skill allows.
- `LiveStatus` (new): the status line. Polite live region, so it announces on change only. "Updated: lanes 5-6" after a pushed change that touched those pairs, then back to "Live". A pair that changed gets an accent edge for 3 s (a style, with the text line as the non-colour signal).
- `useMoveBowler(kind, tournamentId, sessionId)` (new, `useMutation`). `onMutate`: cancel the lane query, snapshot it, patch the cache with the guessed seat. `onSuccess`: put the API's position into the cache. `onError`: restore the snapshot and show the error toast with the message. `onSettled`: invalidate. A row being saved is dimmed and `aria-busy`.
- `tempMoves.ts` becomes `optimisticMove.ts`: `planMove` and `applyMoves` stay as the guess; the doc comment now says the API's answer wins. `LanesPage` loses its `moved` state and the `NOT_SAVED` toast.
- `api.ts` gains `moveBowler(kind, tournamentId, sessionId, registrationId, lane)` with a typed `MoveRefusedError` for `409`.
- Users without `lanes.assign` (the score keeper) see no handle and no Assign or Move button; the stream still runs (`<Can>` and `useCan('lanes.assign')`).
- Mocks: MSW `sse()` handler for the events route in `src/mocks/` and a `PUT` handler that applies the move to the mock data; check the MSW 3 `sse` API in Context7 before writing it.
- States: loading, error, empty and read only are as built. New: saving (row), refused (toast), status line (live, reconnecting, off).

## Data

No schema change. `SquadRegistration.LaneAssignment` is the one column written. `lanes.assign` is already in `permissions.ts`, the web `auth/types.ts`, and the mocks.

Docs to update: `api-access.md` route table, `api-standards.md` (new "Live updates" section next to Caching, including the 4-minute idle rule), `deployment.md` (B1, not free; HTTP/2 on; WebSockets not needed; single instance, Q-39), `v1-requirements.md` (check the desk concurrency item), `CLAUDE.md` status entry.

Azure, owner action (outward-facing, so I do not run it): HTTP/2 is off on `app-tournamentdirector-prod`. Turn it on (`az webapp update -g rg-tournamentdirector-prod -n app-tournamentdirector-prod --http20-enabled true`), or each browser holds at most 6 streams per origin across all tabs. Streams work without it.

## Tests

| Rule | Test |
| --- | --- |
| LAN-05 | `movePlan.test.ts`: "refuses a registration not on the session (LAN-05)"; `moveRoutes.test.ts`: 404 |
| LAN-06 | `movePlan.test.ts`: "changes nothing when the bowler is already in the pair (LAN-06)"; routes test: no publish |
| LAN-09 | `movePlan.test.ts`: "unassigns on a null lane (LAN-09)"; `prismaMove.db.test.ts`: column holds `''` |
| LAN-13 | `movePlan.test.ts` and routes: complete session and complete tournament give 409 (D-10) |
| D-56, D-61 | `movePlan.test.ts`: first free seat; a legacy `B` in the pair counts taken; C on the second lane; a one-lane pair |
| Q-28 | `prismaMove.db.test.ts`: two concurrent moves into a pair with one seat give one `200` and one full; retry on `P2034` |
| LAN-18 | `moveRoutes.test.ts`: validation, permissions (401, API key 403, score keeper 403), 400 lane not a pair start, 422, 503; `app.test.ts` mount access; `mountRoutes.test.ts` |
| LAN-19 | `sessionEvents.test.ts` (subscribe, publish, close, count, isolation between sessions); `sseRoute.test.ts` (headers, retry, heartbeat on a fake timer, unsubscribe on close, 404, 503 cap, `closeAll` ends the response); `processEvents` test that shutdown ends streams |
| LAN-20 | `publishingWriter.test.ts`: save publishes to added, removed, and existing sessions; a move between sessions publishes to both; delete publishes; a failing publish does not fail the write; vendor routes' shapes untouched (existing vendor tests stay green) |
| LAN-16 | `useMoveBowler.test.tsx`: optimistic patch, success replaces the guess, refusal restores and shows the message, a second move of the same bowler; `LanesPage.test.tsx`: drop saves, 409 toast, no `NOT_SAVED`; `AssignDialog` path |
| LAN-19 (web) | `useSessionEvents.test.tsx`: a `changed` message refetches, reconnect refetches once, a closed stream is `off`; `LiveStatus.test.tsx`; `LanesPage.test.tsx`: score keeper has no controls |
| e2e | `web/e2e/lanes.spec.ts`: drop a bowler and see the seat; a second context drops into the same pair and the first sees it; full-pair refusal. Axe on the new status line |
| Mutation | `test:mutation:fast` in `api/` for `movePlan.ts`, `sessionEvents.ts`, `sseRoute.ts`, `publishingWriter.ts` |

## Steps

1. Docs only: `lanes.assign` wording, plan, mockups (this commit).
2. API: `movePlan.ts` (pure) with tests.
3. API: `LaneWriter` (in-memory and Prisma, serializable with retry) with the db tests.
4. API: `sessionEvents.ts`, `sseRoute.ts`, shutdown hook, telemetry skip, metrics, tests.
5. API: move router and events router; mount in `app.ts` with access; `server.ts` wiring; route tests.
6. API: `publishingRegistrationWriter`; session `complete` and `PATCH` publish; tests.
7. Web: `api.ts` `moveBowler`, `useMoveBowler`, `optimisticMove.ts`, `LanesPage` change, tests.
8. Web: `useSessionEvents`, `LiveStatus`, `<Can>` gating, mocks (`sse`, `PUT`), tests.
9. e2e and axe; full `npm run check`; mutation fast.
10. Docs: `api-standards.md`, `api-access.md`, `deployment.md`.

Each step ends green (lint, typecheck, test, format check) in the folders it touches.

## Not doing

- Scores and Results on the stream: next slice (D-222). Their 15 s poll stays.
- A pushed delta, replay (`Last-Event-ID`), or a shared bus for more than one instance (D-218, D-221, Q-39).
- WebSockets, typing presence, or a lock on a pair.
- A push to the Registrations list page. It lists a tournament, and the stream is per session.
- Copy assignments (D-67) and any change to the cross or the recap sheets.
- Turning on HTTP/2 in Azure: your call, command above.
