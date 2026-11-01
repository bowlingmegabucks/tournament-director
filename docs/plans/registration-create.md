# Plan: registration create (slice 1 of 3)

Branch: `migrate-registration-create`. Delete this file when the work is done.

Slice 1 of D-112: `GET /`, `POST /v1/registrations` (create and append), `GET /v1/registrations/{id}`, and the OpenAPI document (D-114). Slice 2 is `PATCH`, slice 3 is `DELETE`. No web screen, so no mockups.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| API-01 | In | Plain text root (D-111) |
| API-02 | Already done | `/health` is liveness, `/ready` checks the database (D-111) |
| API-05, API-09 to API-09f, API-11 | In | Create route, request checks, `201` and `Location` |
| API-06 | In | Needed for `Location`; also the vendor's read |
| API-10 | In | `"F"` is Female, everything else Male (D-113); a returning bowler keeps the stored gender (D-05) |
| OpenAPI document | In | `GET /openapi/v1.json`, D-114 |
| API-12, API-13 | In | Validation 400, everything else 500; problem details body |
| API-14 | Later | Rate limit stays as the new API has it (D-95) |
| API-07, API-08 | Later | Slices 2 and 3 |
| REG-01 to REG-03, REG-05 to REG-08 | In | |
| REG-04 (`04a` to `04h`) | In | A 400 for everyone (D-107) |
| REG-10 to REG-14 | In | Append, patch semantics (D-05) |
| REG-30 to REG-39, REG-19 | Later | Slices 2 and 3 |
| REG-15 to REG-18, REG-20 to REG-22 | Later | Desk screens |
| BWL-01 to BWL-08, BWL-10, BWL-07a | In | Run on the bowler inside the request |
| BWL-09 | In | Age on the tournament start date |
| BWL-11, BWL-17 | In (guard only) | The API sends no SSN; writes never touch the column; reads never select it |
| BWL-12 | Dropped as a rule | The server makes the id; the caller sends none |
| BWL-15, BWL-16a | In | Find by exact USBC ID, patch the record |
| PAY-02 to PAY-04 | In | Stored code `<system>_<code>`; repeat code is a retry (D-109); time is the server's |
| PAY-05, PAY-06 | In | No amount check; `GET` leaves payments out |

## Decisions used

- D-03: one registration per bowler per tournament, enforced in code.
- D-05: patch, not replace. Absent, null, or empty fields keep the stored value.
- D-06 and D-10: no effect on create.
- D-09: the vendor contract stays; extra fields are fine.
- D-105: `POST` is `{ permission: 'registrations.write', apiKey: true }`, `GET` is `{ permission: 'registrations.read', apiKey: true }`.
- D-106: paid or desk profile. **In slice 1 both profiles behave the same** (legacy checks plus D-108). The profiles differ on `PATCH` (D-04, D-10), so the helper that tells them apart is built in slice 2.
- D-113: gender mapping. D-114: OpenAPI document.
- D-107: eligibility is a 400. D-108: other-tournament ids and complete squads are a 400. D-109: repeat payment code is a retry. D-111: root text. D-112: three slices.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| REG-07, REG-14, BWL-16a | Overwrites every bowler field | Overwrites only fields sent with a value | D-05 |
| API-10 | Missing gender becomes Female, also for a returning bowler | New bowler: missing or any value but `"F"` is Male. Returning bowler: stored gender stays when none is sent | D-113, D-05 |
| REG-04 on append | Validates the request's bowler | Validates the merged bowler (stored plus sent), so a stored birth date and gender count | D-05 |
| create, append | Accepts ids from another tournament and complete squads | 400 | D-108 |
| PAY-03 | Repeat code gives a database error and 500 | `201` with the existing registration id | D-109 |
| API-01 | JSON object | Text `Northeast Megabucks API` | D-111 |
| Payment too long or too large | Database error and 500 | 400 (`Payment.Invalid`). Same outcome (a failure), clearer status | D-02 |
| Business-rule error `code` | FluentValidation default names | Stable codes of our own. The `description` text is legacy's | none: the contract lists codes only for `API-09*` |

## API

Vendor-visible: all three routes. Bodies, status codes, and messages follow `integration-api.md`.

- `GET /` (public): `200`, text `Northeast Megabucks API`.
- `GET /openapi/v1.json` (public): the OpenAPI 3.1 document (D-114). Built in `api/src/openapi/` from the route Zod schemas with `z.toJSONSchema` (check Zod 4 docs in Context7 first). Lists each vendor route with its request, responses, status codes, the `x-api-key` scheme, and the problem details body. No Swagger UI and no new dependency.
- `POST /v1/registrations`: access `{ permission: 'registrations.write', apiKey: true }`. Body is `API-05`'s `{ registration: {...} }`. Checks in this order:
  1. Zod request checks, one error per failure with the `API-09*` code. Any failure is `400`.
  2. The bowler rules (`BWL-*`) on the bowler (merged, for a returning bowler).
  3. Lookups: tournament and division exist; division and squads belong to the tournament and no squad or sweeper is complete (D-108).
  4. A bowler with this USBC ID already on a registration in the tournament: **append** (`REG-10` to `REG-14`). Otherwise **create**.
  5. Eligibility (`REG-04`, `REG-05`), at least one squad (`REG-03`), super sweeper needs every sweeper (`REG-06`).
  6. A payment whose code is on file: `201` with that registration's id, nothing else written (D-109).
  7. One transaction writes the bowler (create or patch), the registration (or its changes), the squad links, and the payment.
- Success: `201`, body `{ "registrationId": "<uuid>" }`, `Location: /v1/registrations/{id}`. Append also returns `201`.
- Errors: problem details (`application/problem+json`): `{ status, detail, errors: [{ code, description }], traceId }`, plus our `message` (extra field, so the web app can read it). `400` when any error is a validation error; otherwise `500` (`API-12`, kept under D-09), including an unknown tournament or division and an unknown registration to append to. `detail` is "An error occurred while creating the registration." or "...appending...".
- `GET /v1/registrations/{id}`: access `{ permission: 'registrations.read', apiKey: true }`. Shape in `API-06`: bowler (no SSN; `gender` is `"Male"`, `"Female"`, or `null`; `dateOfBirth` is `YYYY-MM-DD` or `null`), division, squads, sweepers in the vendor shapes. `404` (`detail: "Resource not found"`, `traceId`) when unknown; `400` for an id that is not a UUID.
- Phone: stored as ten digits (`BWL-07a`). Zip: digits only.

## Web

None. The desk screens that call this route come with the add-registration feature.

## Data

- `schema.prisma` grows: `Bowler` gets its other columns (names, address, email, phone, date of birth, gender) and `socialSecurityNumber` with `@default("")`. A client-level `omit` for `Bowler.socialSecurityNumber` keeps it out of every read (`BWL-17`, D-47). The create sends `''`; the patch never lists the column. **Check the Prisma `omit` and `$transaction` APIs in Context7 before building.**
- New `Payment` model (`Payments` table). `Registration` gets `payments`.
- New feature folder `api/src/features/registrations/` files: `createRegistration.ts` (the rules as pure functions), `eligibility.ts`, `bowlerRules.ts`, `bowlerPatch.ts`, `problem.ts` (the problem details body), plus repository methods (`findByUsbcId`, `createRegistration`, `appendRegistration`, `getById`, `findPaymentRegistration`) with in-memory and Prisma versions.
- No schema change in the database: only new Prisma models over existing tables (D-30). No `prisma migrate`.

## Tests

Every case name cites its rule.

| Rule | File | Case |
| --- | --- | --- |
| API-01 | `app.test.ts` | root returns the text |
| D-114 | `openapi/openapi.test.ts` | the document is valid OpenAPI 3.1 shape; every vendor route (a list kept beside the router mounts) appears with its methods; the create request schema in the document accepts the `API-05` sample |
| D-113 | `registrations/bowlerPatch.test.ts` | missing gender is Male; "F" is Female; "x" is Male |
| API-09, 09a to 09f | `registrations/requestSchema.test.ts` | one case per code; several failures return all of them |
| API-05, API-11 | `registrations/createRoutes.test.ts` | `201`, id body, `Location`; the key and a signed-in user with the permission both get in; 401 and 403 cases |
| API-06 | `registrations/getRoutes.test.ts` | shape, no SSN, `404`, `400` for a bad id |
| API-10, D-05 | `registrations/bowlerPatch.test.ts` | for a new bowler see D-113 below; a returning bowler keeps gender, birth date, SSN, and any field sent empty or absent |
| API-12, API-13 | `registrations/createRoutes.test.ts` | validation is `400`; unknown tournament is `500` with problem details |
| REG-01, REG-10 to REG-14 | `registrations/createRoutes.test.ts` | second request for the same USBC ID appends; repeated squad is `400`; division change; payment added |
| REG-03, REG-06 | `registrations/createRegistration.test.ts` | no squad; super sweeper without every sweeper |
| REG-04a to 04h, REG-05 | `registrations/eligibility.test.ts` | one case per rule, plus the gender-and-age "or" table |
| BWL-01 to 08, 10, 07a, 09 | `registrations/bowlerRules.test.ts` | one case per rule |
| D-108 | `registrations/createRegistration.test.ts` | other-tournament division; other-tournament squad; complete squad |
| PAY-02 to PAY-04, D-109 | `registrations/createRegistration.test.ts` | stored code format; time is the server's; repeat code returns the existing id and writes nothing |
| BWL-17 | `registrations/prismaRepository.db.test.ts` | an SSN stored by legacy survives create-then-append |
| REG-07 | `registrations/prismaRepository.db.test.ts` | one transaction: a failure on the payment leaves no bowler, registration, or squad row |
| D-09 | `registrations/createRoutes.test.ts` | a request body in the exact `API-05` shape works (a sample from the legacy docs) |

Mutation: run `npm run test:mutation` in `api/` for the new files and fix survivors.

## Steps

1. Add `GET /` and its test.
2. Prisma: new `Bowler` columns, `Payment`, global `omit`; update the existing list queries to still pass.
3. Request schema (`API-09*`) and the problem details body, with tests.
4. Bowler rules, phone and zip formatting, eligibility, with tests (pure functions).
5. Repository interface and in-memory version; `createRegistration` rules for create, with tests.
6. Append and the bowler patch, with tests.
7. Prisma repository and the Testcontainers tests.
8. Routes and `mountRoutes` entries (`POST`, `GET`); route tests.
9. OpenAPI document and its test (after the routes, so the schemas exist).
10. `npm run check` at the root; mutation run.

Each step ends green (lint, typecheck, tests).

## Not doing

- `PATCH` and `DELETE` (slices 2 and 3).
- The desk and paid profile helper (slice 2).
- A `warnings` array (D-107).
- Rate limit changes (`API-14`, `VC-02`).
- Status codes other than the legacy ones for not found and conflict (`API-12`, `VC-01`).
- Swagger UI or any new dependency for the document.
- Any web screen.
