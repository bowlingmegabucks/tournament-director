# Plan: edit squad and sweeper

Branch: `editSquad`. Delete this file when the work is done.

Legacy cannot edit a squad or sweeper (`SQD-14`), so nothing ports. The model is edit tournament (`TRN-24` to `TRN-31`) and edit division (`DIV-12`). One rule set serves both kinds (D-180). Delete and Complete stay later.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| SQD-14 (edit part) | In | Umbrella; the new rules below split it |
| SQD-14 (delete part) | Later | D-15, next slice |
| SQD-01 to SQD-08, SQD-10 to SQD-13 | In (reused) | Every field sent gets the add check and message |
| SQD-07, SQD-17, SQD-18 | In (edit side) | A complete session or tournament refuses; no reopen |
| SQD-03 | In (reused) | Date stays inside the tournament, now a `409` on edit |
| LAN-01 to LAN-03 | In (as a constraint) | Stranding check (D-182) |
| SQD-15, SQD-16 | Later | Built with Complete tournament (D-130) |
| Q-11 | Later | Typed pins only |
| SQD-23 to SQD-30 | New | The edit rules below, written to `docs/requirements/` in Phase 5 |

New rules this run adds:

| ID | What |
| --- | --- |
| SQD-23 | `PATCH` route for a squad and for a sweeper: access, strict body, changed fields only, no-change answer, log |
| SQD-24 | Refusals: complete session or tournament, date outside the tournament, sweeper games once scores exist, a change that strands a bowler |
| SQD-25 | Warnings and `confirmWarnings`: date and fee with entries, lanes with assignments, ratios and pins with scores |
| SQD-26 | `edit-info` read for a squad and a sweeper |
| SQD-27 | The edit page: filled form, locked and confirm notes, changed-only send, errors, toast |
| SQD-28 | The confirm dialog, in the shared `ConfirmChangesDialog` |
| SQD-29 | Sweeper bonus pins on edit: left out means unchanged, blank or 0 deletes the row, a gone division is `409`, one transaction |
| SQD-30 | The "Edit" link on each card, hidden for a complete session or tournament |

## Decisions used

- D-180: the field table (free, warn, refuse) and "facts belong to this session only".
- D-181: complete session or tournament refuses; `complete` is not an input.
- D-182: "strands a bowler" means a saved lane falls outside the new range, or a pair holds more bowlers than the new max per pair.
- D-183: a squad clears an override with blank; a sweeper's fee, games, and cash ratio stay required.
- D-184: changed fields only, strict body, bonus pins left out are unchanged, one serializable transaction with retry, log holds field names.
- D-185: `edit-info` read, edit pages, Edit link, toast.
- D-12, D-128, D-129, D-131: the model (three treatments, `409` with `errors` or `warnings`, `confirmWarnings`, a courtesy read for the form).
- D-168, D-169, D-170, D-175, D-176, D-179: the limits every sent field is checked against.
- D-10, D-130, D-143, D-171: the freeze on a complete tournament and session.
- D-61: stored letters show as stored, so the seat letter is not rechecked.
- D-172: the toast and return to the list.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| SQD-14 | No edit | Edit with locks and confirms | D-12, D-180 |
| SQD-17 | The server does not lock a complete session | An edit of a complete session is refused | D-10, D-181 |
| SQD-18 | No undo for complete | An edit cannot reopen | D-181 |
| LAN-02, LAN-03 | Lanes and per pair fixed at add | Changed only if no bowler is stranded | D-182 |

## API

Both routes are web only. The vendor sees no change (D-09): the legacy API has no edit route, and the vendor `squads` and `sweepers` arrays on the tournament detail show edited values on their own.

| Route | Answer | Errors |
| --- | --- | --- |
| `PATCH /v1/tournaments/{id}/squads/{sessionId}` | `200 { squad }` in the list shape | `400 { message, errors }` bad id, field, or unknown key; `401`; `403`; `404` unknown tournament, or the id is not a squad of this tournament; `409 { message, errors }` refused; `409 { message, warnings }` confirm; `503` |
| `PATCH /v1/tournaments/{id}/sweepers/{sessionId}` | `200 { sweeper }` in the list shape | The same, with the sweeper's own fields |
| `GET /v1/tournaments/{id}/squads/{sessionId}/edit-info` | `200 { editInfo }` | `400`, `401`, `403`, `404`, `503` |
| `GET /v1/tournaments/{id}/sweepers/{sessionId}/edit-info` | `200 { editInfo }` | The same |

Both need `squads.write` (director and admin). Signed out gets `401`; the API key and a score keeper get `403`.

### PATCH body

Only the fields to change, plus optional `confirmWarnings`. The body is strict.

| Kind | Allowed keys |
| --- | --- |
| Squad | `date`, `startingLane`, `numberOfLanes`, `maxPerPair`, `entryFee`, `finalsRatio`, `cashRatio` (blank, `""`, or `null` clears an override, D-183) |
| Sweeper | `date`, `startingLane`, `numberOfLanes`, `maxPerPair`, `entryFee`, `games`, `cashRatio`, `bonusPins` (division id to blank or 0 to 99; left-out ids unchanged) |

Every key sent gets the add check and message (the `sessionFields` in `shared/sessionCreate.ts`, the per-kind money fields, and the lane block check from D-179 using the stored value for a lane field not sent). A field not sent is not rechecked, so a stored legacy value that breaks a limit does not block an edit of something else (D-17). `complete`, and a key of the other kind (`games` on a squad, `finalsRatio` on a sweeper), is `400`.

### Order of checks

1. Parse the body (`400`).
2. Read the facts inside one serializable transaction with retry (D-184).
3. Complete tournament, then complete session: `409 errors.tournament` or `errors.session` (D-181).
4. Date outside the tournament: `409 errors.date` (`SQD-03`).
5. Locks: sweeper `games` with scores; lanes or max per pair that strand a bowler (D-182). All refusals are reported together.
6. Warnings: unless `confirmWarnings: true`, `409 { message, warnings: [{ field, message }] }` in form order. A field whose value does not really change never warns or refuses.
7. Write the changed columns, and for a sweeper the pin rows, in the same transaction. Answer `200` with the session as the list reads it.

A body that changes nothing answers `200` and writes nothing. Last save wins.

### Refusals and warnings (the wording lives here)

| Field | Treatment | Message |
| --- | --- | --- |
| any | Complete tournament | "This tournament is complete and cannot be changed" (`errors.tournament`) |
| any | Complete session | "This squad is complete and cannot be changed" ("sweeper" for a sweeper) (`errors.session`) |
| `date` | Refused outside the tournament | "Squad date must be after tournament start" / "...before tournament end" (the add words, "Sweeper" for a sweeper) |
| `date` | Warns with entries | "12 bowlers are entered. They planned around this time. Tell them." |
| `startingLane`, `numberOfLanes` | Refused when a saved lane is outside the new range | "Lane 15 has a bowler assigned. Move them first." On `startingLane` for a lane below the new start, on `numberOfLanes` for a lane above the new end |
| `maxPerPair` | Refused when a pair holds more bowlers than the new max | "Pair 15-16 holds 4 bowlers. Move them first." |
| lanes, `maxPerPair` | Warns with assignments that still fit | "12 bowlers have lane assignments. They keep their lanes, but recap sheets use the lanes and bowlers per pair, so check them." |
| `entryFee` | Warns with entries | "12 bowlers are entered. They keep what they paid. New entries pay the new fee." |
| `finalsRatio`, `cashRatio` | Warns with scores in this session | "Scores are saved. Posted results change at once." |
| `games` (sweeper) | Refused with scores | "Scores are saved, so the number of games cannot change." |
| `bonusPins.{divisionId}` | Warns with scores, for each pin that really changes | "Open: scores are saved. Posted results change at once." |
| `bonusPins.{divisionId}` | `409` for a division that is not the tournament's | "A division no longer exists. Reload the page" (`errors.bonusPins`, D-177) |

Counts are plural-aware ("1 bowler is entered").

### Facts (read in the transaction)

All facts count only this session (D-180).

| Fact | Read |
| --- | --- |
| entries | `SquadRegistration` rows for the session |
| assignments | those rows with a non-empty `LaneAssignment` that reads as `<lane><letter>`; a position that does not parse is ignored (it lists as "Other", D-61) |
| scores | any `SquadScores` row for the session |
| fullest pair | the most assigned bowlers in one pair, a pair being an odd lane and the next even lane |
| lowest and highest assigned lane | from the same rows |

A stored pair already over the new max, or a lane already outside the range, blocks only when the field that decides it is among the changes (D-17).

### edit-info

`{ editInfo: { entryCount, assignmentCount, hasScores, lowestAssignedLane, highestAssignedLane, fullestPair } }`. The last three are `null` when there are no assignments. It tells the page what to lock and which notes to show (D-185). The PATCH works the same numbers out again on every save.

## Web

Mockups (open `docs/plans/edit-squad-mockups/index.html`):

- `cards.html`: the Squads and Sweepers cards with the Edit link, including a complete session and a read-only visitor.
- `edit-squad.html`: the squad edit page: filled with notes, locked reason lines, validation errors, API refusals, a complete session, loading, error, the confirm dialog.
- `edit-sweeper.html`: the same for a sweeper, with games locked and the bonus-pin boxes.

Screens:

- **Edit link.** Each card on the Squads and Sweepers pages gets an "Edit" link beside the date link, shown only to a user with `squads.write`, hidden for a complete session or complete tournament (`SQD-30`).
- **Edit squad** `/tournaments/{id}/squads/{sessionId}/edit` and **Edit sweeper** `/tournaments/{id}/sweepers/{sessionId}/edit`. The add form filled with the stored values (the squad's own values, with a blank box and "Tournament: $50.00" when it does not override). `SquadForm` and `SweeperForm` gain three data props rather than booleans: `fieldNotes` (a "Locked: …" or "Asks you to confirm: …" line per field), `lockedFields` (read-only inputs), and `submitLabel`. Add keeps working unchanged.
- Only a field the director changed is checked and sent. A failed save shows a summary and moves focus to the first problem; refusals and `errors.date` show under their field; `errors.tournament` and `errors.session` show as a banner in place of the form on load and as an error toast after a save. Save says "Saving…" and is disabled while it runs. Any other failure is an error toast that stays until dismissed.
- A sweeper's bonus pins show one box per division, filled with the stored value (0 when none). Only a box the director changed is sent.
- **Confirm dialog.** The shared `ConfirmChangesDialog` titled "Save these changes?" lists each warning with the change behind it ("Entry fee: $50.00 → $60.00"; "Date: Sat Oct 24, 9:00 AM → Sat Oct 24, 1:00 PM"), as in `describeChange`. Go back has focus first; Save anyway resends with `confirmWarnings: true`.
- **Toast.** Success returns to the list with "Squad saved" or "Sweeper saved", closing itself.
- **States.** Loading (`Loading`) waits for the tournament settings, the list (to find the session), and `edit-info`. Error with Try again if any read fails. A session id that is not in the list shows "That squad was not found" with a link back. A complete tournament or session shows "This tournament is complete" or "This squad is complete" in place of the form, with a link back. Signed out goes to sign in; a user without `squads.write` sees "You do not have permission to view this page."
- **Hooks.** `useSquadEditInfo`, `useUpdateSquad`, and the sweeper twins. A save drops the cached squads (or sweepers) list, the tournament detail, and `edit-info`.
- **Router.** Two routes under the tournament layout, wrapped in `RequirePermission`.

## Data

No schema change. The squad write sets `Date`, `MaxPerPair`, `StartingLane`, `NumberOfLanes`, `SquadEntryFee`, `FinalsRatio`, `CashRatio` (NULL clears); the sweeper write sets the same columns plus `SweeperEntryFee`, `Games`, and `CashRatio`, and creates, updates, or deletes `SweeperDivision` rows. `Complete` is never written. The edit-info reads use `SquadRegistration` and `SquadScores`.

New and changed API files:

- `shared/sessionEdit.ts`: the checks both kinds share (complete tournament and session, date, strand check, entries and assignment warnings), with a `SessionEditFacts` type.
- `features/squads/updateRequest.ts`, `updatePlan.ts`, `updateRoutes.ts`, `editInfoRoutes.ts`; the `SquadWriter` gains `update`, and a new reader returns the facts. The Prisma writer and reader implement them.
- The same set in `features/sweepers/`, with `games` and bonus pins.
- `shared/sessionFacts.ts` (Prisma read of the facts, shared by both kinds).
- `mountRoutes`: the PATCH and `edit-info` routers behind `squads.write`.
- `types.ts` in web: edit-info and the field notes.

## Tests

| Rule | Proof |
| --- | --- |
| SQD-23 | `squads/updateRequest.test.ts` (changed fields only, strict body, a clear sets null, a wrong-kind key is 400); `updateRoutes.test.ts` (401, 403 for the key and a score keeper, 404 for an unknown tournament or a session of the other kind, 200 and no write for no change, the log has field names only); `prismaWriterUpdate.db.test.ts` (writes the columns, `Complete` untouched); the sweeper twins |
| SQD-24 | `shared/sessionEdit.test.ts` and `updatePlan.test.ts` in both features (complete tournament, complete session, date outside, strand by lane below and above, strand by pair count, a stored bad value not blocking another field, all refusals together, scores in another session do not lock); `sweepers/updatePlan.test.ts` (games refused with scores); `prismaWriterUpdate.db.test.ts` for the facts |
| SQD-25 | `updatePlan.test.ts` (each warning only when the value changes, form order, `confirmWarnings` saves, a refusal wins over a confirm); `updateRoutes.test.ts` (`409` with `warnings`, the same body with `confirmWarnings` saves); `prismaWriterUpdate.db.test.ts` (a score saved between read and write is seen) |
| SQD-26 | `editInfoRoutes.test.ts` (both kinds: access, 400, 404, shape); `prismaEditFacts.db.test.ts` |
| SQD-27 | `web/.../EditSquadPage.test.tsx`, `EditSweeperPage.test.tsx` (filled form, locked field read-only with its reason, confirm note, only changed fields sent, summary and focus, server errors under the field, toast, loading and error, complete, not found, no permission); `editNotes.test.ts` in both features; `web/e2e/editSquad.spec.ts`, `editSweeper.spec.ts` |
| SQD-28 | `EditSquadPage.test.tsx` (dialog text, Go back keeps typing, Save anyway resends); `describeChange.test.ts` (date and money lines) |
| SQD-29 | `sweepers/updateRequest.test.ts`, `updatePlan.test.ts`, `prismaWriterUpdate.db.test.ts` (left out unchanged, blank or 0 deletes, an unknown division is 409, a failed pin leaves the sweeper unchanged); `EditSweeperPage.test.tsx` |
| SQD-30 | `SquadsPage.test.tsx`, `SweepersPage.test.tsx` (the link by permission, hidden when complete) |
| SQD-18 | `updateRequest.test.ts` (`complete` is 400) and the complete-session cases above |

Also: `web/e2e/accessibility.spec.ts` gains both edit pages; `shared/auth/roles.test.ts` needs no change (`squads.write` exists). Mutation: `npm run test:mutation:fast` in `api/` and `web/` for the new files.

## Steps

Each step ends green (lint, typecheck, tests, `format:check`) in the folder it changes.

1. API shared: `sessionEdit.ts` with its tests (complete, date, strand check, warnings).
2. API squads: `updateRequest`, `updatePlan`, writer `update` (in memory and Prisma, one serializable transaction with retry), facts read, `updateRoutes`, `editInfoRoutes`, mount. Tests with each file; the `.db.test.ts` cases against MariaDB.
3. API sweepers: the same, with `games` and bonus pins.
4. Web shared: `field` notes and change lines for the two kinds, `describeChange` additions.
5. Web squads: types, `api.ts` calls, hooks, form props, `EditSquadPage`, route, Edit link on the card.
6. Web sweepers: the same.
7. e2e: `editSquad.spec.ts`, `editSweeper.spec.ts`, and the accessibility cases.
8. `npm run check`, `npm run test:e2e` in `web/`, mutation tests, fix survivors.

## Not doing

- Delete a squad or sweeper (D-15): next slice, with its own rules for entries, scores, and pins.
- Complete squad, complete sweeper, complete tournament (`SQD-15`, `SQD-16`, D-130).
- Moving bowlers to fix a stranded lane. The director moves them on the lane page first (the move command comes after lock-down).
- A version check. Last save wins, as for tournaments.
- An overlap check between squads (D-169).
- Bonus-pin presets (Q-11).
- Editing from the squad or sweeper page header. The card link is the only entry point for now.
