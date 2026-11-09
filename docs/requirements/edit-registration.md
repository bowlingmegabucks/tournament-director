# Edit registration (desk)

Built on branch `editRegistration`. Migration source: [docs/migration/registrations.md](../migration/registrations.md), [bowlers.md](../migration/bowlers.md), and [payments.md](../migration/payments.md).

The desk changes a registration that exists: it adds or drops a squad or sweeper, switches squads, moves the division, changes the average, turns the super sweeper on or off, and corrects the bowler's details. A prepaid bowler who arrives and decides to bowl another squad is an edit. It is web only (D-197): the registration site keeps `PATCH /v1/registrations/{id}` ([registration-api.md](registration-api.md)) and the vendor contract does not change (D-09).

Needs `registrations.write` (director and admin, D-198). The edit page also reads the bowler's details, which the same route returns, so it needs no second permission. The API key cannot reach these routes. A complete tournament refuses every edit (D-130).

## What the desk does

1. **Open it** from an **Edit** link on a row of the Registrations page, or from **Registration** on a bowler's row on a squad or sweeper lane page (the dialog's "Edit registration" link).
2. **Three steps:** Bowler, Registration, Review (as add, D-164). The page starts on Registration (D-197). Back and the progress list keep what was typed.
3. **Registration step.** The division, average, squads, sweepers, and super sweeper start as stored. Squads and sweepers the bowler holds carry an "Entered" badge and can be unticked. A session with a score of this bowler or a complete one is locked, with the reason in words. The division is locked once the bowler has any score. Super sweeper is locked once the bowler has a sweeper score. To switch squads, untick one and tick another.
4. **Bowler step.** Every detail except the SSN. An emptied box clears the field (D-206). Names cannot be cleared.
5. **Review** lists each change old against new, then what to collect, what may be refunded, and a net line (D-207). A removal needs a tick. One button saves everything at once.
6. **Lane page quick actions.** The **Registration** button on a bowler row (needs `registrations.write`; not shown on a complete session) opens a dialog: Edit registration, Move to another squad (or sweeper), and Remove from this squad (or sweeper). Move and Remove are one save of the same route (D-202).
7. A save goes back to the Registrations list with a toast such as "Maria Gonzalez: Registration updated. Added 1, removed 1."

## Fields

`PATCH /v1/tournaments/{id}/registrations/{registrationId}` takes, all optional:

| Field | Type | Notes |
| --- | --- | --- |
| `divisionId` | UUID | Must belong to the tournament. Refused once the bowler has a score here (`REG-15`) |
| `average` | integer or null | 1 to 300 (`REG-16`); `null` or a blank box clears it; a key left out keeps it |
| `superSweeper` | boolean | Needs every sweeper (`REG-06`) |
| `addSquadIds`, `removeSquadIds` | list of UUID | Changes, not full lists (D-199) |
| `addSweeperIds`, `removeSweeperIds` | list of UUID | Changes, not full lists (D-199) |
| `bowler` | object | Only the changed fields; `''` clears (D-206): names, street, city, state, zip, email, phone, USBC ID, birth date, gender |
| `confirmWarnings` | boolean | The desk confirmed the warnings of an earlier answer (D-201) |

## Rules

| ID | Requirement | Differs from legacy | Tests |
| --- | --- | --- | --- |
| REG-15, BWL-18 | The registration may move to another division of the tournament. The division and the bowler's gender, birth date, and USBC ID save together, and eligibility (`REG-04`, `REG-05`) runs on the new values. Refused once the bowler has any score in this tournament: `400` "Cannot change bowler division after scores have been recorded." The page locks the box and says why. | Yes: one edit page, and the server holds the lock (D-117, D-205) | `editRegister.test.ts`, `editRoutes.test.ts`; `editForm.test.ts`, `EditRegistrationPage.test.tsx`; `web/e2e/editRegistration.spec.ts` |
| REG-04, REG-05 (on edit) | Eligibility and the USBC ID for a handicap division run when something they read changed: the division, the average, or the bowler's gender, birth date, or USBC ID. An edit that changes none of these (adding a squad) skips them, so a bowler who no longer fits after the division was edited (D-12) can still add a squad. | New: legacy reran them on every save | `editRegister.test.ts` ("does not run eligibility when nothing it reads changed") |
| REG-16 | The average is blank (cleared) or 1 to 300 ("Average must be greater than 0.", "Average must be less than or equal to 300."). The division's limits are re-checked against it and block with a `400`. Free until the bowler has a score; after that the save answers `409` with `warnings` and the director confirms ("Handicap and results will change"), then the page resends with `confirmWarnings: true`. | Yes: legacy had no limits check and no warning (D-201, answers Q-08) | `editRegister.test.ts`, `editRequest.test.ts`, `editRoutes.test.ts`; `editForm.test.ts`, `EditRegistrationPage.test.tsx`; e2e |
| REG-17 | Super sweeper on: the bowler must hold every sweeper (the desk may tick the missing ones in the same save) and none of the bowler's sweepers may be complete. | | `editRegister.test.ts`; `EditRegistrationPage.test.tsx`; e2e |
| REG-18, REG-36 | Super sweeper off, or any change to it, is refused once this bowler has a sweeper score (`400`). The page locks the box. | Yes: per bowler, not per tournament (D-110) | `editRegister.test.ts`; `EditRegistrationPage.test.tsx`; e2e |
| REG-06, REG-35 | With super sweeper on, a sweeper cannot come off unless super sweeper goes off in the same save: `400` "Remove the Super Sweeper first, then remove this sweeper." Turning it on needs every sweeper: "Super Sweeper cannot be enrolled when not all sweepers are registered." A request that leaves super sweeper alone and only adds a squad is not checked. | Yes: the first message is new (D-203) | `editRegister.test.ts`; `EditRegistrationPage.test.tsx` |
| REG-20 | A squad or sweeper can be removed (the refund, D-06, D-11): refused with `400` when the bowler has scores in it ("Bowler has already bowled in removed squads.") or when it is complete (D-10). The entry and its lane position go. Review lists the refund and needs a tick (D-207). | Yes: the server locks a complete session (D-10); the Review tick is new | `editRegister.test.ts`, `editRoutes.test.ts`; `editForm.test.ts`, `EditRegistrationPage.test.tsx`, `SessionActionsDialog.test.tsx`; e2e |
| REG-03, REG-31 | A registration keeps at least one squad: removing the last is a `400` "Bowler must enter at least one squad". The page also checks it before it asks. | Yes: legacy allowed it (D-04, D-203) | `editRegister.test.ts`; `EditRegistrationPage.test.tsx`, `SessionActionsDialog.test.tsx`; e2e |
| REG-21, REG-32, REG-33 | A squad or sweeper can be added. It must belong to the tournament, be of the right kind, and not be complete (`400` "Invalid squad IDs", "Cannot add squad(s) that are already complete."). It lands unassigned. | Yes: the checks are a `400` (D-108) | `editRegister.test.ts`; `EditRegistrationPage.test.tsx`; e2e |
| BWL-16 | The bowler's details can change: only the changed fields are sent and saved (the SSN is never read or written, `BWL-17`). An emptied box clears the field; a name or the USBC ID of a handicap-division bowler cannot be cleared. `BWL-01` to `BWL-10` run on the stored values plus the edits. A USBC ID another bowler holds is `400` "Another bowler already has this USBC ID." Review shows "Phone: 5551234567 → (cleared)". | Yes: patch, not replace, and clearing is deliberate (D-05, D-206) | `editRegister.test.ts`, `editRequest.test.ts`; `editForm.test.ts`, `EditRegistrationPage.test.tsx`; e2e; `editRegister.db.test.ts` |
| REG-25 | Each row of the Registrations list has an Edit link, named for the bowler. It shows only with `registrations.write` and not on a complete tournament. | Yes: a link and a page, not a context menu (D-197) | `RegistrationsPage.test.tsx`; e2e |
| EDR-01 (new) | **Move** to another squad (or sweeper) of the same kind is one save from a squad's lane page: remove the entry here and add the other. Only open sessions the bowler is not in are offered. It is refused with scores or a complete source, and with a complete target. The dialog shows both fees and a net. The bowler lands unassigned. The edit page has no Move button: there the desk unticks one and ticks another. A failed add removes nothing. | New (D-202) | `editRegister.test.ts`, `editRegister.db.test.ts`; `SessionActionsDialog.test.tsx`; e2e |
| EDR-02 (new) | **Stale record.** The desk sends additions and removals, never full lists, so a squad the registration site added meanwhile is kept. A session to add that is already held, or one to remove that is gone, answers `409` `conflict: "changed"` with the current registration; the page shows "This registration changed. Review and save again.", what is entered now, and a **Reload registration** button. The save re-checks inside a serializable transaction: two desks adding the same squad at once save once, and the other is told it changed. Nothing is written on a stale save. | New (D-199) | `editRegister.test.ts`, `editRoutes.test.ts`, `editRegister.db.test.ts`; `editApi.test.ts`, `EditRegistrationPage.test.tsx`; e2e |
| EDR-03 (new) | **Money.** Review lists the added sessions with fees (collect), the removed ones with fees ("Refund may be due, handled outside the app"), and one net line: collect, refund, or even. A squad's fee is its own or the tournament's; there is no super sweeper fee. Whole cents. A removal needs a tick, which clears when the choice changes. The app records no payment. | New (D-207); extends D-166 | `editForm.test.ts`, `EditRegistrationPage.test.tsx`, `SessionActionsDialog.test.tsx`; e2e |
| EDR-04 (new) | **Access.** `GET …/edit-info` and `PATCH` need `registrations.write`. Signed out gets `401`; the API key and a score keeper get `403`; director and admin pass. A complete tournament answers `409` with `errors.form`. An unknown tournament or a registration of another tournament is `404`. The lane page buttons and the Edit link hide for users without the permission. | New (D-198) | `editRoutes.test.ts`; `RegistrationsPage.test.tsx`, `SessionActionsDialog.test.tsx`; e2e |
| EDR-05 (new) | **Payment and logging.** An edit that adds a session records one $0 `Manual_<UUID>` payment; a removal, move without an add, or a change to average, division, or super sweeper records none (a move adds a session, so it records one). A save logs "Registration edited" with `actorId`, `tournamentId`, `registrationId`, and the counts, and the read logs "Registration read for edit at the desk" with the bowler id; neither holds a name, email, or USBC ID. | New (D-200) | `editRegister.test.ts`, `editRoutes.test.ts`, `editRegister.db.test.ts` |

## API

All web only (D-09). Access `{ permission: 'registrations.write' }` (D-198). Mounted on `/v1/tournaments/:id/registrations` for `GET /:registrationId/edit-info` and `PATCH /:registrationId`.

| Route | Request | Response | Errors | Vendor-visible |
| --- | --- | --- | --- | --- |
| `GET /v1/tournaments/{id}/registrations/{registrationId}/edit-info` | | `200 { bowler, registration, locks }`. `bowler` has the form fields and no SSN. `registration` has `id`, `divisionId`, `average`, `superSweeper`, `squadIds`, `sweeperIds`. `locks` has `scoredSessionIds`, `hasScores`, `hasSweeperScores` | `400` bad id; `401`; `403`; `404` tournament or registration | No |
| `PATCH /v1/tournaments/{id}/registrations/{registrationId}` | body (Fields) | `200 { registrationId, added, removed }` | `400 { message, errors }` one message per field (`bowler.email`, `average`, `squadIds`, `sweeperIds`, `divisionId`, `superSweeper`, `form`); `404`; `409 { conflict: "changed", existing }`; `409 { warnings }`; `409 { errors: { form } }` complete tournament; `401`; `403`; `503` database down | No |

`existing` is the same shape the add route sends for an already-registered bowler. The `warnings` shape is the one the divisions and tournaments edits use (`{ field, message }`).

## Screens

- **Registrations page:** an Edit link on each row (a card on a phone), in a column with a hidden heading "Actions".
- **Edit registration** (`/tournaments/{id}/registrations/{registrationId}/edit`): the steps above. States: loading, read error with Try again, "Registration not found", the complete-tournament notice, saving, validation errors (back to the step with the field), the changed notice with Reload, and the warnings dialog ("Save these changes?", Go back first).
- **Lane page:** a **Registration** button on each bowler row opens the actions dialog (Edit registration, Move, Remove). Move and Remove show the fees, show a refusal in the dialog, and toast on success ("Maria Gonzalez moved to another squad."). Move and Remove are off, with the reason in words, when the bowler has scores in that squad.
- Axe passes in dark and light mode on every step, the locked boxes, the empty Review, the changed notice, and every lane dialog. Nothing scrolls sideways at 320 px.

## Not built

- **Delete registration** (the `REG-19` screen): see [delete-registration.md](delete-registration.md).
- Recording real payments or refunds, or a balance (D-163, D-11, `PAY-05`).
- Live updates when another desk or the site changes a bowler (Q-27); the `409 changed` guard is the only protection.
- A marker on the lane page for a bowler who has scores. The dialog reads the bowler's locks when it opens, and the server refuses.
- Moving a bowler between a squad and a sweeper, and SSN edit or verify (Q-22).
