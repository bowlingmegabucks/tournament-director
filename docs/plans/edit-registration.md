# Plan: edit registration

Branch: `editRegistration`. Delete this file when the work is done.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| REG-15, BWL-18 | In | Change division on the edit page; gender, birth date, USBC ID save to the bowler |
| REG-16 | In | Average; confirm once scores exist (D-201) |
| REG-17, REG-18 | In | Super sweeper add and remove (D-204) |
| REG-20 | In | Remove from a squad or sweeper: edit page and lane page button |
| REG-21 | In | Add a squad or sweeper on the edit page; Move on the lane page only (D-202) |
| BWL-16 | In | Edit bowler details, no SSN; an emptied box clears (D-206) |
| REG-25 | In | Edit link on each Registrations row |
| New (EDR-01 to EDR-0x) | In | Move, stale-record guard, collect/refund/net Review |
| REG-19 screen | Later | Delete registration: next slice (D-208, Q-35) |
| BWL-11, BWL-17 verify | Later | SSN (Q-22) |
| Q-26, Q-27, PAY-01 | Later | Constraint, live push, recorded payments |
| REG-01 to REG-14, REG-22, REG-30 to REG-39 | Already done | Reuse the logic |

## Decisions used

- D-197: web-only routes; one edit page; lane page Remove and Move; vendor `PATCH` unchanged.
- D-198: `registrations.write` (director, admin); complete tournament refuses (D-130).
- D-199: the desk sends adds and removes, not full lists; a stale change is a `409`.
- D-200: an edit that adds a session records the $0 `Manual_` payment.
- D-201: average free until a score exists, then `409` with `warnings`; limits re-checked and block.
- D-202: Move is a lane page dialog: one save, same kind, lands unassigned. The edit page switches a squad by uncheck and check.
- D-203: removal guards (no scores, not complete, keep a squad, super sweeper first).
- D-204: super sweeper rules of legacy.
- D-205: division change refused after any score; eligibility on new values.
- D-206: an emptied bowler box clears the field on edit.
- D-207: Review shows collect, refund, net; a removal needs a tick.
- D-04, D-05, D-10, D-107, D-110, D-117, D-128, D-130, D-147, D-157, D-158, D-163, D-165, D-166: shared with add and the vendor `PATCH`.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| REG-15 to REG-21 | One small screen per action | One edit page plus lane page quick actions, one save | D-197 |
| REG-20, REG-21 | Remove and add are separate saves | Move is one atomic save; saves send changes, not lists | D-199, D-202 |
| REG-16 | No check, any time | Limits block; confirm once scores exist | D-201 |
| REG-20 | Confirm sentence only | Review lists the refund and a tick is needed | D-207 |
| BWL-16 | Full update replaces every field, including the SSN | Only changed fields; no SSN; an emptied box clears | D-206 |
| REG-31 | Empty squad list allowed | Refused | D-04, D-203 |

## API

All web only (D-09); access `{ permission: 'registrations.write' }`; the API key cannot reach them (D-96). Mounted on the existing `/v1/tournaments/:id/registrations` path for `GET /:registrationId/edit-info` and `PATCH /:registrationId`. Code goes in `api/src/features/registrations/`: `editInfo.ts`, `editRegister.ts` (the rules), `editRequest.ts` (Zod), `editRoutes.ts`; the writer gets one new guard.

### `GET /v1/tournaments/{id}/registrations/{registrationId}/edit-info`

`200 { bowler, registration, locks }`:

- `bowler`: the same values as `GET /v1/bowlers/{id}` (no SSN, BWL-17).
- `registration`: `id`, `divisionId`, `average`, `superSweeper`, `squadIds`, `sweeperIds`.
- `locks`: `scoredSessionIds` (sessions where this bowler has a score), `hasScores` (any score in this tournament), `hasSweeperScores`.

Errors: `400` bad ids; `404` unknown tournament or a registration of another tournament; `401`; `403`.

### `PATCH /v1/tournaments/{id}/registrations/{registrationId}`

Body (every part optional):

```json
{
  "divisionId": "uuid",
  "average": 175,
  "superSweeper": true,
  "addSquadIds": [], "removeSquadIds": [],
  "addSweeperIds": [], "removeSweeperIds": [],
  "bowler": { "phoneNumber": "" },
  "confirmWarnings": true
}
```

- `average: null` clears it (`REG-16`); 1 to 300.
- `bowler` holds only changed fields; an empty string clears (D-206), except names and the USBC ID of a bowler who stays in or moves to a handicap division.
- Success: `200 { registrationId, added, removed }`.
- `400 { message, errors }`, one message per field (`bowler.phoneNumber`, `average`, `squadIds`, `superSweeperIds`, `form`): bowler rules `BWL-01` to `BWL-10`; eligibility `REG-04`, `REG-05` against the new division, average, and bowler values (D-205, D-107); REG-06/REG-35 super sweeper needs every sweeper; REG-17 a complete sweeper held; REG-18 / D-110 sweeper scores; REG-33 / D-108 a session to add is complete or from another tournament; REG-34 / D-10 a session to remove has scores or is complete; D-04 the last squad; D-203 "Remove the Super Sweeper first."; D-117 / D-205 division change after a score; USBC ID held by another bowler (D-161).
- `404` unknown tournament, registration of another tournament, or session id.
- `409`:
  - `{ conflict: 'changed', registration }`: a session to add is already held or one to remove is gone (D-199).
  - `{ warnings }`: the average changes with scores on file; resend with `confirmWarnings: true` (D-201).
  - `errors.form`: complete tournament (D-130).
- A `409 changed` also covers a stale guard that fails inside the save transaction.
- The save: one transaction. It patches the bowler, the registration, deletes removed `SquadRegistration` rows, adds new ones with no lane, and adds a `Manual_<UUID v7>` $0 payment only when it adds a session (D-200). The writer's `save` takes an `expectedSessionIds` guard and throws when the registration's current rows for the touched ids differ.
- Log line "Registration edited" with `actorId`, `tournamentId`, `registrationId`, the counts added and removed; never names, email, or USBC ID (as `deskRoutes.ts`).

Move (lane page) and the lane page Remove are the same `PATCH` (a remove, or a remove plus an add of the same kind). No separate route.

Vendor visibility: none. The vendor `PATCH /v1/registrations/{id}` is untouched.

## Web

Mockups: [index](edit-registration-mockups/index.html), [registrations-row](edit-registration-mockups/registrations-row.html), [edit-page](edit-registration-mockups/edit-page.html), [edit-review](edit-registration-mockups/edit-review.html), [lane-actions](edit-registration-mockups/lane-actions.html).

- **Registrations page:** an Edit link per row inside `<Can permission="registrations.write">`, hidden on a complete tournament (D-198). Phone card has the same link.
- **Route:** `/tournaments/{id}/registrations/{registrationId}/edit`, behind `RequirePermission`. Page `EditRegistrationPage.tsx` reuses `DeskSteps`, `BowlerFields`, `RegistrationFields`; new `EditReviewStep.tsx` (changes, collect, refund, net, the removal tick) and `EditRegistrationForm.tsx`.
- **Hooks:** `useEditInfo` (query), `useEditRegistration` (mutation; invalidates registrations, lanes, squads, scores, results as the add hook does). `api.ts` gets `fetchEditInfo` and `patchRegistration`.
- **Pure logic** in `editForm.ts`: diff the form against `edit-info` into the request (changed bowler fields only, add and remove lists), the collect and refund lines, and the net. Fees come from `squads` and `sweepers` queries (a squad's fee is its own or the tournament's, as `dueLines` does).
- **Locked controls:** a session with a score of this bowler or a complete session shows its box disabled with the reason in text (not color); division is disabled once `hasScores`; super sweeper is disabled once `hasSweeperScores`.
- **Move dialog** `MoveDialog.tsx` (lane page only; the edit page has no Move button, a switch there is uncheck and check, shown on Review): radio list of open sessions of the same kind not held, with fees and the net line. Sends one `PATCH`.
- **Lane page:** each unassigned or placed bowler row gains Edit (a link), Move, and Remove buttons for `registrations.write`, hidden when the session or tournament is complete. `RemoveDialog.tsx` shows the refund and any server refusal in the dialog; success toasts and refetches the lane page. The lane page does not know scores, so the server refuses and the message shows.
- **States:** loading (`Loading`), error (`QueryError` with retry), not found, complete tournament notice, saving (button disabled and reads "Saving…"), validation errors (back to the step with the field, focus the first), `409 changed` (a notice and a Reload button), `409 warnings` (`ConfirmChangesDialog`).
- **Toasts:** success "Registration updated. Added 2, removed 1." (auto dismiss); errors stay.
- **a11y:** every control labeled; a disabled box has `aria-describedby` to its reason; dialogs are focus-trapped; page `<title>`; axe passes in dark and light on every step and dialog; no sideways scroll at 320 px.

## Data

No schema change. `SquadRegistration` rows are deleted and created; the new row has an empty lane position. A removed session's lane position goes with its row. The bowler patch uses `BowlerPatch` (`Partial<BowlerData>`), where `''` and `null` already clear.

Web types: `EditInfo`, `EditRegistrationRequest`, `EditRegistrationResult`, in `registrations/types.ts`; the API's `editRequest.ts` and the web types are changed together.

## Tests

IDs EDR-xx are new rules for this feature (no legacy twin); each gets a row in the requirements file.

| Rule | Proof |
| --- | --- |
| REG-15, BWL-18 | `editRegister.test.ts` "moves the division and saves gender, birth date, USBC ID (REG-15, BWL-18)"; "refuses a division change after a score (D-205)"; `editForm.test.ts`; `EditRegistrationPage.test.tsx`; e2e |
| REG-04, REG-05 (edit) | `editRegister.test.ts` eligibility on the new division and average; handicap division needs a USBC ID |
| REG-16, Q-08 | `editRegister.test.ts` "average free before scores", "average with scores answers warnings and saves with confirmWarnings (D-201)", "average out of range", "limits block"; `EditRegistrationPage.test.tsx` warning dialog; e2e |
| REG-17, REG-18 | `editRegister.test.ts` "add needs every sweeper", "refused when a held sweeper is complete", "remove refused after this bowler's sweeper score (D-110)"; page test locks the box |
| REG-20 | `editRegister.test.ts` "remove refused with scores", "remove refused when complete (D-10)", "last squad refused (D-04)", "remove a sweeper while super sweeper is on (D-203)"; `RemoveDialog.test.tsx`; `LanesPage.test.tsx`; e2e |
| REG-21 | `editRegister.test.ts` "adds a squad and records the placeholder payment (D-200)", "add refused when complete or other tournament (D-108)", "no payment on a pure removal"; page test; e2e |
| BWL-16 | `editRegister.test.ts` "patches changed bowler fields", "an empty string clears (D-206)", "a name cannot be cleared", "BWL-01 to BWL-10 on the stored values", "USBC ID held by another bowler"; `editForm.test.ts`; page test |
| REG-25 | `RegistrationsPage.test.tsx` Edit link per row, hidden without the permission and on a complete tournament; e2e |
| EDR-01 Move | `editRegister.test.ts` "remove and add in one save", "failed add removes nothing"; `MoveDialog.test.tsx`; `prismaWriter.db.test.ts` transaction; e2e |
| EDR-02 stale guard | `editRegister.test.ts` "409 changed when the session is already held or gone (D-199)"; `prismaWriter.db.test.ts` "guard fails inside the transaction"; page test shows the notice; e2e |
| EDR-03 Review money | `editForm.test.ts` collect, refund, net for add, remove, move, even; `EditReviewStep.test.tsx` the tick |
| EDR-04 access | `editRoutes.test.ts` `401`, `403` for score keeper and API key, `404`, complete tournament `409`; `roles.test.ts` unchanged (permission exists); `app.test.ts` route access table |
| EDR-05 logging | `editRoutes.test.ts` one line with `actorId`, ids, counts, no personal data |
| a11y | `web/e2e/accessibility.spec.ts` adds the edit page and the dialogs; `web/e2e/registrations.spec.ts` covers every flow (change division, average with confirm, super sweeper add and remove, remove, move, add a squad for a prepaid bowler, clear a phone, stale 409, refusals, phone width) |
| DB | `prismaWriter.db.test.ts` and `editRoutes.db.test.ts` on MariaDB for the transaction and the guard |

Stryker `test:mutation:fast` on the new API files and `editForm.ts`; fix survivors.

## Steps

1. API: `editRequest.ts` (Zod) and `editRegister.ts` with an in-memory writer, rules and tests. Green.
2. API: writer guard (`expectedSessionIds`) in the in-memory and Prisma writers; `prismaWriter.db.test.ts`. Green.
3. API: `editInfo.ts`, `editRoutes.ts`, mount in `app.ts` with the access label, logging; route tests and the access table test. Green.
4. Web: types, `api.ts`, hooks, `editForm.ts` and tests; MSW handlers and factories in `src/mocks/`. Green.
5. Web: `EditRegistrationPage`, `EditReviewStep`, route, and the Registrations Edit link; component tests. Green.
6. Web: lane page Edit, Move, Remove, `MoveDialog`, `RemoveDialog`; tests. Green.
7. e2e (`registrations.spec.ts`, `accessibility.spec.ts`) and mutation run. Fix survivors.
8. Run `npm run check`, then commit per step citing rule IDs.
9. Phase 5: requirements file, migration Status columns, delete this plan.

## Not doing

- Delete registration screen and Q-35 (D-208). The edit page names it in the "last squad" message only.
- Recording real payments or refunds; no balance (D-163, D-11).
- Live push when another desk or the site changes a bowler (Q-27). The `409 changed` guard is the only protection.
- A lane-page marker for scored bowlers: the server refuses and the message shows.
- Moving a bowler across kinds (squad to sweeper).
- SSN edit or verify (Q-22).
- Any change to the vendor `PATCH` or other vendor routes (D-09).
