# Plan: create registration (desk)

Branch: `createRegistration`. Delete this file when the work is done.

The vendor routes (`POST /v1/registrations` and the rest) are built. This run adds the **desk**: a web page, a bowler search, and a web-only create route that works for a stored bowler or a new one.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| REG-01 | In | Desk: `409` with the existing registration, then an offer to append (D-159). Search marks registered bowlers. |
| REG-02, BWL-01 to BWL-10, BWL-07a | In | Shared checks run on the edited or new bowler. Vendor-only requirements (address, email, USBC ID) do not apply (D-162). |
| REG-03 to REG-06 | In | Shared checks. |
| REG-07, BWL-16a | In | Existing bowler is patched (D-05, D-158). |
| REG-08, PAY-01a | In | `Manual_<UUID>` $0 placeholder on every desk save (D-163). |
| REG-10 to REG-14 | In | Append on confirm (D-159). Division moves unless scores exist (D-160). |
| REG-15 (guard only) | In | The "scores block a division move" check, reused for append (D-160). The screen to change a division stays Later. |
| REG-22 | In | `?squad=` or `?sweeper=` pre-selects that session and locks it: checked, and it cannot be unchecked (D-164). |
| BWL-14 | In (part) | Last name and first name prefixes, email equals, USBC ID equals, and a Registered marker (D-157). |
| BWL-15 | In | Pick a stored bowler or enter a new one. |
| BWL-13 | Already done | Display name. |
| BWL-17 | In (unchanged) | No SSN read or written. No SSN field. |
| REG-15 screen, REG-16 to REG-19 screens, REG-25 | Later | Registrations edit (Q-37 lives there). |
| REG-20, REG-21 | Later | Lane work. |
| BWL-11, BWL-12, BWL-16 stand-alone, SSN verify | Later | Bowler edit and SSN (Q-22). |

## Decisions used

- D-01, D-107: eligibility failures are a `400` for the desk too.
- D-03: one registration per bowler per tournament, enforced in code. Q-26 (database constraint) stays open.
- D-04: at least one squad.
- D-05: patch, never overwrite.
- D-09: the vendor routes do not change.
- D-10, D-117: no division move after scores.
- D-108: squads and the division must belong to the tournament; no complete squads added.
- D-130: a complete tournament refuses changes.
- D-157 to D-164: the desk route, edits inside registration, append offer, division move, exact USBC ID only, names-only new bowler, placeholder payment, entry points.
- D-96: routes ask for permissions, not roles.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| REG-01 | Desk fails with an error | Error, then an offer to append | D-159 |
| REG-07, BWL-16 | Details edited on a separate screen | Edited in the same save, patch only | D-158, D-05 |
| REG-08 | Placeholder payment | Same | D-163 |
| BWL-14 | Name prefixes and email | Also USBC ID, and a Registered marker | D-157 |
| BWL-15 | Nothing stops two records for one person | An exact USBC ID match offers the stored bowler | D-161 |
| REG-12 | Moves the division | Same, but refused after scores and confirmed on screen | D-160, D-117 |

## API

All web-only. Vendor routes are untouched.

### `GET /v1/bowlers` (access `{ permission: 'bowlers.read' }`)

Query: `lastName`, `firstName` (starts with, case-insensitive), `email` (equals), `usbcId` (equals), `tournamentId` (optional, adds `registered`). At least one of the first four is required. Zod `400` otherwise.

`200 { bowlers: [{ id, name, firstName, lastName, usbcId, city, state, registered: { divisionName } | null }], more: boolean }`. Sorted by last name, first name, id. At most 25; `more` is true when there were more. Never returns the SSN or the date of birth.

### `GET /v1/bowlers/{id}?tournamentId=` (`bowlers.read`)

`200 { bowler: { id, firstName, middleInitial, lastName, suffix, street, city, state, zipCode, email, phone, usbcId, dateOfBirth, gender }, registration: { id, divisionId, divisionName, average, superSweeper, squadIds, sweeperIds, hasScores } | null }`. `404` for an unknown id. This is the contact data (hence `bowlers.read` for director and admin only).

### `POST /v1/tournaments/{id}/registrations` (`registrations.write`)

The path already carries `GET` (`registrations.read`). The group takes access per method (`methods`), as `registrations/vendorRoutes` does.

```json
{
  "divisionId": "uuid",
  "average": 182,
  "squadIds": ["uuid"],
  "sweeperIds": [],
  "superSweeper": false,
  "bowlerId": "uuid (stored bowler) or absent (new bowler)",
  "bowler": { "firstName": "", "lastName": "", "...": "..." },
  "appendToExisting": false
}
```

- With `bowlerId`, `bowler` is a patch: every field optional; an empty string or null changes nothing (D-05, D-158).
- Without it, `bowler` is a new bowler: first and last name required (D-162).
- `201 { registrationId, mode: 'created' | 'appended' }`.
- `400 { message, errors: [{ field, message }] }` per-field, for bowler rules, eligibility, squads, and ids (same shape as create division). The messages are the legacy ones.
- `409 { message, conflict: 'alreadyRegistered', existing: { registrationId, divisionId, divisionName, squadIds, sweeperIds } }` when the bowler is registered and `appendToExisting` is not true (D-159).
- `409 { message, conflict: 'usbcIdOnFile', bowler: { id, name } }` when a new bowler's USBC ID matches a stored bowler (D-161).
- `409 { message, errors }` for a complete tournament (D-130).
- `400` "Cannot change bowler division after scores have been recorded." when an append moves the division and the bowler has any score (D-160, REG-15).
- `404` for an unknown tournament.
- `503` database down, as everywhere.

The server adds the placeholder payment: code `Manual_<36-character UUID>`, amount 0 (PAY-01a). Both the registration site's `Manual` lookup and the unique code stay valid. (The code is 43 characters, the column limit.)

Logs: one `info` line per create with `registrationId`, `tournamentId`, `mode`, and `actorId`. No bowler name, email, address, or USBC ID in logs (`api-observability`). A metric `tournament_director.registrations.created` by `mode` and `source=desk`.

### Code

- `features/registrations/deskRegister.ts`: the desk path. It resolves the bowler (by id, or new), then runs the same checks and `writer.save` as `register.ts`. To avoid two copies, extract the shared checks and the save step from `register()` into `registrationChecks.ts` first (a refactor with no behavior change, proved by the existing tests).
- `writer.ts`: add `findBowlerById(id)`. `findRegistration` and `findScoredSessionIds` already exist.
- `features/bowlers/`: new feature folder: `routes.ts` (search and detail), `repository.ts`, `types.ts`, `prismaRepository.ts`. The Prisma client already omits the SSN from every read; the new queries select named fields only.
- `permissions.ts`: add `bowlers.read`. The director gets it by rule; the scoreKeeper does not.
- `app.ts` and `docs/api-standards.md`, `docs/requirements/api-access.md`: route table rows.

## Web

Mockups: [index](create-registration-mockups/index.html), [Option A: one page](create-registration-mockups/option-a-one-page.html), [Option B: steps](create-registration-mockups/option-b-steps.html), [dialogs and search states](create-registration-mockups/dialogs.html), [entry points](create-registration-mockups/entry-points.html). The owner chose **Option B, three steps** (Bowler, Registration, Review), shown as a progress list (`<ol>` with `aria-current="step"`).

- Route `/tournaments/:id/registrations/new` behind `RequirePermission` `registrations.write`. A complete tournament shows "This tournament is complete."
- "Add registration" link on the Registrations page, and an "Add registration to this squad" link on the lane pages, both inside `<Can>`. The lane link passes `?squad=` or `?sweeper=`.
- `AddRegistrationPage.tsx`: holds the step (Bowler, Registration, Review) and the form values. Back keeps what was typed. Step 1 has three stages: search, existing bowler, new bowler. Next on step 1 needs the names; Next on step 2 checks division and at least one squad on the client, and the server rechecks everything on Save. No copy of server data in `useState` beyond the editable form values.
- `ReviewStep.tsx`: shows the bowler, each changed field as old against new (for a stored bowler), the division, average, squads, sweepers, and the line "A $0 desk entry is recorded". The one Add registration button is here. A server `400` names a field: the page goes back to the step that holds it, with the error summary focused.
- `BowlerSearch.tsx` with `useBowlerSearch`: four fields, results list with a Registered badge (text plus check, not color alone), "Pick" and "New bowler".
- `useBowler(id, tournamentId)`: fills the form and shows the "already registered" notice.
- `BowlerFields.tsx`: the form fields (names required), per-field errors linked with `aria-describedby`. `validateBowler.ts` runs the names rule on the client; every other rule is the server's, shown per field from the `400`.
- `RegistrationFields.tsx`: division select (by number), average, squad and sweeper checkboxes (complete ones greyed out and disabled; already-held ones checked and locked on append; the session from `?squad=` or `?sweeper=` checked and locked, with the hint "Added from the lane page"), super sweeper.
- `AlreadyRegisteredDialog.tsx` and `UsbcIdOnFileDialog.tsx`, on the shared dialog parts (`Dialog.module.css`, `dialogParts.ts`), like `ConfirmChangesDialog`. The division-move text goes in the first one.
- `useCreateRegistration` mutation: on `409 alreadyRegistered` opens the dialog; Yes sends again with `appendToExisting: true`. On `409 usbcIdOnFile` opens the second dialog; Yes switches to the stored bowler (`bowlerId`) with the typed fields as the patch. On success invalidates the registrations list and the tournament summary, shows a success Toast, and navigates to the Registrations page.
- States on every data view: search loading (`Loading`), empty, error with Try again; the form: saving (button disabled, `Saving…`), invalid (error summary with focus moved to it).
- Focus: on a step change focus goes to the step's heading; after a failed save, to the error summary; after Pick, to the first form field.
- Phone: one column; results reflow as cards; no sideways scroll.
- MSW handlers and factories in `web/src/mocks/` for the three routes, including both `409` cases.

## Data

No schema change. Writes go through the existing `RegistrationWriter` (one transaction). Types: `BowlerSearchResult`, `BowlerDetail`, `DeskRegistrationRequest`, and the two `409` bodies, in `features/bowlers/types.ts` and `features/registrations/types.ts`, kept in step with the web `types.ts` by a comment, as the other features do.

## Tests

| Rule | Proof |
| --- | --- |
| REG-01, D-159 | `deskRegister.test.ts`: registered bowler without the flag gives `already-registered` with the existing ids; `desk.vendor.test`-style route test for the `409` body. `AddRegistrationPage.test.tsx`: save shows the dialog; No saves nothing. |
| REG-10 to REG-14, D-159 | `deskRegister.test.ts`: with the flag, new squads added, bowler patched, payment added. A squad already held is a `400`. `prismaWriter.db.test.ts` (desk append, one transaction). |
| D-160, REG-12, REG-15 | `deskRegister.test.ts`: division moves with no scores; refused with a score. Page test for the move text in the dialog. |
| REG-07, BWL-16a, D-05, D-158 | `deskRegister.test.ts`: patch changes only sent fields; blank changes none. Page test: edit address, save, request carries only changed fields. |
| BWL-15, D-161 | `deskRegister.test.ts`: new bowler with a stored USBC ID gives `usbc-id-on-file`. Page test: Yes switches to the stored bowler with the typed edits. |
| REG-02, BWL-01 to BWL-10, D-162 | `deskRegister.test.ts`: name-only new bowler saves; missing name is a `400` with its message; address rules run when a street is given. `validateBowler.test.ts`. |
| REG-04, REG-05 | `deskRegister.test.ts`: handicap division without a USBC ID is a `400`; average and age checks. |
| REG-03, REG-06 | `deskRegister.test.ts`: no squad is a `400`; super sweeper needs every sweeper. |
| REG-08, PAY-01a, D-163 | `deskRegister.test.ts` and `prismaWriter.db.test.ts`: a `Manual_` code of 43 characters and amount 0. |
| REG-22, D-164 | `AddRegistrationPage.test.tsx`: `?squad=` checks the squad and its box is disabled and cannot be cleared; `?sweeper=` the same. Lane page test: the link carries the id. |
| Steps | `AddRegistrationPage.test.tsx`: Next is blocked without names or squad; Back keeps values; Review lists the changed fields; a server `400` returns to the step with the field. |
| BWL-14, D-157 | `bowlers/routes.test.ts`, `prismaRepository.db.test.ts`: each filter, AND, the 25 cap and `more`, the `registered` marker, `400` with no filter. `BowlerSearch.test.tsx`: loading, empty, error, results. |
| BWL-17 | `bowlers/routes.test.ts`: the response has no SSN or date of birth in search; detail has date of birth but no SSN. |
| D-157 access | `bowlers/routes.test.ts` and `routes.test.ts`: `401` signed out, `403` for the score keeper, `200` for the director and admin; the API key does not reach these routes. `roles.test.ts`: `bowlers.read` for director and admin only. |
| D-130 | `deskRegister.test.ts`: a complete tournament is a `409` with `errors`. |
| UI | `web/e2e/` journey: sign in as the director, search, pick, add a squad, save, see the row. `accessibility.spec.ts`: add the new path and open the dialogs before the scan. |

## Steps

1. Add `bowlers.read` and its tests (`roles.test.ts`, access tests). Green.
2. Extract the shared checks and save step from `register()` into `registrationChecks.ts`. The existing tests must pass unchanged.
3. `findBowlerById` on the writer (in-memory and Prisma), with tests.
4. `deskRegister.ts` with every case above, and its route (`POST /v1/tournaments/{id}/registrations`), `409` bodies, logs, and metric.
5. `features/bowlers/`: search and detail routes, repository, tests (Testcontainers).
6. Requirements and API docs rows (`docs/api-standards.md`, `api-access.md`).
7. Web: types, `api.ts`, hooks, MSW handlers and factories.
8. Web: `BowlerSearch`, `BowlerFields`, `RegistrationFields`, with tests.
9. Web: `AddRegistrationPage`, both dialogs, the route, the two links, with tests.
10. e2e and axe test. Mutation run on `deskRegister.ts` and `validateBowler.ts`; fix survivors.
11. Run `npm run check` and `test:e2e`. Commit in the steps above.

## Not doing

- Duplicate detection by name (D-161). Exact USBC ID only.
- Recording real payments (D-163, proposed feature).
- A database constraint for one registration per bowler per tournament (Q-26). Two desks cannot check in one bowler at once: a bowler stands in one line. The check in code is enough for the desk.
- Changing a division from the list, editing or deleting a registration, super sweeper add or remove (Later, registrations edit).
- SSN entry or verify (Q-22).
- Any change to the vendor routes or their OpenAPI document (D-09, D-114). The new routes are web-only and not in `openapi.ts`.
