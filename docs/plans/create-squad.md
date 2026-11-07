# Plan: create squad

Branch: `createSquad` (first part of 0.7.0). Delete this file when the work is done. Create sweeper follows on the same branch with its own plan.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| SQD-01 | In | Tournament from the URL; unknown id gives `404` |
| SQD-02 | In | Finals and cash ratio, if set: greater than 1, at most 99.9, one decimal (D-170) |
| SQD-03 | In | Date inside the tournament dates; `409` with `errors.date` (stored state) |
| SQD-04 | In | Max per pair 2 to 5 (D-168, answers Q-10) |
| SQD-05 | In | Number of lanes even, 2 to 200 (D-168) |
| SQD-06 | In | Starting lane odd, 1 to 199 (D-168) |
| SQD-07 | In | A new squad is always open; no `complete` key (D-171) |
| SQD-08 | In | Entry fee 0 to 999.99, two decimals; blank means the tournament fee (D-170) |
| TRN-12 | Already done (read) | Create stores NULL for a blank box; the response resolves the values the same way |
| D-171 | In | A complete tournament refuses a create |
| SQD-10 to SQD-13 | Later | Create sweeper: next slice, same branch |
| SQD-14 | Later | Edit and delete: next slices of 0.7.0 |
| SQD-15 to SQD-18 | Later | Complete, with the zero-fill and the server lock |
| Q-11 | Later | Sweeper bonus-pin presets |

## Decisions used

- D-167: web-only `POST`, permission `squads.write` (director, admin), form on its own page.
- D-168: max per pair 2 to 5; starting lane odd 1 to 199; lanes even 2 to 200.
- D-169: one date-time box, blank at first, inside the tournament dates; no overlap check.
- D-170: blank override means NULL (tournament value); fee 0 to 999.99; ratios 1.1 to 99.9, one decimal; hints show the tournament values.
- D-171: complete tournament refuses; no Complete box.
- D-172: prefill lanes and per pair from the latest squad; return to the list with a "Squad created" toast; log fields.
- D-173: version 0.7.0.
- D-09: vendor routes keep their shape. D-96: routes ask for permissions. D-125: limits are refused, never rounded. D-129: the API words refusals and the form shows them. D-130: a complete tournament freezes everything under it. D-45: sessions sort by date, lane, id.
- D-157 to D-166 belong to `createRegistration`; nothing here uses them.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| SQD-04 | Max per pair above 0 | 2 to 5 | D-168 |
| SQD-05, SQD-06 | Even and odd, above 0 | Also capped: lanes 2 to 200, start 1 to 199 | D-168 |
| SQD-02 | Above 1 | Also at most 99.9, one decimal, refused not rounded | D-170 |
| SQD-03 | Checked by the desk screen only | Checked by the API too, as `409 errors.date`, legacy wording | D-169 |
| (new) | No check on a finished tournament | A complete tournament refuses | D-171 |
| (new) | Any desk user adds a squad | Needs `squads.write` | D-167 |

## API

`POST /v1/tournaments/{id}/squads`. Web only; the vendor sees no new route (D-09), and a new squad appears in the existing vendor `squads` array. Access `{ permission: 'squads.write' }` (no `apiKey`). Mounted with `methods: ['POST']` beside the public `GET` on the same path, as divisions are.

Request, a strict JSON object (an unknown key, `complete` included, is `400`):

| Key | Rule |
| --- | --- |
| `date` | Required. `YYYY-MM-DDTHH:mm` (seconds, if sent, must be `00`). Stored as the center's local time |
| `startingLane` | Required whole number, odd, 1 to 199 |
| `numberOfLanes` | Required whole number, even, 2 to 200 |
| `maxPerPair` | Required whole number, 2 to 5 |
| `entryFee` | Optional, 0 to 999.99, two decimals |
| `finalsRatio`, `cashRatio` | Optional, 1.1 to 99.9, one decimal |

A blank override (`""`, `null`, or a missing key) is not set.

Answers:

| Status | When | Body |
| --- | --- | --- |
| `201` | Saved. `Location: /v1/tournaments/{id}/squads` | `{ squad }` in the list shape (effective values, `…Overridden` flags, `games`) |
| `400` | Shape or limit fails (SQD-02, 04 to 06, 08) | `{ message, errors: { field: message } }` |
| `400` | The id is not a UUID | `{ message }` |
| `401` / `403` | Signed out / no `squads.write`, or the API key | standard |
| `404` | Unknown tournament | `{ message: "Tournament not found" }` |
| `409` | Complete tournament | `errors.tournament` "This tournament is complete and cannot be changed" |
| `409` | Date outside the tournament (SQD-03) | `errors.date` "Squad date must be after tournament start" or "...before tournament end" |
| `503` | Database down | standard |

Files in `api/src/features/squads/` (the same split as divisions):

- `createRequest.ts`: Zod schema and `parseCreateSquad`, with the field messages. Reuses `FieldErrors` and `describeFailure`.
- `createPlan.ts`: pure `planCreate(facts, input)`: complete tournament first, then the date range. No I/O.
- `writer.ts`: `SquadWriter.create(tournamentId, input)` returning `{ notFound } | { refused } | { created }`, an `applyCreate` shared by both writers, and an in-memory writer for route tests.
- `prismaWriter.ts`: one serializable transaction with retry (`withRetry`): read the tournament (completed, dates, fee, ratios, games), plan, insert (`squadType` 0, `complete` false, `sweeperEntryFee` and `games` NULL), map with `toSquad`. The wall-clock date is stored as `new Date(date + ':00Z')` (Prisma reads and writes UTC; see `localDateTime`).
- `createRoutes.ts`: parse, call the writer, turn the outcome into HTTP, log `{ actorId, tournamentId, squadId }` with "Squad created".
- `app.ts`, `server.ts`, `test/testApp.ts`: add `squadWriter` to `AppDependencies` and mount the route. `permissions.ts` and `roles.ts`: add `squads.write` to director and admin.

Squad ids come from `randomUUID`. Expect small merge conflicts with `createRegistration` in `app.ts`, `server.ts`, `testApp.ts`, `permissions.ts`, and `roles.ts` (it adds `bowlers`, `bowlers.read`); resolve by keeping both.

## Web

Mockups (open `docs/plans/create-squad-mockups/index.html`):

- `squads-list.html`: the New squad link, the toast after a save, an empty tournament, no link for a complete tournament or a user without the permission.
- `new-squad-form.html`: prefilled, first squad, browser errors with summary, API date refusal, saving, loading, load error, complete tournament, failure toast.

Screens and parts in `web/src/features/squads/`:

- `NewSquadPage.tsx` (route `squads/new` in `App.tsx`, inside `RequirePermission permission="squads.write"`): reads the tournament settings (`completed`, ratios) and the squads list. Waits with `Loading`; settings error shows `QueryError`; complete shows the notice. A failed squads list shows the form blank. The latest squad (last in the sorted list) gives the lane and per-pair values; the form mounts only after the list settles, so no `useEffect` is needed.
- `SquadForm.tsx` + `SquadForm.module.css`: native `datetime-local` with `min` and `max` from the tournament dates, a Lanes group (starting lane, number of lanes, bowlers per pair), and a "Fee and ratios" group with hints "Tournament: $50.00". Errors under each field, a summary that moves focus to the first problem, Save and Cancel with the same `keepFocus` guard as `DivisionForm`.
- `validateSquad.ts`: the same checks and messages as the API, run in the browser; `toNewSquad(values)` makes the request body.
- `api.ts`: `createSquad` throws `SquadRejectedError` (field `errors` or a non-field `tournament` message), like `DivisionRejectedError`. If the two classes match, extract one to `src/shared/` (two features now need it); otherwise keep them apart.
- `useCreateSquad.ts`: TanStack mutation that invalidates the squads list (and the tournament detail query if one exists).
- `SquadsPage.tsx`: a "New squad" link inside `<Can permission="squads.write">`, hidden on a complete tournament; a "Squad created" toast from router state, closing after 5 s (as divisions). `useTournamentOpen` moves from `DivisionsPage.tsx` to a shared hook, since squads now need it too.
- `auth/types.ts` and `mocks/data.ts`: add `squads.write` (director and admin mock users).
- Mocks: an MSW `POST /v1/tournaments/:id/squads` handler with the API's checks, so `dev:mocks` and e2e work.
- States: loading, error, and empty exist on the list; the form adds invalid, saving, complete, and failure (mockups 3 to 8).

## Data

No schema change: inserts into the legacy `Squads` table (`SquadType` 0). Types: `NewSquad` in `createRequest.ts`; the existing `Squad` is the response. The web `types.ts` gains `NewSquadInput`, `SquadFormValues`, and the field list. Change the API and web shapes together.

## Tests

| Rule | Test |
| --- | --- |
| SQD-01 | `createRoutes.test.ts`: unknown tournament `404`, bad id `400`; `prismaWriter.db.test.ts`: the squad belongs to the URL's tournament |
| SQD-02 | `createRequest.test.ts`: 1 and 99.9 edges, third decimal, text; `validateSquad.test.ts` same; form test shows the message |
| SQD-03 | `createPlan.test.ts`: first minute of the start day passes, last minute of the end day passes, a minute before and after refuse; `createRoutes.test.ts`: `409 errors.date` |
| SQD-04 to SQD-06 | `createRequest.test.ts` and `validateSquad.test.ts`: each edge, odd and even, caps; `NewSquadPage.test.tsx`: summary and focus |
| SQD-07 | `createRequest.test.ts`: `complete` is `400`; `prismaWriter.db.test.ts`: stored `Complete` is false |
| SQD-08 | `createRequest.test.ts`: 0, 999.99, 1000, third decimal, blank is NULL; `prismaWriter.db.test.ts`: NULL columns and a stored 0 fee |
| TRN-12 | `createRoutes.test.ts` and `prismaWriter.db.test.ts`: the response resolves blank values to the tournament's with flags false |
| D-171 | `createPlan.test.ts`, `createRoutes.test.ts` (`409 errors.tournament`), `NewSquadPage.test.tsx` (notice), `SquadsPage.test.tsx` (no link) |
| D-167 | `createRoutes.test.ts` through `testApp`: `401`, key `403`, score keeper `403`, director `201`; `roles.test.ts`; `Can` in `SquadsPage.test.tsx` |
| D-169 | form test: `min` and `max` on the date box; no overlap rejection in `createRoutes.test.ts` |
| D-172 | `NewSquadPage.test.tsx`: prefill from the latest squad, blank for none and on a list error; toast and navigation after save; log line in `createRoutes.test.ts` |
| Whole flow | `web/e2e/squads.spec.ts`: sign in as director, New squad, save, toast, new card; one validation error; a complete tournament shows no link. `accessibility.spec.ts`: `/squads/new` in both colour schemes |

Every test name cites the rule ID. Run Stryker on the new API and web logic (`createRequest`, `createPlan`, `validateSquad`) and fix survivors.

## Steps

Each step ends green (lint, typecheck, test, format:check) and gets its own commit.

1. Bump both `package.json` and lockfiles to 0.7.0 (`npm version 0.7.0 --no-git-tag-version`, in each folder).
2. API: `squads.write` permission and role mapping, with tests.
3. API: `createRequest.ts` and `createPlan.ts` with unit tests.
4. API: `writer.ts` (outcomes, `applyCreate`, in-memory writer) and `createRoutes.ts`, wired through `app.ts`, `server.ts`, `testApp.ts`, with route tests.
5. API: `prismaWriter.ts` with Testcontainers tests (`*.db.test.ts`).
6. Web: types, `validateSquad.ts`, `api.ts`, `useCreateSquad.ts`, with tests.
7. Web: `SquadForm`, `NewSquadPage`, route, `SquadsPage` link and toast, shared `useTournamentOpen`, mocks, with tests.
8. Web: e2e and axe tests; run `npm run test:e2e`.
9. Stryker on the new logic; fix survivors.
10. `npm run check` at the root.

## Not doing

- Create sweeper (next slice), edit, delete, and complete squad.
- Any overlap check between squads (D-169).
- Any change to the vendor routes or their shapes (D-09).
- An entry count or "no bowlers yet" on the cards.
- Sweeper bonus-pin presets (Q-11).
- A change to the lane page, the registration form, or anything on `createRegistration`; a new squad shows there once the branches meet.
