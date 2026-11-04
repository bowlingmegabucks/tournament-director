# Plan: edit tournament

Branch: `editTournament`. Delete this file when the work is done.

Mockups: [index](tournament-edit-mockups/index.html), [edit form](tournament-edit-mockups/edit-form.html), [confirm dialog](tournament-edit-mockups/confirm-dialog.html), [overview](tournament-edit-mockups/overview.html).

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| TRN-10 (edit) | In | New rules TRN-24 to TRN-31 below carry it |
| TRN-01 to TRN-07, TRN-09 | In | Same checks and limits on every field that is sent (D-125, D-13). A field not sent is not rechecked (D-17) |
| TRN-20 | In | Duplicate check on edit ignores the tournament being edited |
| TRN-21 | In | Settings read gains `completed` (D-131) |
| TRN-12 | Already done | Edit changes its inputs, not the rule |
| TRN-08 | Already done | Dropped in D-119 |
| TRN-10 (delete) | Later | Own run (D-15) |
| TRN-10 (complete), Q-03 | Later | Rules settled in D-130; the button ships with Complete squad and sweeper (`SQD-15` to `SQD-18`). This run only enforces the freeze from the stored flag |

New rule IDs (written in Phase 5, `docs/requirements/tournaments.md`):

| ID | Summary |
| --- | --- |
| TRN-24 | `PATCH /v1/tournaments/{id}`: access, partial body, checks, `200 { tournament }`, last save wins, log line |
| TRN-25 | Refusals: completed, locked fields, dates outside squads (D-128, D-130) |
| TRN-26 | Warnings and `confirmWarnings` (D-128, D-129) |
| TRN-27 | Same name and start date on edit (D-123, TRN-20) |
| TRN-28 | `GET /v1/tournaments/{id}/edit-info` (D-131) |
| TRN-29 | Edit page `/tournaments/{id}/edit` |
| TRN-30 | Confirm dialog |
| TRN-31 | Overview: Edit link and Completed badge |

## Decisions used

- D-12: edit is approved; fields settled here.
- D-127: web-only `PATCH`, `tournaments.write`, only changed fields, last save wins.
- D-128: free, warn, or refuse by field.
- D-129: API decides; `409` with `errors` or `warnings`; `confirmWarnings: true`.
- D-130: a complete tournament refuses every field; completing is built next run.
- D-131: `completed` on settings; director-only `edit-info`.
- D-123, D-125, D-13, D-17: duplicate check, limits, super sweeper ratio.
- D-09, D-96, D-105: vendor shapes unchanged; the key cannot reach edit; permission names.
- D-19, D-102: hide, do not disable; deep link asks for sign-in.

## Differs from legacy

Legacy has no edit, so every row is new.

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| TRN-24 to TRN-31 | None | Edit with locks and warnings | D-127 to D-131 |

## API

All web-only (D-09): the legacy API has none of these.

| Route | Access | Answers |
| --- | --- | --- |
| `PATCH /v1/tournaments/{id}` | `tournaments.write` (the key gets 403) | See below |
| `GET /v1/tournaments/{id}/edit-info` | `tournaments.write` | `200 { editInfo: { registrationCount, hasScores, hasSweeperScores } }`; `400` bad id; `404`; `503` |
| `GET /v1/tournaments/{id}/settings` | public | Adds `completed: boolean` to `settings` |

**`PATCH` body.** Any of `name`, `startDate`, `endDate`, `bowlingCenter`, `entryFee`, `games`, `finalsRatio`, `cashRatio`, `superSweeperCashRatio`, plus optional `confirmWarnings: true`. Unknown keys (including `completed`) are refused with 400, as create does. A body with no fields, or only values equal to the stored ones, answers `200` with no write. Each field sent gets the create check and message (D-125). The end-before-start check uses the stored value for a date not sent.

**Order of checks**, inside one serializable transaction with the create retry (D-123):

1. Shape and field checks: `400 { message, errors }`.
2. `404 { message: "Tournament not found" }`; `400` for an id that is not a UUID.
3. Completed: `409 { message, errors }` with one entry per sent field that differs ("This tournament is complete. Nothing can change.").
4. Locks and date range (D-128): `409 { message, errors }`. Start date: refused when a squad or sweeper date falls before the new start (the whole start day counts), or when any score exists. End date: refused when a squad or sweeper falls after the end of the new end day. Games: refused when any score exists. Messages as in the mockups; the date one names the squad ("Saturday 9:00 AM squad is on 2026-11-15, after this end date. Move or remove it first.").
5. Duplicate name and start date, other rows only: `409` with `errors.name` (D-123).
6. Warnings, unless `confirmWarnings` is true: `409 { message, warnings: [{ field, message }] }`, nothing saved. A warning exists only for a field whose value really changes: start date and entry fee with registrations; finals and cash ratio with any score; super sweeper ratio with any sweeper score.
7. Write, then `200 { tournament }` (summary plus settings, like create).

Refusals come before warnings and `confirmWarnings` never overrides them. The log line holds `actorId`, `tournamentId`, and the names of the fields changed, nothing else.

Counts: registrations through `Division.tournamentId` (the table has no tournament column, Q-26); scores through `SquadScore.squadId` to `Squad.tournamentId`, sweepers where `squadType` is 1.

## Web

- **Edit page** `/tournaments/{id}/edit` (`EditTournamentPage.tsx`), same form look as `NewTournamentPage`. Pull the field component and layout that both pages need into a shared `TournamentForm` instead of copying it. Pre-fills from the overview query and `useTournamentSettings`; a stored super sweeper ratio of 0 shows empty, with the hint from the mockup (D-17). Sends only changed fields. Locks, "asks you to confirm" lines, and the Completed banner come from `edit-info` and `completed`. Locked fields are read-only with the reason in `aria-describedby`.
- **Confirm dialog** (`ConfirmChangesDialog.tsx`): native `<dialog>` with `showModal()`, warnings and the old to new value of each, Go back (focus first), Save anyway. Escape closes it.
- **Overview**: an Edit link inside `<Can permission="tournaments.write">`, hidden when complete; a Completed badge when complete; a "Tournament saved" toast (closes itself) on return from a save.
- **Route guard**: `RequirePermission` as for `/tournaments/new`.
- **States**: loading (shared `Loading`), load error with Try again, not found, validation summary, API refusal summary, saving, other failure toast. All in the mockups.
- Hooks: `useEditInfo`, `useUpdateTournament`; `api.ts` gets `updateTournament`, `fetchEditInfo`, and typed errors for refusal and warnings.

## Data

No schema change. `Tournaments.Completed` is read and never written (D-130 gives the write to the next run). Types: API `types.ts` and web `types.ts` gain `completed` on settings, `EditInfo`, and the update request and warning shapes.

## Tests

| Rule | Test |
| --- | --- |
| TRN-24 | `updateRequest.test.ts` (only changed fields, unknown key refused, empty body, limits per field, stored 0 left alone); `updateRoutes.test.ts` (401, 403 for key and score keeper, 404, 400 bad id, 200 shape, no-op); `prismaWriter.db.test.ts` (writes, last save wins); log test for the line |
| TRN-25 | `updateRoutes.test.ts` and `prismaWriter.db.test.ts`: complete refuses each field; games and start date refused with a score; start and end refused outside a squad or sweeper date, edge days allowed; refusal beats `confirmWarnings` |
| TRN-26 | Same files: each warning appears only on a real change; none when nothing is registered or scored; `confirmWarnings: true` saves; super sweeper warning only for sweeper scores |
| TRN-27 | Same name and start date as another row gives 409; own row does not; two simultaneous edits to the same pair leave one |
| TRN-28 | `routes.test.ts`, `prismaRepository.db.test.ts`: counts, sweeper split, access, 404 |
| TRN-21 | `routes.test.ts`, `repository.test.ts`: `completed` in settings |
| TRN-29 | `EditTournamentPage.test.tsx`: pre-fill, changed fields only, locks and lines, 0 ratio, checks, refusal summary, duplicate, saving, other failure, completed read-only, permission and sign-in redirect; `web/e2e/editTournament.spec.ts`; `accessibility.spec.ts` gets the path |
| TRN-30 | `ConfirmChangesDialog.test.tsx`: lists changes, Go back focus, Escape, Save anyway resends with `confirmWarnings`, saving and failure states |
| TRN-31 | `TournamentOverview.test.tsx`: Edit link by permission, hidden and badge when complete, toast |
| Mocks | MSW handlers and `src/mocks/data.ts` factories for the three routes so `dev:mocks` and e2e work |

Run Stryker on the new API logic (`updateRequest`, the decision function) and fix survivors.

## Steps

1. API: `completed` on settings (TRN-21), with tests.
2. API: `edit-info` route, repository counts, tests (TRN-28).
3. API: `updateRequest.ts` (Zod, partial) and tests (TRN-24).
4. API: pure `decideUpdate` function (refusals, warnings from stored row, counts, new values) and tests, no database (TRN-25, TRN-26).
5. API: `update` on the writer interface, in-memory and Prisma versions, serializable transaction and retry, duplicate check (TRN-27), `.db.test.ts` cases.
6. API: `PATCH` route, access label, log line, route tests; mount in `app.ts`.
7. Web: types, `api.ts`, hooks, MSW handlers and factories, with tests.
8. Web: shared `TournamentForm`, move `NewTournamentPage` onto it (its tests stay green).
9. Web: `EditTournamentPage`, `ConfirmChangesDialog`, route, guard (TRN-29, TRN-30).
10. Web: overview Edit link, badge, toast (TRN-31).
11. e2e and axe; `npm run check`; Stryker; fix survivors.

Each step ends green (lint, typecheck, tests, format check).

## Not doing

- Complete tournament button and the squad and sweeper completion it runs (next run, D-130). Nothing in the new app sets `Completed`.
- Delete (D-15).
- A version check for two people editing at once (D-127).
- Editing squad and sweeper overrides, divisions, or any child row.
- Moving the registration site's view of a tournament: vendor shapes stay as they are (D-09).
