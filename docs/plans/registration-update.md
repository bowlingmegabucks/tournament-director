# Plan: registration update (slice 2)

Branch: `migrate-registration-create` (slice 1 is not merged yet). Delete this file when the work is done.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| API-07 | In | `PATCH /v1/registrations/{id}`, `204` |
| REG-30 | In | Unknown id: problem body (status per API-12, see below) |
| REG-31 | In | `squadIds`, `sweeperIds` replace the lists; one omitted keeps its list. D-04 for desk requests |
| REG-32, REG-33 | In | Ids belong to the tournament; added sessions not complete |
| REG-34 | In | Removed session: no scores for this bowler. D-10: desk requests also cannot drop a complete session |
| REG-35 | In | Super sweeper needs every sweeper |
| REG-36 | In | Changing `superSweeper` locked by this bowler's sweeper scores (D-110), desk and paid alike |
| REG-37 | In | Division in the tournament; eligibility runs on the new division |
| REG-38 | In | Average applies alone (D-116) |
| REG-39 | In | Payment added; repeat code is a retry (D-118) |
| REG-15 | In (desk only) | Division lock after scores (D-117) |
| API-14, VC-01, VC-02 | Later | Rate limit and status-code changes need the vendor |
| API-08 | Later | Slice 3 |

## Decisions used

D-04, D-05, D-09, D-10, D-106, D-107, D-110, D-115, D-116, D-117, D-118.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| REG-31 | Empty `squadIds` accepted | Desk request: 400 | D-04, D-115 |
| REG-34 | Drops a complete session | Desk request: 400 | D-10, D-115 |
| REG-36 | Locked by any bowler's sweeper score | This bowler's score only | D-110 |
| REG-38 | Average alone ignored | Applied | D-116 |
| REG-15 | Division change after scores allowed | Desk request: 400 | D-117 |
| REG-39 | Repeat code: database error, 500 | `204`, nothing written | D-118 |

## API

`PATCH /v1/registrations/{id}`, access `{ permission: 'registrations.write', apiKey: true }` (same group as `POST`).
Body as `integration-api.md` shows: `registrationId` (must equal the path id, else `Registration.IdMismatch`, 400), then optional `divisionId`, `average`, `squadIds`, `sweeperIds`, `superSweeper`, `payment`. Success `204`. Errors use the slice 1 problem body: validation gives 400, any other failure 500 (API-12), unknown registration 404 as in `GET`. A path id that is not a UUID is 400. The route joins the OpenAPI list.

Caller profile: paid when `payment` is present, not `Manual`, amount above 0 (D-106); otherwise desk. One helper, `isPaidRequest`, shared with create.

## Data

No schema change. `RegistrationWriter` gains:
- `getRegistration(id)` with its tournament (`StoredRegistration` plus `tournamentId`),
- `findScoredSessionIds(bowlerId, sessionIds)` (from `SquadScores`),
- `save` takes `removeSessionIds`, and the registration part may change only the fields sent.

The in-memory writer gets the same, so route tests stay in memory. The Prisma `save` stays one transaction.

## Tests

One case per rule in `register`-style unit tests (`update.test.ts`), route tests in `vendorRoutes.test.ts` (204, 400 body, 404, id mismatch, access 401/403), and `prismaWriter.db.test.ts` for removal, score lookup, rollback, and SSN untouched. Each name cites the rule ID. Mutation run on `update.ts`.

## Steps

1. Writer: new reads, `removeSessionIds`; in-memory and Prisma; db tests.
2. `update.ts`: request schema, profile helper, the checks above, orchestration; unit tests.
3. Route, access label, OpenAPI entry; route tests.
4. Mutation run, fix survivors. `npm run check`.
5. Record: requirements file, migration Status columns, vendor note, `CLAUDE.md` item.

## Not doing

`DELETE` (slice 3), 404/409 status mapping (VC-01), rate limit fix (API-14), lane assignment for added squads (stays unassigned, as in create).
