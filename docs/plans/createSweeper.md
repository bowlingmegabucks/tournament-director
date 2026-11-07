# Plan: create sweeper

Branch: `createSquad` (second part of 0.7.0; no new branch, no version bump). Delete this file when the work is done.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| SQD-10 | In | Same as SQD-01 and SQD-03 to SQD-07, "Sweeper" in the messages (D-174) |
| SQD-11 | In | Cash ratio required, 1.1 to 99.9, one decimal (D-175) |
| SQD-12 | In | Games 1 to 99; fee above $0 up to $999.99 (D-175) |
| SQD-13, DIV-14 | In | Bonus-pins box per division, saved as `SweeperDivision` rows (D-176 to D-178) |
| SQD-14 | Later | Edit and delete |
| SQD-15 to SQD-18 | Later | Complete and lock |
| Q-11 | Later | Presets; boxes are typed (D-178) |

## Decisions used

- D-167: `squads.write` covers sweepers; own page; `<Can>` link.
- D-168: max per pair 2 to 5, starting lane odd 1 to 199, lanes even 2 to 200.
- D-169: one date-time box, inside the tournament dates, no overlap check.
- D-171: complete tournament gives `409` `errors.tournament`, checked inside the save.
- D-172: toast, log line with ids only, lane prefill.
- D-174 to D-178: this slice (see the decisions file).
- D-125: limits refused, never rounded. D-45: a missing pins row is 0. D-09: web only.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| SQD-10 | Any max per pair above 0, any lane count | 2 to 5, odd 1 to 199, even 2 to 200; API checks the date | D-168, D-169, D-174 |
| SQD-11, SQD-12 | Above 0 / above 1, no cap, no decimal limit | Caps and decimal limits as the tournament | D-175 |
| SQD-13 | A box per division, NULL means 0 | 0 to 99 whole; blank and 0 save no row; unknown division is a `409` | D-176, D-177 |
| SQD-10 | No tournament freeze | A complete tournament refuses | D-171 |

## API

`POST /v1/tournaments/{id}/sweepers` (web only, `squads.write`, no API key; `methods: ['POST']` beside the public GET router).

Request (strict; `complete` is `400`):

```json
{
  "date": "2026-10-24T18:00",
  "startingLane": 1,
  "numberOfLanes": 24,
  "maxPerPair": 4,
  "entryFee": 20,
  "games": 3,
  "cashRatio": 5,
  "bonusPins": { "<divisionId>": 10, "<divisionId>": null }
}
```

- `bonusPins` is optional (a missing key is `{}`). A value is `null`, `""`, or a whole number 0 to 99.
- Required: date, lanes, max per pair, fee, games, cash ratio (a blank gives "X is required").
- `201 { sweeper }` in the list shape (`bonusPins` lists only nonzero pins with division names, in division order), `Location: /v1/tournaments/{id}/sweepers`.
- `400` with `errors` per field. A pin error keys as `bonusPins.<divisionId>`; a bad `bonusPins` value (not an object, key not a UUID) keys as `bonusPins`. `401`, `403`, `404` unknown tournament, `503` database down.
- `409`: `errors.tournament` (complete), `errors.date` (outside the tournament), `errors.bonusPins` ("A division no longer exists. Reload the page") when a key is not a division of this tournament.
- Order inside the save: complete, then date, then divisions. Nothing saves on a refusal.
- Vendor-visible: no route change. The sweeper shows in the existing `sweepers` array (D-09).
- Log: `Sweeper created` with `actorId`, `tournamentId`, `sweeperId`.

Shared code (small refactor, each step stays green): the date, lane, and complete checks and their messages move to `api/src/shared/sessionCreate.ts` with a `subject` ("Squad" or "Sweeper"); squads keep their messages and tests. .NET twin: a shared base validator with a subject parameter.

## Web

Mockups: [index](createSweeper-mockups/index.html), [new-sweeper.html](createSweeper-mockups/new-sweeper.html) (every state), [list.html](createSweeper-mockups/list.html) (link and toast).

- Route `sweepers/new` in `App.tsx` behind `RequirePermission permission="squads.write"`.
- Sweepers page: `titlebar` with the "New sweeper" link in `<Can>` and the shared `useTournamentOpen`; success toast "Sweeper created" from router state (as squads).
- `NewSweeperPage`: waits for settings, sweepers (lane hint, D-178), and divisions; settings or divisions error shows `QueryError`; a failed sweepers list leaves the lane boxes blank; complete tournament shows "This tournament is complete". A failure not about a field is an error toast.
- `SweeperForm`: same markup and CSS module as `SquadForm` (shared form styles move to `web/src/shared/sessionForm.module.css`). Groups: Date, Lanes, Entry and payout (fee, games, cash ratio, all required), Bonus pins per game (one box per division, in division order, labeled with the division name; no divisions shows the note and a link to add one). Summary on top, focus to the first problem.
- `validateSweeper.ts` with the same messages as the API; `useCreateSweeper.ts`, `api.ts` (`createSweeper`, `SweeperRejectedError`). Pin errors map to the division id.
- `useDivisions` is the existing hook; sweeper lane hint is the last of `useSweepers`.
- MSW `POST /v1/tournaments/:id/sweepers` in the mocks, with the same checks.

## Data

No schema change. The writer inserts a `Squads` row (`SquadType` 1, `SweeperEntryFee`, `Games`, `CashRatio`, `Complete` false, no squad fee or finals ratio) and the nonzero `SweeperDivision` rows, inside one non-serializable transaction (D-178). The Prisma client stays free of the SSN; nothing here touches it.

## Tests

| Rule | Test |
| --- | --- |
| SQD-10 | `api/src/features/sweepers/createRequest.test.ts` (date, lanes, per pair, strict keys incl. `complete`); `createPlan.test.ts` (complete, before start, after end, order); `createRoutes.test.ts` (404, 400 id, access 401/403/key); `prismaWriter.db.test.ts` (row stored with type 1, complete false, local date) |
| SQD-11, SQD-12 | `createRequest.test.ts` (each limit, blank, text, decimals); web `validateSweeper.test.ts` and `NewSweeperPage.test.tsx` (messages) |
| SQD-13, DIV-14 | `createRequest.test.ts` (pins: blank, `""`, null, 0, 99, 100, -1, 1.5, text, bad key); `createPlan.test.ts` (unknown division is `409`); `prismaWriter.db.test.ts` (nonzero rows only, one transaction rolls back on failure, other tournament's division refused, list read shows the pins); web `NewSweeperPage.test.tsx` (a box per division, no-divisions note, per-box errors, 409 under the group) |
| Access | `createRoutes.test.ts`, `roles.test.ts` (director, admin only); `SweepersPage.test.tsx` (link hidden for others and for a complete tournament) |
| Flow | `web/e2e/createSweeper.spec.ts` (fill, save, toast, card with pins; field errors; complete tournament; no divisions; unauthorized), axe in `accessibility.spec.ts` |

Stryker on the new API and web logic with a scratch incremental file (never `reports/stryker-incremental.json`).

## Steps

1. API: extract `sessionCreate.ts` (shared date, lane, complete rules); squad tests stay green.
2. API: `sweepers/createRequest.ts`, `createPlan.ts` and tests.
3. API: `writer.ts` (+ in-memory), `prismaWriter.ts` + db test, `createRoutes.ts` + tests, wire in `app.ts`, `server.ts`, `testApp.ts`.
4. Web: shared form CSS, `types`, `validateSweeper`, `api`, `useCreateSweeper` and tests.
5. Web: `SweeperForm`, `NewSweeperPage`, route, link and toast on the Sweepers page, MSW handler, tests.
6. e2e and axe.
7. Lint, typecheck, test, `format:check` in `api/` and `web/`; Stryker with scratch file; fix survivors.

## Not doing

- Edit, delete, and complete for sweepers (later in 0.7.0).
- Bonus-pin presets (Q-11).
- An overlap check between sessions (D-169).
- A version bump (still 0.7.0) or a new branch.
- Entry counts on the cards.
