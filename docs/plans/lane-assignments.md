# Plan: lane assignments

Branch: `laneAssignment-view` (already checked out; not `migrate-lane-assignments`). Delete this file when the work is done.

Mockups: [lane-assignments-mockups/index.html](lane-assignments-mockups/index.html).

This is slice one of two (D-55): the page, the squad portal, and a drop that moves the bowler on screen only, with an info toast that nothing is saved (changed after approval: it first showed an error and moved no one). The move command is slice two, after the lock-down release (D-52). D-57 records how it will work, so this page is built to fit it.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| LAN-01 | In | Read the stored position; NULL and `''` are unassigned (D-58) |
| LAN-02 | In, differs | Capacity and "n of max" shown; seat order, 5 limit (D-56); the read draws no empty seats |
| LAN-03 | In | Pairs from `startingLane` and `numberOfLanes` become the drop zones |
| LAN-04 | In | Pairs and bowlers sorted by lane, then letter |
| LAN-10 | In | Unassigned area, pair drop zones, counts per division |
| LAN-11 | In | Name, division, average, handicap (squad) or bonus pins and Y/N super sweeper (sweeper) |
| LAN-13 | In | A complete session is read only: no handles, no buttons |
| LAN-05, LAN-06, LAN-09 | Later | The move command (slice two, D-57) |
| LAN-07, LAN-08 | Dropped for the new design | The server picks the seat (D-57); no new rule needed |
| LAN-12 | Later | Add to squad (REG-21), new registration (REG-22), remove (REG-20), copy (RPT-06), recap sheets |
| The cross | Later | Recap sheet feature (RPT-05) |
| SCR-07, SCR-09 (read part) | In | Needed for LAN-11. Built as a pure function here; the Scores feature reuses it |

## Decisions used

- D-55: two slices; page and stub first.
- D-56: seat order A, C, B, D, E; first free seat; no renumbering; limit 5; legacy letters stay valid.
- D-57: the move design (odd lane of the pair in, position out; 409 when full; locked when complete). Documented only.
- D-58: layout, drop cues, "Assign to lanes" button, stub toast, unassigned = NULL or empty, dnd-kit.
- D-59: public for 0.2.0, signed-in only after lock-down.
- D-60: squad portal, one "Lane assignments" tab, squads and sweepers share the page.
- D-61: stored positions show as stored; "Other positions" for those that fit no pair.
- D-10: a complete session is locked. D-22, D-23, D-44: header, tabs, cards. D-27: every route declares access. D-40, D-53: error and loading states. D-51: bad registration rows skipped and logged. D-09: nothing here is vendor-visible.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| LAN-02 | Letter set per `maxPerPair` (2: A B; 3: A B C; 4 and 5 add D, E) | Fill order A, C, B, D, E; first free seat; capacity 5 | D-56 |
| LAN-03, LAN-10 | A grid of single lane positions | One drop zone per pair; the API picks the seat | D-55, D-57, D-58 |
| LAN-05 to LAN-09 | Drop on a position; stale and "target empty" checks | Drop on a pair; server decides. This slice: stub error only | D-55, D-57 |
| LAN-10 | Drag only | Drag and an "Assign to lanes" button that opens a modal (WCAG 2.5.7) | D-58 |
| LAN-13 | Screens lock | The API also marks the session complete so the page hides handles; the move command refuses later | D-10 |
| Access | No users | Public now, signed-in after lock-down | D-59 |

## API

Two routes, one handler each, web only (D-09 does not apply). Both are `public` today (D-27, D-59) and get a signed-in label in the lock-down release.

| Route | Notes |
| --- | --- |
| `GET /v1/tournaments/{id}/squads/{sessionId}/lanes` | `sessionId` must be a squad of the tournament |
| `GET /v1/tournaments/{id}/sweepers/{sessionId}/lanes` | `sessionId` must be a sweeper of the tournament |

Response `200`:

```
{
  session:    { id, kind: 'squad' | 'sweeper', date, complete, startingLane, numberOfLanes, maxPerPair },
  pairs:      [{ firstLane, lanes: [1, 2], capacity, bowlers: [Bowler] }],
  unassigned: [Bowler],
  other:      [Bowler],
  divisions:  [{ id, number, name, entries }]
}
Bowler: { registrationId, name, divisionId, divisionName, average: number | null,
          position: string, pins: number, superSweeper: boolean }
```

- `pins` is the handicap on a squad (SCR-07) and the bonus pins on a sweeper (SCR-09). `superSweeper` is always sent; the page shows Y or N only for a sweeper.
- `position` is `''` for unassigned bowlers, else the stored text (`1A`).
- The API builds `pairs` so the page does no grouping. A pair holds a bowler whose parsed lane is one of its two lanes; its bowlers sort by lane, then letter (LAN-04). `unassigned` sorts by last name, first name, registration id. `other` holds positions that parse badly or name a lane outside the session (D-61), sorted by position text.
- `capacity` is `maxPerPair`, capped at 5 (D-56). A `maxPerPair` below 2 or above 5 gives 422 `{ message: "Bowlers per pair must be 2 to 5 to assign lanes" }` (LAN-02); the page shows it and disables itself, as legacy does.
- `numberOfLanes` of 0 gives `pairs: []`.
- `divisions` counts bowlers on this session per division (entries, assigned or not), in division number order; a division nobody entered lists 0.
- Errors: `400` an id is not a UUID; `404 { message: "Tournament not found" }`; `404 { message: "Squad not found" }` or `"Sweeper not found"` for an id that is not that kind in that tournament; `422` as above; `500` a stored tournament breaks its read shape (a session that breaks its shape is skipped, D-42, so it reads as `404`); `503` database down (D-32).
- A `SquadRegistration` whose registration breaks the read shape (UUID id, bowler with a first and last name) is skipped and logged once per process, with its id (D-51). A position outside the lanes logs a warning once per process (D-61).
- Never sent: SSN, gender, date of birth, address, email, phone, payments (BWL-17). The query names columns.
- Logging: `requestLogger(res, logger)`; fields first, then a constant message. No bowler names in logs.

Pure helpers, in `api/src/features/lanes/`:

- `positions.ts`: `SEAT_ORDER`, `parsePosition(text)` (`^[1-9]\d?[A-E]$`, else `undefined`), `buildPairs(startingLane, numberOfLanes)` (first lane `startingLane + 2k`; with an odd count the last pair has one lane), and `pairOf(lane, pairs)`.
- `handicap.ts`: `handicap(average, division)` per SCR-07, with the cap and the "missing input gives 0" rule.
- `lanePage.ts`: `buildLanePage(session, entries, divisions)` composes the response. No Express, no Prisma.

## Web

Routes added in `App.tsx`:

```
tournaments/:id/squads/:sessionId           → SessionPortal (squad)   index → redirect to lanes
tournaments/:id/squads/:sessionId/lanes     → LanesPage
tournaments/:id/sweepers/:sessionId         → SessionPortal (sweeper) index → redirect to lanes
tournaments/:id/sweepers/:sessionId/lanes   → LanesPage
```

Components in `web/src/features/lanes/`:

- `SessionPortal.tsx`: the page header (D-22): breadcrumb, date and time, Open or Complete, tabs (one: "Lane assignments"), then an `<Outlet>`. Finds the session in the cached squad or sweeper list; "Squad not found" or "Sweeper not found" when absent. The tournament sidebar does not change.
- `LanesPage.tsx`: reads the lanes query; renders the states below; owns the toast.
- `UnassignedList.tsx`, `PairZone.tsx`, `BowlerCard.tsx`, `AssignDialog.tsx`, `OtherPositions.tsx`.
- `dropRules.ts`: pure `dropOutcome(pair, bowler)` giving `'room'`, `'full'`. The drop, the dialog pick, and the cue colors all call it.
- `useLanes.ts`, `api.ts`, `types.ts` as the other features. `api.ts` checks the shape by hand, as `squads/api.ts` does.
- `SessionCard` gains an optional link: its date becomes a router link to the portal (D-44's "each adds its link").

Layout: **A** (chosen at review): the unassigned list beside the pairs, one column on a phone. Layout B stays in the mockups only as the comparison.

Scrolling: the unassigned list and the lane pairs each sit in their own scrolling `div`, with a capped height, so a long list in one never moves the other. The page header, the division strip, and each area's title stay in place. Each scrolling `div` is a labeled region with `tabindex="0"` so keyboard users can scroll it (axe checks this).

Drag: `dnd-kit` (`@dnd-kit/core`). Each bowler has a drag handle button; each pair is a drop zone. While dragging, a pair with room shows a green border and "Drop here: n seats left"; a full pair shows a red dashed border and "Full: cannot drop here". Words and border style carry the meaning, not color alone. Keyboard dragging comes from dnd-kit's keyboard sensor, with its screen reader announcements.

The **Assign to lanes** button opens a modal: a native `<dialog>` (like the Registrations popup, D-54) titled "Assign {name} to lanes", with the bowler's division, average, and handicap, then one button per pair showing "n seats left (x of 5)". A full pair stays in the list, disabled, marked "Full". Esc, Cancel, or a click outside closes it, and focus returns to the button. See state 3 in [lanes.html](lane-assignments-mockups/lanes.html).

On a drop or a dialog pick:

- Full pair: error toast "Lanes 1-2 are full (5 of 5). Pick another pair." (D-58). Real behavior, not a stub.
- Pair with room: the bowler moves on this screen. A temporary function (`tempMoves.ts`) picks the first free seat in fill order (D-56) and the page applies the moves during render over the API's page, so nothing is copied into state. An info toast says: "No save is configured yet. This move shows on this screen only and is lost on refresh." Refreshing, or opening another session, drops the moves. Slice two replaces this with the call and uses the position in the response; delete `tempMoves.ts` then.
- Bowlers already in a pair can be dragged too: a move to another pair frees the old seat and renumbers no one. Dropping a placed bowler on the unassigned list clears the position on screen, with the same toast. The unassigned list stays sorted by last name, then first name, so a returning bowler takes their place in it (the API sends `firstName` and `lastName` for this).

States (all in [lanes-states.html](lane-assignments-mockups/lanes-states.html)): loading (`Loading` with rows), error with Try again (`QueryError`), squad or sweeper not found, nobody entered ("No bowlers have entered this squad yet." / "...sweeper..."), everyone assigned ("Everyone has a lane."), lanes not set ("This squad has no lanes set..."), complete (read only), bowlers-per-pair out of range (422 message, page disabled), other positions.

Copy: a squad says "squad" and a sweeper says "sweeper" everywhere.

Page `<title>`: `Lane assignments · {date} · {tournament} · Tournament Director`. One `<h1>` (the date and status), `<h2>` for each area, `<h3>` per pair.

Mock data for `npm run dev:mocks` and e2e: demo lane pages in `web/src/mocks/data.ts` with one open squad (assigned, unassigned, one full pair), one complete squad, and one sweeper; handlers for both routes.

## Data

- `api/prisma/schema.prisma`: add `average Int? @map("Average")` to `Registration` and `laneAssignment String? @map("LaneAssignment") @db.VarChar(3)` to `SquadRegistration`. The column is NOT NULL in the legacy table, but the model reads NULL as well (the owner expects both). No `prisma migrate` (D-30); run `npm run db:generate`.
- Test tables (Testcontainers helper) get the same two columns.
- `db:seed`: give the sample squads positions: an open squad with some assigned (including one full pair) and some unassigned, a complete squad with a legacy `2B`, and a sweeper with a few. The seed stays idempotent.
- No new tables, no schema change in the real database.
- Dependency: `@dnd-kit/core` in `web/`. Why: pointer, touch, and keyboard dragging with screen reader announcements; native HTML5 drag has no touch or keyboard support. Alternative: native drag plus our own touch and keyboard code (more code, less accessible). The owner agreed. Check its current docs with Context7 before use.

## Tests

| Rule | Test |
| --- | --- |
| LAN-01 | `api/src/features/lanes/positions.test.ts` "parses a position (LAN-01)": `15A`, `1A`, rejects `''`, `1F`, `0A`, `a1`; `prismaRepository.db.test.ts` "reads NULL and empty as unassigned (LAN-01, D-58)" |
| LAN-02, D-56 | `positions.test.ts` "seat order is A C B D E (LAN-02, D-56)"; `lanePage.test.ts` "capacity is maxPerPair"; `routes.test.ts` "422 when bowlers per pair is not 2 to 5 (LAN-02)"; `LanesPage.test.tsx` "shows 3 of 5 on a pair" |
| LAN-03 | `positions.test.ts` "pairs run from the starting lane (LAN-03)": 11 with 10 gives 5 pairs; 1 with 0 gives none; odd count ends with a one-lane pair; even starting lane; `lanePage.test.ts` "a bowler lands in the pair that holds their lane" |
| LAN-04 | `lanePage.test.ts` "sorts a pair by lane then letter (LAN-04)": `2C 1A 1B` reads `1A 1B 2C`; `LanesPage.test.tsx` renders in API order |
| LAN-10 | `routes.test.ts` "returns pairs, unassigned, other, divisions"; "counts entries per division, listing 0"; "404 for an unknown tournament, a squad id under /sweepers, an unknown id"; "400 for a non-UUID id"; `LanesPage.test.tsx` "shows unassigned bowlers and pairs", empty, everyone assigned, lanes not set, loading, error with Try again; `prismaRepository.db.test.ts` "reads the entries of one session"; `web/e2e/tournaments.spec.ts` "open a squad from its card and see the lanes" |
| LAN-11 | `handicap.test.ts` "handicap per SCR-07": the 230/200/150/none examples, no base gives 0; `lanePage.test.ts` "pins is handicap on a squad and bonus pins on a sweeper (LAN-11, SCR-09)"; `LanesPage.test.tsx` "a sweeper shows pins and Y or N" |
| LAN-13 | `LanesPage.test.tsx` "a complete session has no drag handles or assign buttons (LAN-13, D-10)" |
| D-51 | `prismaRepository.db.test.ts` "skips a registration that breaks the read shape and logs it once" |
| D-55, D-56, D-58 | `dropRules.test.ts` "room or full", "decideDrop"; `tempMoves.test.ts` seat order, freed seats, legacy letters, `applyMoves`; `LanesPage.test.tsx` "moves the bowler to the pair on screen and says nothing is saved", "a pick on a full pair shows the full toast", "the dialog marks full pairs and disables them", "Esc closes the dialog and focus returns to the button"; `web/e2e/tournaments.spec.ts` "a bowler can be dragged with the keyboard", "a drop on a pair with room moves the bowler on screen", "the assign dialog picks a pair" |
| D-60 | `SessionPortal.test.tsx` "shows the header and the tab", "redirects the portal root to the lanes tab", "not found"; `SessionCard` test "links the date to the portal" (squads and sweepers pages tests) |
| D-61 | `lanePage.test.ts` "a legacy 2B shows on its pair", "a position outside the lanes goes to other", "a bad format goes to other"; `prismaRepository.db.test.ts` "logs a warning for a position outside the lanes, once" |
| D-59 | `api/src/app.test.ts` access labels list includes the two new routes as `public` |
| Accessibility | `web/e2e/accessibility.spec.ts` adds the squad lanes page, dark and light, with the `Assign to lanes` dialog open |
| Mutation | `npm run test:mutation` in `api/` for `positions.ts`, `handicap.ts`, `lanePage.ts`; fix survivors |

## Steps

1. **API pure logic.** `positions.ts`, `handicap.ts`, and their tests. Green.
2. **API read.** Schema fields, `types.ts`, `entryRow.ts`, `lanePage.ts`, repository interface and in-memory fake, Prisma repository. The route finds the session in the squad or sweeper list (no new `get`). Tests for each. Green.
3. **API routes.** `routes.ts` for both kinds, mounted in `app.ts` as `public`; access test; route tests. Seed positions and the seed test. Green.
4. **Web data.** `types.ts`, `api.ts`, `useLanes.ts`, mock data and handlers, tests. Green.
5. **Web page.** `dropRules.ts`; `BowlerCard`, `PairZone`, `UnassignedList`, `OtherPositions`, `LanesPage` with all states and the toast; no drag yet. Component tests. Green.
6. **Web drag.** Install `dnd-kit` after checking its docs; wire handles, drop zones, cues, and the `AssignDialog`; tests. Green.
7. **Portal.** `SessionPortal`, routes in `App.tsx`, card links, tests. Green.
8. **E2E and accessibility.** Journey and axe tests. `npm run test:e2e`.
9. **Mutation.** `npm run test:mutation` in `api/` and, for the new web logic, `web/`. Fix survivors.
10. **Check.** `npm run check` at the root. Version: bump only if a tag exists for the current version (the rule in CLAUDE.md for 0.x).

Each step ends with lint, typecheck, test, and `format:check` in the folders changed, and a commit that cites the rules, such as `Read lane positions and pairs (LAN-01 to LAN-04)`.

## Not doing

- **The move command** and everything that writes: no POST, PATCH, or DELETE (D-52). The drop shows a stub error.
- **`nextSeat` (first free seat).** It belongs to the command. Building it now would leave unused code. D-56 records the rule, and slice two writes it with its tests.
- **Remove from squad, add a registered bowler, new registration, copy, recap sheets, the cross, staggered skip** (LAN-12).
- **Complete button** and the scores and results tabs (D-60).
- **Sorting options for the unassigned list** (legacy issue #113) and legacy issue #63 ("Lane assignment changes" bug): I will read both with `gh` before the move slice, not this one.
- **Sign-in and role checks** (D-59, 0.3.0).
- **Editing `maxPerPair` or lanes** on the squad (D-12, with squad edit).
