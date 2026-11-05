# Plan: create division

Branch: `createDivision`. Delete this file when the work is done. This is the first part of 0.6.0.

## Scope

| Rule   | Bucket       | Note                                                                                           |
| ------ | ------------ | ---------------------------------------------------------------------------------------------- |
| DIV-01 | In           | The server assigns the number, so it is always above 0 (D-139)                                 |
| DIV-02 | In           | Name required, 1 to 100, unique in the tournament (D-140, D-141)                               |
| DIV-03 | In           | The URL names the tournament: unknown 404, complete 409 (D-138, D-143)                         |
| DIV-04 | In           | Ages 1 to 120                                                                                  |
| DIV-05 | In           | Minimum age ≤ maximum age                                                                      |
| DIV-06 | In           | Averages 1 to 300 (legacy: below 300)                                                          |
| DIV-07 | In           | Minimum average ≤ maximum average                                                              |
| DIV-08 | In           | Whole percent 1 to 999; over 100 confirms (D-141, D-142)                                       |
| DIV-09 | In           | Percent and base together                                                                      |
| DIV-10 | In           | Base 0 to 300                                                                                  |
| DIV-11 | In           | Cap 1 to 300, only with base and percentage                                                    |
| DIV-12 | In (add)     | Edit and delete: Later                                                                         |
| DIV-13 | Already done | The list sorts; the new row appears in order                                                   |
| DIV-14 | Later        | With Add sweeper                                                                               |
| DIV-15 | In (add)     | Unique number holds by construction; unique name added (D-139, D-140). The edit check is Later |

Eligibility at registration (`REG-04`, `REG-05`) and the handicap formula (`SCR-07`) are Later. This slice stores the settings only.

## Decisions used

- D-09: the registration site sees no change. The POST is web only. A new division shows in the vendor `divisions` array.
- D-19: hide, do not disable. The link is hidden without the permission and on a complete tournament.
- D-25: additive vendor change only.
- D-38: the unique number rule. The database key waits for 1.0.0.
- D-96, D-97: routes ask for a permission, never a role. The director holds every permission not withheld.
- D-102, D-120: `<Can>`, `RequirePermission`, and a form page with a toast, as create tournament.
- D-123: the create transaction pattern (serializable, retried, then 409).
- D-125, D-129: limits are refused not rounded. Warnings are a 409 and a resend with `confirmWarnings: true`.
- D-130, D-131: a complete tournament freezes everything under it. The public `completed` flag on the settings read feeds the web app.
- D-138 to D-145: this feature.

## Differs from legacy

| Rule   | Legacy                                              | New app                                              | Decision     |
| ------ | --------------------------------------------------- | ---------------------------------------------------- | ------------ |
| DIV-01 | Number typed, any value above 0, duplicates allowed | Server assigns highest + 1, shown as text            | D-139        |
| DIV-02 | Name required                                       | Also trimmed, at most 100, unique in the tournament  | D-140, D-141 |
| DIV-04 | Ages above 0, no top                                | 1 to 120                                             | D-141        |
| DIV-06 | Averages above 0 and below 300                      | 1 to 300                                             | D-141        |
| DIV-08 | 0 or more; a typed 0 saves as none                  | Whole percent 1 to 999; 0 refused; over 100 confirms | D-141, D-142 |
| DIV-11 | Above 0                                             | 1 to 300                                             | D-141        |
| DIV-12 | Add in WinForms, with no completed check            | Refused when the tournament is complete              | D-143        |
| DIV-15 | No check                                            | Unique number and name                               | D-139, D-140 |

## API

Web only. Not vendor-visible (D-09).

`POST /v1/tournaments/{id}/divisions`, access `{ permission: 'divisions.create' }`, `methods: ['POST']`, mounted beside the public `GET` on the same path (as the tournament routes do). The API key cannot reach it.

Request body (JSON object). The request has no `number`; if one is sent it is ignored.

| Field                              | Type                            | Rule                                                               |
| ---------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| `name`                             | text                            | required, trimmed, 1 to 100                                        |
| `gender`                           | `"Male"`, `"Female"`, or `null` | optional; `null` or absent means any                               |
| `minimumAge`, `maximumAge`         | whole number or `null`          | 1 to 120; minimum ≤ maximum                                        |
| `minimumAverage`, `maximumAverage` | whole number or `null`          | 1 to 300; minimum ≤ maximum                                        |
| `handicapPercentage`               | whole number or `null`          | 1 to 999, the percent as typed (90); stored `0.90`. Over 100 warns |
| `handicapBase`                     | whole number or `null`          | 0 to 300; set with the percent or not at all                       |
| `maximumHandicapPerGame`           | whole number or `null`          | 1 to 300; only with base and percent                               |
| `confirmWarnings`                  | boolean                         | optional; `true` agrees to the warnings                            |

A field sent as `""` counts as not set for the optional numbers, so the form can send what it holds. A value that is not a whole number is a field error, never rounded.

| Status        | Body                                                                                                                                                                                                                                           | When                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `201`         | `{ division }` with every field the list shows (`id, number, name, gender, minimumAge, maximumAge, minimumAverage, maximumAverage, handicapPercentage, handicapBase, maximumHandicapPerGame`), plus `Location: /v1/tournaments/{id}/divisions` | created                                                                                              |
| `400`         | `{ message, errors: { field: message } }`                                                                                                                                                                                                      | rule failures (one message per field), a body that is not a JSON object, or an id that is not a UUID |
| `401` / `403` | as every guarded route                                                                                                                                                                                                                         | signed out; the API key or a score keeper                                                            |
| `404`         | `{ message: "Tournament not found" }`                                                                                                                                                                                                          | unknown tournament                                                                                   |
| `409`         | `{ message, errors: { tournament: "This tournament is complete and cannot be changed" } }`                                                                                                                                                     | complete tournament (checked first, in the transaction)                                              |
| `409`         | `{ message, errors: { name: "A division with this name already exists in this tournament" } }`                                                                                                                                                 | duplicate name                                                                                       |
| `409`         | `{ message, warnings: [{ field: "handicapPercentage", message }] }`                                                                                                                                                                            | percent over 100, without `confirmWarnings: true`. Nothing saved                                     |
| `503`         | `{ message }`                                                                                                                                                                                                                                  | database down                                                                                        |

Order: 400 field checks run first on the body (a bad body never reaches the database). In the transaction: tournament exists (404), tournament complete (409), duplicate name (409), then the over-100 warning unless confirmed. Refusals come before warnings and cannot be confirmed away (D-129).

Messages (legacy wording where it has one):

| Rule   | Message                                                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DIV-02 | "Name is required"; "Name cannot be longer than 100 characters"                                                                                                                |
| DIV-04 | "Minimum age must be between 1 and 120"; "Maximum age must be between 1 and 120"                                                                                               |
| DIV-05 | "Minimum age must be less than or equal to maximum age" (on `minimumAge`)                                                                                                      |
| DIV-06 | "Minimum average must be between 1 and 300"; "Maximum average must be between 1 and 300"                                                                                       |
| DIV-07 | "Minimum average must be less than or equal to maximum average" (on `minimumAverage`)                                                                                          |
| DIV-08 | "Handicap percentage must be a whole number from 1 to 999, or leave it blank"                                                                                                  |
| DIV-09 | "Handicap percentage and handicap base go together: fill in both or neither" (on `handicapPercentage` when the percent is missing, on `handicapBase` when the base is missing) |
| DIV-10 | "Handicap base must be between 0 and 300"                                                                                                                                      |
| DIV-11 | "Maximum handicap per game must be between 1 and 300"; "Maximum handicap per game is allowed only with a handicap percentage and base"                                         |

Exact wording is finished in the code; the web app uses the same text for its own checks.

Storage and number: `DivisionWriter.create(tournamentId, input, { confirmWarnings })` in one serializable transaction (a lost race is retried, then answers 409 as D-123): read the tournament's `Completed`; read the divisions' `Number` and `Name`; take `max(Number) + 1` (1 when none); apply the checks; insert. The id is `randomUUID()`. Percent is stored `percent / 100` as `Decimal(3, 2)`. Gender stores 0 or 1, or NULL.

Log line (`requestLogger`): `{ actorId, tournamentId, divisionId }`, "Division created". No name or limits.

Permission: add `divisions.create` to `permissions.ts`. The director and admin hold it by the existing rule; the score keeper does not. Update `docs/requirements/api-access.md` (route table and the permission list).

## Web

Mockups: [index](createDivision-mockups/index.html), [Divisions page](createDivision-mockups/divisions-list.html), [form](createDivision-mockups/new-division-form.html). They show the states below.

- **Divisions page** (`DivisionsPage.tsx`): a "New division" link beside the heading inside `<Can permission="divisions.create">`, hidden when the tournament is complete (the public `completed` flag on the settings read, `useTournamentSettings`). The page keeps its table and states. A "Division created" success toast shows when the page opens with a `created` flag in the router state, and closes itself.
- **New division page** (`NewDivisionPage.tsx`, route `tournaments/:id/divisions/new` inside `TournamentLayout`, wrapped in `RequirePermission permission="divisions.create"`):
  - Reads the settings (`completed`): complete shows "This tournament is complete" with a link back; loading and error use `Loading` and `QueryError`.
  - Number: plain text with a "Number:" label, not an input, showing "highest + 1" from `useDivisions`. While the list loads or fails, the value is blank and the hint says the server assigns it. The form never waits on it, and it sends no number.
  - Fields and groups as the mockup: name, gender (Any gender, Male, Female), Age limits, Average limits, Handicap (percent with a "%" after the box, base, cap). Visible labels and hints. `inputMode="numeric"` on the numbers.
  - Checks on leaving a field and on save; a failed save shows a summary and moves focus to the first problem; Save disables and reads "Saving…" (as `TournamentForm`).
  - API field errors show under their fields; a `409` with `warnings` opens the confirm dialog (reuse `ConfirmChangesDialog`, moved to `src/shared/` since two features use it; its title text becomes a prop, "Add this division?"); a `409` with `errors.tournament` or any other failure shows an error toast that stays until dismissed.
  - Success: navigate to `/tournaments/{id}/divisions` with the toast flag, and refresh the divisions query.
- **Files** in `web/src/features/divisions/`: `NewDivisionPage.tsx`, `DivisionForm.tsx`, `DivisionForm.module.css`, `validateDivision.ts`, `useCreateDivision.ts`, plus `createDivision` in `api.ts` and types in `types.ts`. `TournamentForm.module.css` styles are copied or the shared pieces move to `src/shared/` if the form code repeats more than a field and a hint.
- **Sidebar and access:** no sidebar change. `App.tsx` gets the route.
- **e2e:** mocks (MSW handlers) cover the create; add the new page to the axe test.

## Data

- `NewDivision` and `Division` types in the API (`types.ts`) and web (`types.ts`); the API's and the web's carry the same fields (change both together).
- Writes to the legacy `Divisions` table through Prisma. No schema change (D-30, D-38): the unique key waits for 1.0.0.
- `db:seed` is unchanged.
- Version: `npm version 0.6.0 --no-git-tag-version` in `api/` and `web/`.

## Tests

| Rule                                                                                                      | Test                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DIV-01 (number is highest + 1, 1 when empty, ignores a sent number)                                       | `api/src/features/divisions/prismaWriter.db.test.ts`, "assigns one more than the highest number (DIV-01, D-139)"; `createRoutes.test.ts` with a fake writer |
| DIV-02, DIV-04 to DIV-11 (each message, the limits, and the limit edges)                                  | `createRequest.test.ts`, one case per rule and per edge (cite the rule ID); `createRoutes.test.ts` "400 with a message per field"                           |
| DIV-02, D-140 (same name refused, any case, trimmed)                                                      | `prismaWriter.db.test.ts`; `createRoutes.test.ts` "409 on a duplicate name"                                                                                 |
| DIV-03 (unknown tournament 404, not a UUID 400)                                                           | `createRoutes.test.ts`                                                                                                                                      |
| DIV-08, D-142 (over 100 warns; resend with `confirmWarnings` saves; 100 does not warn)                    | `createRoutes.test.ts`, `createRequest.test.ts`, `prismaWriter.db.test.ts`                                                                                  |
| D-143 (complete tournament 409, before field checks that pass)                                            | `createRoutes.test.ts`, `prismaWriter.db.test.ts`                                                                                                           |
| DIV-12 add (201 and shape; access: signed out 401, API key 403, score keeper 403, director and admin 201) | `createRoutes.test.ts`; `api/src/shared/auth/roles.test.ts` (new permission); `app` access test                                                             |
| DIV-15 (two creates at once get different numbers)                                                        | `prismaWriter.db.test.ts`, "two at once"                                                                                                                    |
| Log line has ids only                                                                                     | `createRoutes.test.ts`                                                                                                                                      |
| Web checks (every message, "%" box, number shown as text)                                                 | `validateDivision.test.ts`, `NewDivisionPage.test.tsx`                                                                                                      |
| Web flow: save then toast on the list; field errors; confirm dialog; complete tournament; permission      | `NewDivisionPage.test.tsx`, `DivisionsPage.test.tsx` (link shown, hidden without permission, hidden when complete), `api.test.ts`                           |
| e2e journey and axe                                                                                       | `web/e2e/divisions.spec.ts`, `web/e2e/accessibility.spec.ts`                                                                                                |

Mutation: run `npm run test:mutation` in `api/` and `web/` for the new files and fix survivors.

## Steps

1. Add the `divisions.create` permission, with role tests. Check green.
2. API: types, `createRequest.ts` (Zod and field messages) with tests.
3. API: `DivisionWriter` interface, the pure plan (checks and warning) with tests, then `prismaWriter.ts` with `*.db.test.ts`.
4. API: `createRoutes.ts` with route tests; mount it in `app.ts` and `server.ts` with `methods: ['POST']`.
5. Web: types, `api.ts` `createDivision`, `validateDivision.ts`, MSW handler and factory use.
6. Web: move `ConfirmChangesDialog` to `src/shared/` (fix imports and tests), then `DivisionForm`, `NewDivisionPage`, route.
7. Web: the "New division" link and toast on `DivisionsPage`; e2e and axe.
8. Version bump to 0.6.0 in both folders; `npm run check`; mutation tests.

Each step ends with lint, typecheck, tests, and `format:check` green.

## Not doing

- Edit and delete a division (D-12, D-15): the next slices of 0.6.0.
- A "register anyway" eligibility step or any registration change (`REG-04`, `REG-05`).
- The sweeper's bonus-pins box (`DIV-14`).
- The database unique key on `(TournamentId, Number)` (D-38, 1.0.0).
- Duplicating a division from another tournament. Not in legacy; add it later if the desk asks.
- A change note for the registration site: none needed, since no vendor route changes (D-09).
