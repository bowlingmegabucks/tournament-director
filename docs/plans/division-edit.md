# Plan: division edit

Branch: `editDivision`. Delete this file when the work is done.

Second part of 0.6.0 (create was the first, D-145). Delete and renumbering come next (Q-36).

## Scope

| Rule                  | Bucket          | Note                                                                                      |
| --------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| DIV-12 (edit)         | In              | `PATCH` route, edit-info route, edit page, Edit link, `divisions.write`                   |
| DIV-02                | In              | Name check on every name sent; unique ignoring case, the division itself excluded         |
| DIV-04 to DIV-11      | In              | Same checks and messages as add, on every field sent; pair rules run on the merged result |
| DIV-03                | In              | Unknown tournament or division 404; complete tournament 409                               |
| DIV-15                | In              | The unique-name half. Number cannot change (D-146), so the number half holds              |
| DIV-01                | In, by omission | The number is shown as text and cannot be sent (D-146)                                    |
| DIV-12 (delete), D-15 | Later           | Next slice, with renumbering (Q-36)                                                       |
| DIV-13                | Already done    | List order does not change                                                                |
| DIV-14                | Later           | Sweeper screens                                                                           |

## Decisions used

- D-12: edit is allowed; criteria edits after registration warn.
- D-09: web only, so the vendor sees no change.
- D-128, D-129: the three treatments, and the API decides warnings and refusals (`409` with `errors` or `warnings`, then `confirmWarnings: true`).
- D-130, D-143, D-149: a complete tournament refuses every edit.
- D-139, D-146: the number is never edited.
- D-140, D-141, D-142: name, limits, and the percent over 100 warning, as add.
- D-147: which field is free, warns, or refuses.
- D-148: "scores exist" counts scores of bowlers registered in this division.
- D-150: web only; this plan names the permission `divisions.write`.
- D-144: own page, `RequirePermission`, `<Can>` around links.

## Differs from legacy

| Rule   | Legacy       | New app                      | Decision    |
| ------ | ------------ | ---------------------------- | ----------- |
| DIV-12 | No edit      | Edit with locks and warnings | D-12, D-147 |
| DIV-02 | None         | Unique name on edit          | D-140       |
| DIV-01 | Typed number | Number locked                | D-146       |

## API

Both routes sit under `/v1/tournaments/:id/divisions`, need `divisions.write`, and are web only. The API key cannot reach them (D-96, D-150).

**Permission rename.** `divisions.create` becomes `divisions.write` in `permissions.ts` and everywhere it is used (add route, web `Can` and `RequirePermission`, mock data, role test, docs), and covers add and edit, as `tournaments.write` does (owner, 2026-11-06). Step 1 does the rename. The director holds it by rule (only three permissions are withheld, D-97); the admin holds every permission. Score keeper and the API key do not.

### `PATCH /v1/tournaments/{id}/divisions/{divisionId}`

Body: any of `name`, `gender`, `minimumAge`, `maximumAge`, `minimumAverage`, `maximumAverage`, `handicapPercentage`, `handicapBase`, `maximumHandicapPerGame`, plus optional `confirmWarnings: true`. A key left out stays as stored. A key sent as `""` or `null` clears the value (a name cannot be cleared). Every key sent gets the add check and message (D-141). An unknown key, `number` included, is `400` (D-146). A body that changes nothing answers `200` and writes nothing; a value equal to the stored one counts as unchanged and never warns.

The pair rules (`DIV-05`, `DIV-07`, `DIV-09`, `DIV-11`) run on the merged result (stored value for a field not sent), and only when a field of the pair is sent. A stored odd pair that the director does not touch never blocks a name fix, as in `TRN-24`.

`planEdit(state, changes, confirmWarnings)` decides, in this order:

1. Complete tournament: refused, `errors.tournament` "This tournament is complete and cannot be changed" (D-149).
2. Merged pair rules fail: `400` with `errors`.
3. Name already used by another division: refused, `errors.name` (D-140).
4. Warnings, one per changed field, joined when a field has two reasons (D-147):
   - `gender`, ages, averages, with registered bowlers: "N bowlers are registered in this division. The change is not retroactive; review them by hand."
   - `handicapPercentage`, `handicapBase`, `maximumHandicapPerGame`, with scores in this division: "Scores are saved for bowlers in this division. Posted results change at once."
   - `handicapPercentage` going from set to not set, or the reverse, with registered bowlers: "N bowlers are registered. Handicap divisions need a USBC ID; review them by hand."
   - `handicapPercentage` changed to above 100: the D-142 text.
5. Otherwise save the changed columns (empty change set: nothing written).

Without `confirmWarnings`, a warning gives `409 { message: "Confirm these changes to save them.", warnings: [{ field, message }] }`. With it, the save goes ahead. Refusals and `400` come first and confirming never overrides them (D-129).

Success: `200 { division }` (every list field). Errors: `400` fields or ids not UUID, `401`, `403`, `404` "Tournament not found" or "Division not found" (a division of another tournament is also this 404), `409` as above, `503` database down.

Check, read, and write share one serializable transaction with retry, as add does (`withRetry`): the completed flag, the division, the other names, the registered bowlers, and the scores are all read inside it.

Log line "Division updated": `actorId`, `tournamentId`, `divisionId`, `fields` (the names changed, never the values). No line when nothing changed.

### `GET /v1/tournaments/{id}/divisions/{divisionId}/edit-info`

`200 { editInfo: { registrationCount, hasScores } }`. `400` not UUID, `401`, `403`, `404`, `503`. The form uses it for its "Asks you to confirm" lines. The PATCH works the numbers out again on every save, so the form's copy is a courtesy (D-131 pattern).

- `registrationCount`: registrations with this `DivisionId`.
- `hasScores`: any `SquadScores` row for a bowler registered in this division, in a squad or sweeper of this tournament. Two queries (the table has no relations): the division's bowler ids, then `findFirst` on `bowlerId in … and squadId in (this tournament's sessions)`.

## Web

Mockups: [index.html](division-edit-mockups/index.html) links `list.html` (Edit links, toast, complete tournament) and `edit-form.html` (every state).

- **Route** `/tournaments/:id/divisions/:divisionId/edit`, inside the tournament layout, behind `RequirePermission divisions.write`. A signed-out visitor goes to sign in; a user without the permission sees "No access".
- **Divisions page.** An "Edit" link per row (table cell; a card on a phone), shown inside `<Can permission="divisions.write">` and hidden when the tournament is complete. Its name is "Edit {division name}". A "Division saved" toast shows after a save (router state `saved`), closing itself, like "Division created".
- **`EditDivisionPage`.** Finds the division in the list query (no single-division route), reads settings and edit-info with `refetchOnMount: 'always'`, and shows the form only from data fetched after the page opened (the `EditTournamentPage` rule). States: loading; error with Try again; "Division not found" with a link back; complete tournament shows "This tournament is complete" and "Back to divisions" in place of the form; the form.
- **`DivisionForm`** gains edit mode, with no change to what add does: props `initialValues`, `submitLabel`, `confirms` (per-field "Asks you to confirm:" notes, same markup as `TournamentForm`), `checkChangedOnly`, and `number` shown as the real number with the hint "The number cannot change." In edit mode only a field the director changed is checked and sent. The confirm dialog is the shared `ConfirmChangesDialog`, titled "Save these changes?", each warning with a change line from a new `describeChange.ts` ("Handicap percent: 90 → 85", "Minimum age: not set → 18").
- **Hooks.** `useDivisionEditInfo(tournamentId, divisionId)`, `useUpdateDivision(tournamentId, divisionId)` (on success invalidates the divisions list and the tournament detail, which carries the vendor-shape `divisions`).
- **Notes in the form** (`editNotes.ts`, the API wording): registered bowlers give a confirm note on gender, both ages, both averages; scores give one on the three handicap boxes; registered bowlers give one on the percent for set/clear. Hints about unchanged data: none.
- **Mocks.** MSW handlers for the PATCH and edit-info routes; a factory for edit-info.

## Data

No schema change (D-30, WinForms owns the schema). The writer's `update` changes only the columns sent; the percent is stored as a fraction string, as add does. Types: `UpdateDivision = Partial<NewDivision>`; `EditInfo = { registrationCount, hasScores }` in the API and web `types.ts`, kept the same.

## Tests

| Rule                      | Test                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DIV-12 (edit), permission | `api/.../updateRoutes.test.ts`: 200 returns the division; 401 signed out; 403 for API key and score keeper; 400 for `number`, unknown key, non-UUID; 404 for unknown tournament and for a division of another tournament; `api/src/shared/auth/roles.test.ts`: director and admin hold `divisions.write`                                                                                          |
| DIV-02                    | `updateRequest.test.ts` (blank, 101 chars, trimmed); `editPlan.test.ts` and `prismaWriterUpdate.db.test.ts` (another division's name refused ignoring case; its own name kept)                                                                                                                                                                                                                    |
| DIV-04 to DIV-11          | `updateRequest.test.ts`: every limit and message; `editPlan.test.ts`: pair rules on the merged result, and not run when no field of the pair is sent                                                                                                                                                                                                                                              |
| DIV-03                    | `editPlan.test.ts` and `updateRoutes.test.ts`: complete tournament refused first; `prismaWriterUpdate.db.test.ts`: the flag is read in the transaction                                                                                                                                                                                                                                            |
| DIV-15                    | `prismaWriterUpdate.db.test.ts`: two edits at once cannot take one name                                                                                                                                                                                                                                                                                                                           |
| D-147                     | `editPlan.test.ts`: each warning, none when unchanged, joined messages on the percent, no warning with no registrations or scores; `updateRoutes.test.ts`: 409 with `warnings`, then 200 with `confirmWarnings`                                                                                                                                                                                   |
| D-148                     | `prismaEditFacts.db.test.ts`: a score in another division, or another tournament, does not count; a score in this division does                                                                                                                                                                                                                                                                   |
| edit-info                 | `editInfoRoutes.test.ts`, `prismaEditFacts.db.test.ts`                                                                                                                                                                                                                                                                                                                                            |
| Web                       | `EditDivisionPage.test.tsx` (states, notes, warnings dialog, saved toast, only changed fields sent), `DivisionForm.test.tsx` (edit mode), `DivisionsPage.test.tsx` (Edit link by permission, hidden when complete, toast), `describeChange.test.ts`, `editNotes.test.ts`, `api.test.ts`, `useUpdateDivision.test.tsx`; `web/e2e/editDivision.spec.ts` and the new path in `accessibility.spec.ts` |

Rule IDs go in test names. Mutation tests for `editPlan.ts` and `updateRequest.ts`.

## Steps

1. Rename `divisions.create` to `divisions.write` everywhere; role test updated.
2. `updateRequest.ts` (optional fields, merged pair rules) with tests.
3. `editFacts.ts`, `editPlan.ts` with tests.
4. Writer: `update` on the interface, `applyUpdate`, in-memory writer, Prisma writer with `.db` tests, and `loadEditFacts`.
5. `getEditInfo` on the repository, `editInfoRoutes.ts`, `updateRoutes.ts`, mount both in `app.ts` with `divisions.write`; route tests.
6. Web types, `api.ts` calls, hooks, `describeChange.ts`, `editNotes.ts`, MSW handlers and tests.
7. `DivisionForm` edit mode; `EditDivisionPage`; route; Edit link and toast on `DivisionsPage`.
8. e2e and accessibility spec; run `npm run check`, mutation tests for the new logic.

Each step ends with lint, typecheck, and tests green.

## Not doing

- Delete and renumbering (Q-36).
- Editing the number (D-146).
- Listing the bowlers who no longer fit (D-147): the warning gives a count only.
- Changing registrations when limits change: the director reviews by hand (D-12).
- Any vendor route (D-09).
- A single-division GET route: the page reads the list.
- A version bump: 0.6.0 is already in place.
