# Plan: delete squad and delete sweeper

Branch: `deleteSquad`. Delete this file when the work is done.

Squad and sweeper delete are one feature, built together on a shared core. Every route, screen, and test below exists for both kinds. The split is only the kind word in messages and the sweeper's bonus-pin rows.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| SQD-14 (delete part) | In | Delete a squad and delete a sweeper (D-15, D-186 to D-189). |
| SQD-17, D-10 | In | A complete session is a refusal reason. |
| SQD-18 | In | No undo for "complete", so a complete session stays for good. |
| D-130 | In | A complete tournament is a refusal reason. |
| DIV-14 / SQD-13 | In | A sweeper's `SweeperDivision` rows cascade (D-152 model). |
| REG-03, REG-06, REG-20, D-06, D-11 | In (shapes the refusal) | Entries block a delete, so none is removed as a side effect. |
| REG-19, REG-20 (the screens) | Later | Remove a bowler from a squad: edit registration (Q-37). |
| SQD-15, SQD-16 | Later | Complete squad and complete sweeper: next 0.7.0 part. |
| Q-11 | Later | Bonus-pin presets stay open. |

## Decisions used

- D-186: four refusals (complete tournament, complete session, entries, scores), none overridable, all reported together; the last session can go; entries are never removed.
- D-187: `squads.write` (director, admin) covers delete; web only; no API key.
- D-188: a Delete button per card beside Edit, hidden for a complete session or tournament; a Cancel and Delete dialog; a `delete-info` read; toasts.
- D-189: one serializable transaction with retry; refusals checked inside; `204`; the log line holds ids only.
- D-9: web-only, nothing vendor-visible. D-96: routes ask for a permission, never a role. D-130 and D-143: the complete tournament freeze. D-10: a complete session is locked. D-152: pin rows go with the sweeper with no extra confirm. D-155: the transaction pattern from division delete.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| SQD-14 | No delete | An empty, open session in an open tournament can be deleted | D-15, D-186 to D-189 |

## API

Both kinds, under `squads` and `sweepers`. All web only (D-09); the API key cannot reach them.

| Route | Answer | Errors |
| --- | --- | --- |
| `DELETE /v1/tournaments/{id}/squads/{sessionId}` and `/sweepers/{sessionId}` | `204` no body | `400` an id that is not a UUID; `401`; `403`; `404` unknown tournament, or a session of the other kind or another tournament ("Tournament not found", "Squad not found" / "Sweeper not found"); `409 { message, errors }` refused; `503` database down |
| `GET /v1/tournaments/{id}/squads/{sessionId}/delete-info` and the sweeper twin | `200 { deleteInfo: { entryCount, scoreCount } }` | `400`; `401`; `403`; `404`; `503` |

Refusal keys (`409`, nothing deleted, `message` is the first, tournament first), as `planSessionDelete`:

| Key | When | Message (squad; sweeper says "sweeper") |
| --- | --- | --- |
| `tournament` | tournament complete | "This tournament is complete and cannot be changed" (the shared `completeMessage`) |
| `session` | session complete | "This squad is complete and cannot be deleted." |
| `entries` | `entryCount > 0` | "12 bowlers are entered in this squad. Remove them from the squad first." / "1 bowler is entered in this squad. …" |
| `scores` | `scoreCount > 0` | "Scores are saved for this squad, so it cannot be deleted." |

Behavior:

- One `Serializable` transaction with `withRetry` (as D-155). Inside it: read the tournament (`completed`), find the row by id, tournament, and `squadType` (so a sweeper id on the squad route is `404`), count its `SquadRegistration` rows and `SquadScore` rows, plan, and delete the `Squad` row. Counts are read inside the transaction, unlike edit, so an entry saved in between is caught (the race is retried, then `409`).
- The row need not read as a valid squad. The list skips a bad row (D-42), so a stale page or a typed URL is the only way to reach it, and deleting it is a clean-up. Only `complete` is read from it.
- `SweeperDivision` rows go by the database cascade. No code deletes entries or scores, because a refusal already needs both counts at 0.
- The log line "Squad deleted" / "Sweeper deleted" holds `actorId`, `tournamentId`, and `squadId` / `sweeperId`. A refusal logs "Squad delete refused" with the ids and the number of reasons. Never the date.
- `delete-info` takes its numbers outside a transaction (it only informs; the `DELETE` decides).
- Mounting in `app.ts`: `DELETE` beside each `PATCH` mount (`squads.write`, `methods: ['DELETE']`), and `delete-info` on its own path, as `edit-info`, so the permission check cannot reach the public lanes, scores, and results reads.

## Web

Mockups (open `docs/plans/delete-squad-mockups/index.html`): `list.html` (cards, toasts) and `delete-dialog.html` (every dialog state, squad and sweeper).

- A Delete button in each card's header, beside Edit: outline style, `aria-label` "Delete squad Sat 10/24/2026 9:00 AM" (and "sweeper"). Shown inside `<Can permission="squads.write">` and hidden for a complete session or tournament, as Edit (D-185).
- The dialog is "Delete this squad?" / "Delete this sweeper?". Body: the date in bold, "will be deleted.", for a sweeper "Its bonus pins go too.", then "This cannot be undone." Cancel has focus first. Buttons: Cancel and "Delete squad" / "Delete sweeper".
- States, all in the mockups: ready; loading (Delete disabled, short text); refused by entries, by scores, or both (a bordered message in place of the text, only a Close button); counts could not be read (the ready text, Delete still works); deleting ("Deleting…", both buttons disabled); other failure (an alert inside the dialog).
- A delete closes the dialog, returns to the list with a "Squad deleted" / "Sweeper deleted" toast that closes itself. A `409` from the API (state changed after the dialog opened) closes the dialog and shows the reasons in an error toast that stays until dismissed. The list reloads either way. Empty list shows the existing "No squads yet." / "No sweepers yet."
- A reply that lands after the dialog closed is ignored (the `closes` counter, as `DeleteDivisionButton`).
- One shared implementation in `web/src/shared/`: `DeleteSessionButton.tsx` (button, dialog open state, toast), `DeleteSessionDialog.tsx`, `sessionDeleteApi.ts` (`deleteSession`, `fetchSessionDeleteInfo`, `SessionDeleteRefusedError`), `useSessionDeleteInfo.ts`, `useDeleteSession.ts`, each taking `kind: 'squad' | 'sweeper'`. Two features need it, so it belongs in `shared/`. `SquadsPage` and `SweepersPage` mount the button and read the `deleted` state for the toast.
- Reuses `Dialog.module.css`, `dialogParts`, `Toast`, and `QueryError`. No new tokens or colors.

## Data

No schema change. Storage is the legacy `Squads` table (the row), `SquadRegistration` and `SquadScores` (counts), `SweeperDivision` (cascade). Types: `SessionDeleteFacts` and `SessionDeleteInfo` in the API; `SessionDeleteInfo` in the web `types`. The API's and web's copies carry the same fields.

## Tests

| Rule | Proof |
| --- | --- |
| SQD-14 (delete), D-189 | `api/src/shared/sessionDelete.test.ts`: plan deletes when nothing depends; each refusal alone; all four together; first message is the tournament's; singular and plural; both kinds' wording. |
| SQD-14, D-187 | `api/src/features/squads/deleteRoutes.test.ts` and `sweepers/deleteRoutes.test.ts`: `204`; `401` signed out; `403` for the API key and a score keeper; `400` bad ids; `404` unknown tournament, unknown session, a session of the other kind, another tournament's session; `409` with `errors` for each refusal and the first message; the log lines hold ids and no date; `503`. |
| SQD-17, SQD-18, D-10 | The same route tests: a complete session answers `409` `errors.session`, and no PATCH body can reopen it (already covered by edit). |
| D-130 | The same: a complete tournament answers `409` `errors.tournament`, checked even with no entries. |
| REG-20, D-06, D-11 | `prismaWriterDelete.db.test.ts` (both features, Testcontainers): a squad with entries is refused and no `SquadRegistration` row changes; same with scores. |
| DIV-14 | `sweepers/prismaWriterDelete.db.test.ts`: the sweeper's `SweeperDivision` rows go and another sweeper's stay. |
| D-189 | `prismaWriterDelete.db.test.ts`: an entry saved between the check and the delete is caught (race, as the division test); an unreadable stored row can be deleted; the last session of a tournament can be deleted. |
| D-188 | `delete-info` route tests and `prismaWriterDelete.db.test.ts` for the counts: only this session's rows count. |
| D-188 (web) | `web/src/shared/DeleteSessionDialog.test.tsx` (each state in the mockups, squad and sweeper text), `DeleteSessionButton.test.tsx` (open, cancel, confirm, `409` toast, late reply ignored), `sessionDeleteApi.test.ts`, `useSessionDeleteInfo.test.tsx`, `useDeleteSession.test.tsx`; `SquadsPage.test.tsx` and `SweepersPage.test.tsx` (button shown to `squads.write`, hidden for a complete session, a complete tournament, and without the permission; toast text). |
| D-188 (e2e) | `web/e2e/deleteSquad.spec.ts` and `deleteSweeper.spec.ts` (mock server: delete an empty one; a session with entries or scores is refused in the dialog); `accessibility.spec.ts` opens the dialog and scans it. The mock server pretends the second demo squad has 12 entries and the first demo sweeper has scores (already used by edit). |

Cite the rule ID in each test name. `roles.test.ts` needs no change (no new permission).

## Steps

1. API core: `api/src/shared/sessionDelete.ts` (`SessionDeleteFacts`, `SessionDeleteInfo`, `planSessionDelete`, messages) with its test.
2. Squad writer: `remove` and `getDeleteInfo` on `SquadWriter`, `applyDelete`, the in-memory writer, `prismaWriter` with the transaction; `squads/deleteRoutes.ts`; unit and route tests; the `.db.test.ts`.
3. Sweeper writer: the same in `sweepers/` (plus the cascade test).
4. Mount both in `app.ts`; check `mountRoutes` and the access tests; lint, typecheck, test in `api/`.
5. Web shared: types, `sessionDeleteApi.ts`, the two hooks, `DeleteSessionDialog`, `DeleteSessionButton`, mock handlers in `web/src/mocks/handlers.ts` with their tests.
6. Mount the button on `SquadsPage` and `SweepersPage`, plus the toast; page tests.
7. e2e specs and the accessibility spec; lint, typecheck, test, `format:check`, and `test:e2e` in `web/`.
8. `npm run test:mutation:fast` in `api/` and `web/`; fix survivors.
9. Phase 5: requirements, migration status, proposed features, CLAUDE.md line, delete this plan.

Each step ends green. Commit after steps 3, 4, 6, and 7 with imperative messages that cite `SQD-14`.

## Not doing

- Removing a bowler from a squad or sweeper, or moving bowlers (`REG-20`, Q-37): edit registration.
- Deleting entries or scores with a session, or an override or "force" option (D-186).
- Complete squad and complete sweeper (`SQD-15`, `SQD-16`): the next part of 0.7.0.
- An undo or a soft delete. A delete is final, as division delete is.
- Entry counts on the cards, or a disabled Delete button up front (the list carries no counts, D-154).
- A vendor route, or any change to `API-04` (the vendor arrays shrink only because the row is gone).
