# Plan: delete registration (desk)

Branch: `deleteRegistration`. Delete this file when the work is done.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| REG-19 | In | Desk dialog and web-only route. The vendor `DELETE` (`API-08`) is unchanged. |
| REG-25 | In | A Delete button on each Registrations row (D-214). |
| REG-20, D-203 | In | The last-squad refusal text names Delete. |
| Q-35 | In | Answered: a real payment warns (D-210). |
| D-10, D-130 | In | Complete tournament refuses; a complete session is covered by scores. |
| API-08 | Already done | Not touched (D-09). |
| Q-38 | Later | Recording refunds and payments stays open. |

## Decisions used

- D-209: web-only `DELETE` and `GET …/delete-info` under the tournament, `registrations.write`; vendor route untouched.
- D-210: a real payment (code not `Manual_…`, amount above $0) warns: `409 warnings`, then `?confirmWarnings=true`; the total paid is part of the confirm.
- D-211: refuse on a complete tournament or any score; one serializable transaction with retry.
- D-212: the refund view lists fees and recorded real payments (system and amount, no code).
- D-213: Cancel/Delete; a tick when a real payment exists.
- D-214: row and edit page entry points; the log line holds counts and the paid total.
- D-06, D-10, D-11: a refund is handled outside the app.
- D-09, D-96, D-106, D-129, D-133, D-135, D-155, D-163, D-198, D-203, D-207.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| REG-19 | Plain confirm; refuses with scores; removes payments with no mention | Same refusals, plus a complete-tournament refusal, a warning and a tick for a real payment, and a refund view | D-209 to D-214 |
| REG-25 | Context-menu action | A Delete button on each row and a link on the edit page | D-214 |

## API

All web only (D-09). Access `{ permission: 'registrations.write' }`. Mounted beside the edit routes on `/v1/tournaments/:id/registrations`.

| Route | Response | Errors |
| --- | --- | --- |
| `GET /v1/tournaments/{id}/registrations/{registrationId}/delete-info` | `200 { deleteInfo }` (below) | `400` bad id; `401`; `403`; `404` tournament or registration (another tournament's too) |
| `DELETE /v1/tournaments/{id}/registrations/{registrationId}` | `204`, no body | `404`; `409 { message, errors: { tournament?, scores? } }` refusal; `409 { message, warnings: [{ field: "registration", message }], paid }` first call with a real payment; `401`; `403`; `503` |

`deleteInfo`:

```
{
  bowlerName, divisionName, tournamentComplete, hasScores,
  entries: [{ id, kind: "squad" | "sweeper", date, entryFee }],
  entriesTotal,
  payments: { count, total, items: [{ system, amount }] }   // real payments only
}
```

- `system` is the part of the stored code before the first `_`. The confirmation code never leaves the API.
- Confirming: `DELETE …?confirmWarnings=true&paid=<total>`. The `paid` value is the total the director saw (two decimals). If the stored total differs, the route answers the `409` warning again with the new total (D-210). With no real payment, `confirmWarnings` is not needed and is ignored.
- Order inside one serializable transaction with retry (D-155): read the registration, the tournament's `completed`, scores of the bowler in the tournament, and the payments; refuse (all reasons together, D-211); warn if a real payment exists and the confirm is missing or stale; otherwise delete squad entries, payments, then the registration. The bowler stays.
- The real payment rule (D-133) uses the same `manualPrefix` as `tournaments/prismaDeleteFacts.ts`; a small pure `isRealPayment(code, amount)` goes in `registrations/payment.ts` and uses that constant, so the prefix lives in one place.
- Log "Registration deleted at the desk": `actorId`, `tournamentId`, `registrationId`, `squads`, `sweepers`, `realPayments`, `paidTotal` (D-214). Refusals log at `warn` with reasons count. Nothing with a name, email, USBC ID, or code.
- Writer: add `getDeleteFacts` and `removeRegistration(registrationId, { seenPaid, confirm })` to `RegistrationWriter` (in-memory and Prisma), as tournament `remove` does. The vendor `deleteRegistration` stays as is.

## Web

Mockups: [index](delete-registration-mockups/index.html), [dialog states](delete-registration-mockups/dialog.html), [entry points](delete-registration-mockups/entry-points.html).

- `DeleteRegistrationDialog` (feature folder), built on `shared/Dialog.module.css` like `DeleteSessionDialog`. Cancel has focus first. States: loading, plain, real payment (warning block and tick), ticked, refused (scores, complete tournament; only Close), changed since open (message and Reload), read error (Try again; Delete off), deleting.
- `DeleteRegistrationButton`: the trigger, a red outline button (`.danger` style; the filled red button stays in the dialog). Row button name: "Delete Gonzalez, Maria's registration". It shows only with `registrations.write` and not on a complete tournament (`useCan`, `useTournamentSettings`). It sits away from Edit (D-214): in the table its own last column (no visible heading; a visually hidden "Actions" heading stays for screen readers, as the Edit column has today); on a phone card below a divider; on the edit page in a "Danger zone" section below the steps and Save, outside the form.
- `deleteApi.ts`: `fetchDeleteInfo` and `deleteRegistration`. A `409` with `errors` throws `RegistrationDeleteRefusedError`; a `409` with `warnings` throws `RegistrationPaidWarningError` (holds the new total).
- `useDeleteInfo` (TanStack Query, not cached across opens: `gcTime: 0`) and `useDeleteRegistration` (mutation; invalidates `registrations`).
- After a delete: the row list refreshes and a toast says "Maria Gonzalez: Registration deleted." From the edit page, navigate to the Registrations list with the same toast (as edit does).
- Add the red outline style to `Dialog.module.css` only if a second feature needs it; else in the feature's CSS module. Use `--color-danger`, never a raw color.
- The tick is local UI state and clears when the info reloads with a different paid total.
- Edit page: a "Danger zone" section (red border, explanation, red "Delete registration" button) at the bottom opens the same dialog. The last-squad refusal text becomes "A registration keeps at least one squad. To remove the last one, delete the registration." in both API (`editRegister.ts`) and the page pre-check. Check what the e2e and tests assert on the old text.
- Phone: the row card holds Edit and Delete. The dialog's fee table is a two-column table that fits 320 px.

### Delete style for the whole app (D-215)

The red outline trigger and the apart placement apply to every delete in the app, not only this one:

| Place | Today | Change |
| --- | --- | --- |
| Tournament overview and edit page (`DeleteTournamentButton`) | Outline accent button | Red outline; on the edit page in a Danger zone below the form |
| Division row (`DeleteDivisionButton`) | Button beside Edit | Red outline, own last column, away from Edit |
| Squad and sweeper cards (`DeleteSessionButton`, `SessionCard`) | Outline accent button (`.trigger`) | Red outline, below a divider away from Edit |
| Registration row and edit page | New | As in the mockups |

- One shared `.danger` button style and one shared `DangerZone` section component in `src/shared/` (two features now need them). The per-feature `.trigger` class in `DeleteSession.module.css` goes.
- Dialog confirm buttons already use the filled red style; they stay.
- The `ui-standards` skill and `docs/frontend-standards.md` gain the rule: a destructive trigger is a red outline button, set apart from routine actions, and on an edit page it goes in a Danger zone.
- Existing tests that find these buttons by role and name keep passing (names do not change). Add a test that each trigger renders in the shared danger style class, and check the axe e2e scan in dark and light for contrast of `--color-danger` text on the card and page backgrounds.
- This work lands as its own step before the registration build (step 2 below), so the registration work reuses the shared pieces.

## Data

No schema change. Reads `Registrations`, `SquadRegistration`, `Payments`, `Squads`/`SweeperDivision` (fees), `Tournaments.Completed`, `SquadScores`. No new table. The Prisma client already omits the SSN.

## Tests

| Rule | Test |
| --- | --- |
| REG-19 refuses with scores (`409 errors.scores`) | `deskDelete.test.ts` "refuses a bowler with scores (REG-19)"; `deskDeleteRoutes.test.ts`; `DeleteRegistrationDialog.test.tsx`; e2e |
| D-211 refuses a complete tournament, reasons together | `deskDelete.test.ts`, `deskDeleteRoutes.test.ts` |
| REG-19 deletes entries, payments, registration; bowler stays | `deskDelete.test.ts`; `deleteRegistration.db.test.ts` (Testcontainers) |
| D-210 real payment warns, then deletes with the matching `paid` | `deskDelete.test.ts`; `deskDeleteRoutes.test.ts`; db test |
| D-210 `Manual_` or $0 payment deletes with no warning | `deskDelete.test.ts` |
| D-210 stale `paid` warns again | `deskDelete.test.ts` |
| D-211 serializable retry, score saved mid-delete refuses | `deleteRegistration.db.test.ts` |
| D-209 access: `401`, `403` (key, score keeper), `404` (unknown, other tournament) | `deskDeleteRoutes.test.ts` |
| D-209 vendor `DELETE` unchanged | existing `vendorRoutes.test.ts`, `delete.test.ts` stay green |
| D-212 delete-info: fees, total, real payments only, no code | `deskDeleteInfo.test.ts`; `deskDeleteRoutes.test.ts` |
| D-214 log holds ids and counts, no name or code | `deskDeleteRoutes.test.ts` |
| D-213 tick needed only with a real payment; clears on reload | `DeleteRegistrationDialog.test.tsx` |
| D-214 button shows with permission, hides on complete tournament and for a score keeper | `RegistrationsPage.test.tsx`, `EditRegistrationPage.test.tsx` |
| D-203 last-squad text names Delete | `editRegister.test.ts`, `EditRegistrationPage.test.tsx`, `SessionActionsDialog.test.tsx` |
| Whole flow (exhaustive per owner): plain delete from row; real payment tick; refused with scores; refused complete; delete from edit page; cancel; phone width; axe in dark and light | `web/e2e/deleteRegistration.spec.ts` |

Mutation: `npm run test:mutation:fast` on the new API and web files.

## Steps

1. Docs only: this plan, the mockups, the decisions (done in Phase 2).
2. Web: shared `.danger` style and `DangerZone`; restyle the tournament, division, and squad/sweeper delete triggers; update the skill and the standards doc (D-215). Lint, typecheck, test, e2e green.
3. API: `isRealPayment(code, amount)` in `registrations/payment.ts`, built on the shared `manualPrefix`; tournament delete tests stay green.
4. API: `deskDelete.ts` (rules) with unit tests against the in-memory writer; writer `getDeleteFacts` and `removeRegistration` (in-memory first).
5. API: `deskDeleteRoutes.ts` (`GET delete-info`, `DELETE`), mounted in `app.ts` with `registrations.write`; route tests.
6. API: Prisma writer for the facts and the serializable delete; db tests.
7. API: last-squad message names Delete; update tests.
8. Web: `deleteApi.ts`, hooks, MSW handlers and factories in `src/mocks/`; tests.
9. Web: `DeleteRegistrationDialog` and `DeleteRegistrationButton`; tests.
10. Web: row button (table and card), edit page button, toast, last-squad text; tests.
11. E2E spec and the axe scan; seed data gains one registration with a real payment (check `db:seed`).
12. Run lint, typecheck, test, format:check in `api/` and `web/`; e2e; mutation.

## Not doing

- Recording a refund or payment amount, a refund status, or a balance (Q-38, D-163, `PAY-05`).
- A delete button in the lane page dialog (D-214).
- Any change to the vendor `DELETE /v1/registrations/{id}` or its `400` body (D-09).
- Deleting the bowler record (`REG-19`).
- Bulk delete.
- Restyling non-delete buttons.
- A typed-name confirm (D-213).
