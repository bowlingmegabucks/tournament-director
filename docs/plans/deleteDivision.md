# Plan: delete division

Branch: `deleteDivision` (the third part of 0.6.0). Delete this file when the work is done.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| DIV-12 (delete) | In | `DELETE` route, `delete-info` read, Delete button per row, dialog |
| DIV-01 (delete) | In | Later numbers move down by one (D-153, closes Q-36) |
| DIV-03 (delete) | In | Same URL checks as edit; a complete tournament refuses (D-151) |
| DIV-14 | In (side effect) | `SweeperDivision` rows cascade (D-152). The read part is already done |
| DIV-15 | In, no change | Delete removes rows, so uniqueness still holds |
| Move a bowler to another division (`REG-15`) | Later | Q-37, with registrations edit (D-156) |
| Edit the number, move up or down | Later | Not asked for (D-146, D-153) |
| Eligibility at registration, handicap formula | Later | Not part of delete |

## Decisions used

- D-12, D-15: divisions can be edited and deleted; delete is settled here.
- D-96: routes ask for a permission, never a role. D-09: no vendor route changes.
- D-130, D-143, D-149: a complete tournament refuses every division change.
- D-133, D-135, D-137: the tournament delete is the pattern (refusals inside one serializable transaction).
- D-146, D-139: the number is not editable and a new division gets highest + 1.
- D-150: `divisions.write` covers add, edit, and now delete.
- D-151: refuse for a complete tournament or any registered bowler; director and admin may delete.
- D-152: sweeper bonus pins go with the division, no counted confirm.
- D-153: later divisions move down by one in the same transaction.
- D-154: Delete button on every row, Cancel and Delete dialog, `delete-info` read, toasts.
- D-155: one serializable transaction with retry, `204`, log line.
- D-156: bowlers move outside the new app for now.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| DIV-12 | No delete | Delete with two refusals | D-15, D-151 |
| DIV-01 | Number typed on add, never changes | A delete closes the gap | D-153 |

## API

All web only. The vendor detail route (`API-04`) only reads divisions, so a deleted division drops out of its array and nothing else changes (D-09).

| Route | Needs | Answers |
| --- | --- | --- |
| `DELETE /v1/tournaments/{id}/divisions/{divisionId}` | `divisions.write` | `204` no body |
| `GET /v1/tournaments/{id}/divisions/{divisionId}/delete-info` | `divisions.write` | `200 { deleteInfo: { registrationCount, sweeperCount } }` |

Errors, both routes:

- `400`: an id that is not a UUID.
- `401`: signed out. `403`: the API key, or a score keeper.
- `404`: `Tournament not found`, or `Division not found` (a division of another tournament counts as not found).
- `409` (delete only): `{ message, errors }`, nothing deleted, never overridden. `message` is the first reason. Keys: `tournament` for a complete tournament ("This tournament is complete and cannot be changed"), `division` for bowlers ("12 bowlers are registered in this division. Move them to another division first."; "1 bowler is registered…"). Both show when both apply.
- `503`: database down.

`sweeperCount` is the number of `SweeperDivision` rows for the division with bonus pins above 0 (NULL counts as 0, so a row with no pins is not counted).

**Delete transaction** (`prismaWriter.ts`, serializable, inside `withRetry` and `withDatabaseErrors`, as the create and edit):

1. Read the tournament (`completed`); `404` if missing.
2. Read the division with `findFirst({ id, tournamentId })`; `404` if missing.
3. Count its registrations.
4. `planDelete` (new, pure) turns `completed` and the count into the refusals, or `delete`.
5. `division.delete` (the `SweeperDivision` rows cascade), then `division.updateMany({ tournamentId, number > removed }, number decrement 1)`.

A registration saved between step 3 and the delete is caught by the serializable isolation (and by the `Registrations` foreign key, which has no cascade). A lost race is retried, then answers `409`.

The log line "Division deleted" holds `actorId`, `tournamentId`, `divisionId`, and `number`. A refusal logs "Division delete refused" with `actorId`, ids, and the count of reasons. No names.

**Code.** New files in `api/src/features/divisions/`: `deletePlan.ts`, `deleteRoutes.ts` (`createDivisionDeleteRouter`, mounted beside the update router in `app.ts` under the same `divisions.write` access). `writer.ts` gains `remove` and `getDeleteInfo` (and the in-memory version for route tests). `editFacts.ts` is not reused: delete needs the sweeper count, not `hasScores`.

## Web

Mockups: [index](deleteDivision-mockups/index.html), [list](deleteDivision-mockups/list.html), [dialog](deleteDivision-mockups/dialog.html).

- **Divisions page.** The actions cell holds Edit and a new Delete button (`aria-label="Delete {name}"`, a secondary-style button since a link goes to another page and a button changes data). Both hide on a complete tournament. On a phone each row is a card and the two actions sit in one row.
- **`DeleteDivisionDialog`** (in `src/features/divisions/`, using `src/shared/Dialog.module.css` and `dialogParts`): title "Delete this division?", text "{name} will be deleted. {n sweepers} lose their bonus pins for it. This cannot be undone." (the sweeper sentence is left out for 0, and says "1 sweeper loses…"; it ends "Divisions after it move up one number. This cannot be undone."). When `registrationCount` is above 0 the text is replaced by the refusal ("12 bowlers are registered in {name}. Move them to another division first.", "1 bowler is…") in the danger block, and the only button is Close. Cancel has focus first. The red Delete button says "Deleting…" and is disabled while it runs. While the info loads the text is "{name} will be deleted. This cannot be undone." and Delete waits. If the info read fails the dialog shows the generic text plus "Any sweeper bonus pins for it go too." and Delete still works: the API refuses safely.
- **States.** Info loading; info failed; sweeper count 0; sweeper count above 0; deleting; blocked by registered bowlers (the dialog shows the refusal and only Close, D-154).
- **After the call.** Success: close the dialog, return to the same list with `state: { deleted: true }`, and show the "Division deleted" success toast that closes itself (same path as "Division saved"). A `409` refusal (a bowler registered after the dialog opened, or a stale page on a complete tournament): close the dialog and show an error toast with the API's message; it stays until dismissed. Any other failure: the same error toast.
- **Hooks and api.** `api.ts`: `deleteDivision` (throws `DivisionDeleteRefusedError` with the message for a `409`), `fetchDivisionDeleteInfo`. `useDeleteDivision` (invalidates the tournament detail key, like `useUpdateDivision`). `useDivisionDeleteInfo` (fresh on every open, like `useDivisionEditInfo`). `types.ts` gains `DivisionDeleteInfo`; the API's `types.ts` carries the same fields.
- Mock handlers for MSW (`src/mocks/`): the two routes.
- No new permission, so `Can permission="divisions.write"` wraps the cell as it does now.

## Data

No schema change and no new type in storage. `Divisions.Number` is decremented for later rows; there is no key on it yet (D-38).

## Tests

| Rule | Test |
| --- | --- |
| DIV-12 delete, `204` and the row is gone | `api/src/features/divisions/deleteRoutes.test.ts` "deletes a division and answers 204"; `prismaWriterDelete.db.test.ts` "removes the row" |
| DIV-12 refused with bowlers (D-151) | `deletePlan.test.ts` (one, many, zero); `deleteRoutes.test.ts` "refuses a division with bowlers (409)"; `prismaWriterDelete.db.test.ts` "keeps the division and its registration" |
| DIV-12 refused on a complete tournament (D-143) | `deletePlan.test.ts`; `deleteRoutes.test.ts`; `prismaWriterDelete.db.test.ts` |
| Both refusals together | `deletePlan.test.ts` "lists both reasons"; `deleteRoutes.test.ts` |
| DIV-12 access: `401`, API key `403`, score keeper `403`, director `204` | `deleteRoutes.test.ts` (and `api/src/shared/auth/roles.test.ts` is unchanged) |
| DIV-03 ids: bad UUID `400`, unknown tournament `404`, division of another tournament `404` | `deleteRoutes.test.ts`; `prismaWriterDelete.db.test.ts` |
| DIV-01 gap closes (D-153) | `prismaWriterDelete.db.test.ts` "moves later numbers down by one", "leaves lower numbers and old odd rows alone", "does not touch another tournament"; `deleteRoutes.test.ts` in-memory |
| DIV-14 bonus pins removed (D-152) | `prismaWriterDelete.db.test.ts` "removes the sweeper rows" |
| DIV-15 still unique after a delete and the next add numbers highest + 1 | `prismaWriterDelete.db.test.ts` "next add after a delete" |
| Race: a registration lands during the delete | `prismaWriterDelete.db.test.ts` (as the tournament delete does) |
| `delete-info` counts; `0` and above; pins of `NULL` not counted | `deleteRoutes.test.ts`; `prismaDeleteInfo.db.test.ts` |
| Log line has ids and `number`, no name | `deleteRoutes.test.ts` |
| Web: Delete button shows for a director, hides for a score keeper, signed out, and a complete tournament | `DivisionsPage.test.tsx` |
| Web: dialog text with sweepers, with one, with none, while loading, when the info fails | `DeleteDivisionDialog.test.tsx` |
| Web: dialog shows the refusal and only Close when bowlers are registered (one, many) (D-154) | `DeleteDivisionDialog.test.tsx` |
| Web: Cancel does nothing; Delete sends the call, shows "Deleting…", closes, shows the toast | `DeleteDivision.test.tsx` (page level), `useDeleteDivision.test.tsx` |
| Web: a `409` shows the message in a toast that stays | `DeleteDivision.test.tsx` |
| Web: `api.ts` maps `204`, `409`, `404`, `403`, bad body | `api.test.ts` |
| E2E journey: delete a division, see it gone and the numbers close | `web/e2e/deleteDivision.spec.ts`; the dialog opened in `web/e2e/accessibility.spec.ts` |

Run `npm run test:mutation` for `deletePlan.ts` and the new web logic and fix survivors.

## Steps

1. API: `deletePlan.ts` with tests (pure rules, both refusals, plural wording).
2. API: `writer.ts` types, in-memory `remove` and `getDeleteInfo`; `deleteRoutes.ts` and tests; mount in `app.ts`. Green.
3. API: Prisma `remove` and `getDeleteInfo` with the `.db.test.ts` cases (needs Docker). Green.
4. Web: `types.ts`, `api.ts`, `useDeleteDivision`, `useDivisionDeleteInfo`, MSW handlers, with tests. Green.
5. Web: `DeleteDivisionDialog` and the Delete button in the row, plus page tests. Green.
6. Web: the toast after delete, the error toast, and the e2e and axe tests.
7. Run lint, typecheck, test, `format:check` in `api/` and `web/`; run e2e; run mutation tests.
8. Record (Phase 5): requirements, migration statuses, plan removed.

## Not doing

- A screen to move a bowler to another division (Q-37, D-156).
- Editing the number, or move up and down (D-146, D-153).
- A counted confirm for the sweeper pins (D-152).
- A delete for squads or sweepers (later, own discussion; D-15).
- A database key on `(TournamentId, Number)` (1.0.0, D-38).
- Delete from the edit page: the button lives on the row only (D-154).
