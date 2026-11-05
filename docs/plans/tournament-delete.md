# Plan: tournament delete

Branch: `deleteTournament`. Delete this file and `tournament-delete-mockups/` when the work is done.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| TRN-10 (delete) | In | Split into the new rules `TRN-32` to `TRN-37` below |
| TRN-10 (complete) | Later | Built with Complete squad and Complete sweeper (D-130) |
| REG-19 | Already done | Unchanged; Q-35 revisits it with the registration desk work |
| DIV-12, SQD-14 | Later | Delete one division, squad, or sweeper |
| TRN-15 | Already done | The 400 and 404 answers are reused |
| TRN-24 to TRN-31 | Already done | The two-step `409` flow and the dialog pattern are reused |

New rule IDs for the requirements file:

| ID | What |
| --- | --- |
| TRN-32 | Route, access, permission, success, log line |
| TRN-33 | Refusals: complete, scores, a real payment |
| TRN-34 | Warning for registrations, `confirmWarnings` |
| TRN-35 | One serializable transaction; the delete order; bowlers stay |
| TRN-36 | Web: the typed-name dialog and its states |
| TRN-37 | Web: the Delete button on the overview and the toast on the list |

## Decisions used

- D-132: web-only `DELETE`, admin-only `tournaments.delete`, the key cannot reach it.
- D-133: refuse on complete, any score, or a real payment (code not `Manual_`, amount above 0).
- D-134: registrations warn, with counts; `?confirmWarnings=true`.
- D-135: one serializable transaction; delete squad entries, registrations, then the tournament.
- D-136: typed-name dialog; toasts; return to the list.
- D-106: the "real payment" test, reused.
- D-129: the `409` shapes (`errors`, `warnings`), reused.
- D-130: a complete tournament is frozen.
- D-96, D-97, D-19, D-102: permissions not roles; hide, do not disable.
- D-09: no vendor route changes. Q-17, Q-35: desk cash is not recorded; `REG-19` left alone.

## Differs from legacy

Legacy cannot delete a tournament, so everything is new.

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| TRN-10 | No delete | Admin-only delete with refusals, a warning, and a typed-name confirm | D-132 to D-136 |

## API

All web-only (D-09): the legacy API has no such route, and it is left out of the OpenAPI document.

| Route | Access | Answers |
| --- | --- | --- |
| `DELETE /v1/tournaments/{id}` | `tournaments.delete` (signed out 401; the key, a score keeper, a director 403) | See below |

Query: `confirmWarnings=true` (anything else for that key is a `400`). A `DELETE` takes no body.

**Order of checks** (inside one serializable transaction, with the same write-conflict retry as create and edit):

1. `400` for an id that is not a UUID. `404 { message: "Tournament not found" }` for an unknown one.
2. Refusals, all reported together: `409 { message, errors: { tournament: message } }`, nothing deleted, never overridden by `confirmWarnings`.
   - Complete: "This tournament is complete and cannot be deleted."
   - Any score in any squad or sweeper: "Scores are saved, so this tournament cannot be deleted."
   - A real payment: "3 bowlers paid online. Remove their registrations first." (one count per registration with at least one real payment; singular for one)
   - With more than one, `message` is the first and `errors.tournament` joins them with a newline.
3. Warning, unless `confirmWarnings=true`, when the tournament holds registrations: `409 { message, warnings: [{ field: "tournament", message }] }`. The message counts what goes, leaving out zero parts: "12 registrations, 4 divisions, 3 squads, and 1 sweeper will be deleted, with their lane assignments and payment records. The bowlers stay."
4. Delete in this order: `SquadRegistration` rows of the tournament's registrations, the `Registration` rows (their `Payments` cascade), then the `Tournament` row (its `Divisions` and `Squads` cascade). `204`, no body.

The log line `Tournament deleted` holds `actorId`, `tournamentId`, and the counts, never names.

**Where the logic lives.** A pure `planDelete(facts, confirm)` in `deletePlan.ts` returns `refused`, `warn`, or `delete`, like `planEdit`. A `DeleteFacts` type holds `completed`, `hasScores`, `paidRegistrations`, `registrations`, `divisions`, `squads`, `sweepers`. `prismaDeleteFacts.ts` loads them. The writer gains `remove(id, { confirmWarnings })` with outcomes `notFound`, `refused`, `warnings`, `deleted`; the in-memory writer gets the same for route tests.

**Real payment query.** Payments whose registration's division belongs to the tournament, with `amount > 0` and a `confirmationCode` that does not start with `Manual_`; count distinct registrations. Scores come through the tournament's squads and sweepers, as `loadEditFacts` does.

**Locking.** Edit reads its counts before its transaction so a score keeper is not stalled (`prismaWriter.ts`). Delete reads inside the transaction on purpose (D-135): a score or payment saved after the read must not slip through. Deletes are rare, so a short lock is fine. If a `.db.test.ts` shows trouble, we say so and agree a change.

## Web

Mockups: [tournament-delete-mockups/index.html](tournament-delete-mockups/index.html) (`overview.html`, `edit-page.html`, `delete-dialog.html`).

- **Overview and edit page**: a "Delete tournament" button in the danger color, inside `<Can permission="tournaments.delete">`, shown once the settings are known and the tournament is not complete (as Edit). On the edit page it sits after Save and Cancel, apart from them. Both open the same dialog (one shared component).
- **`DeleteTournamentDialog.tsx`**: native `<dialog>` with `showModal()`, the shared dialog styles, Cancel first. A labeled name box; Delete is disabled until the typed name matches (trimmed, any case). States: name not typed, typed, warning step (counts replace the text, button says "Delete anyway", name stays), deleting (both buttons disabled, "Deleting…"), and a failure line inside the dialog for any error other than 409 or 404.
- **Refusal (`409` with `errors`)**: close the dialog; an error `Toast` that stays, one line per reason.
- **Gone (`404`)**: go to the list with an info toast, "That tournament was already deleted."
- **Success (`204`)**: go to `/tournaments` with state `{ deleted: true }`; the list page shows a "Tournament deleted" toast that closes itself (like `justCreated`). Then drop the cached reads for that id and refresh the list. Navigate first: the tournament layout would otherwise refetch the deleted id and show "not found" for a moment.
- **Permission**: the Delete button needs `tournaments.delete`; the web `Permission` type and the mock `/v1/me` lists gain it. No new route, so no guard. A director on the edit page (who holds `tournaments.write`) sees no Delete button.
- `api.ts`: `deleteTournament(id, { confirmWarnings })`, reusing `TournamentWarningsError`, `TournamentRejectedError`, `TournamentNotFoundError`. `useDeleteTournament` holds the mutation.

## Data

No schema change. The API reads `Payments`, `SquadRegistration`, `Registrations`, `Divisions`, `Squads`, and writes deletes to them and to `Tournaments`. Check that the Prisma models carry the relations the filters need (`Payment.registration`, `Registration.division`); add none that a shipped feature does not need (D-30).

## Tests

| Rule | Test |
| --- | --- |
| TRN-32 | `deleteRoutes.test.ts`: 401 signed out, 403 for the key, a score keeper, and a director; 204 for an admin; 404; 400 bad id; 400 for a bad `confirmWarnings`; log line with actor and counts. `roles.test.ts` and `permissions.test.ts`: admin has it, director does not. `app.test.ts`: the access label is mounted for `DELETE` only |
| TRN-33 | `deletePlan.test.ts`: each refusal alone and together; `Manual_` $0 is not a payment; a code not `Manual_` with amount 0 is not; a real payment is; singular and plural wording; refusal beats `confirmWarnings`. `prismaWriterDelete.db.test.ts`: the same against MariaDB |
| TRN-34 | `deletePlan.test.ts`: warning only with registrations; zero parts left out; `confirmWarnings` deletes. `deleteRoutes.test.ts`: the `409` body shape |
| TRN-35 | `prismaWriterDelete.db.test.ts`: registrations, squad entries, payments, divisions, squads, and sweepers go; bowlers and other tournaments stay; a score or payment added between read and delete is refused (race); the in-memory and Prisma writers agree |
| TRN-36 | `DeleteTournamentDialog.test.tsx`: Delete disabled until the name matches (trim, case); Cancel focus first; Escape closes; sends the request; warning step shows counts and sends `confirmWarnings`; refusal closes and toasts each reason; 404 goes to the list; failure line; deleting state |
| TRN-37 | `TournamentOverview.test.tsx` and `EditTournamentPage.test.tsx`: the button for an admin, not for a director, not when complete. `TournamentsPage.test.tsx`: the deleted toast and the already-deleted toast. `web/e2e/deleteTournament.spec.ts`: sign in as admin, delete with a typed name, land on the list. `accessibility.spec.ts`: the open dialog, both steps |
| Mocks | MSW `DELETE` handler and factories so `dev:mocks` and e2e work |

Run Stryker on `deletePlan.ts` and the dialog's name match; fix survivors.

## Steps

1. API: add `tournaments.delete` to `permissions.ts`; withhold it from the director in `roles.ts`; update the tests that list permissions.
2. API: `DeleteFacts`, `planDelete`, and tests (TRN-33, TRN-34).
3. API: `prismaDeleteFacts.ts` and the Prisma writer `remove`, the in-memory `remove`, `.db.test.ts` cases (TRN-35).
4. API: `deleteRoutes.ts`, the access label in `app.ts` (`DELETE` only), the log line, route tests (TRN-32).
5. Web: `Permission` type, `api.ts`, `useDeleteTournament`, MSW handler, with tests.
6. Web: `DeleteTournamentDialog` and its tests (TRN-36).
7. Web: overview button, list toast, e2e, axe (TRN-37).
8. `npm run check`; Stryker on the new logic; fix survivors.

Each step ends green (lint, typecheck, tests, format check).

## Not doing

- An admin override for a real payment. The way out is to delete the paid registrations first (D-133).
- A change to `REG-19` (Q-35).
- Complete tournament (D-130).
- Delete for divisions, squads, or sweepers on their own.
- A soft delete or undo. Delete is permanent (D-136).
- A vendor delete route (D-09).
