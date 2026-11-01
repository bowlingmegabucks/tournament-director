# Registration API (create, append, get)

Built on branch `migrate-registration-create`, slice 1 of 3 (D-112). Migration source: [docs/migration/integration-api.md](../migration/integration-api.md), [registrations.md](../migration/registrations.md), [bowlers.md](../migration/bowlers.md), and [payments.md](../migration/payments.md).

These are the legacy routes the registration site calls, rebuilt so the site notices nothing (D-09). The desk will call the same routes. **Slice 2** is `PATCH /v1/registrations/{id}` (`API-07`) and **slice 3** is `DELETE` (`API-08`); until then both answer 404.

## Who calls it, and how it behaves

Access is `{ permission: 'registrations.write', apiKey: true }` for `POST` and `{ permission: 'registrations.read', apiKey: true }` for `GET` (D-105). The registration site sends `x-api-key`; staff sign in. One path carries two access labels, one per method (`methods` on a route group, `mountRoutes.ts`).

Two kinds of caller (D-106): a **paid** request carries a payment whose `processingSystem` is not `Manual` and whose `amount` is above 0; any other request is a **desk** request. In slice 1 both get the same checks (the legacy ones plus D-108). They differ on `PATCH`, in slice 2 (D-04, D-10).

## Fields

`POST /v1/registrations` takes `{ registration: { tournamentId, divisionId, average, squads, sweepers, superSweeper, bowler, payment } }` as `integration-api.md` shows. `squads`, `sweepers`, and `superSweeper` are required; `average` and `payment` may be null or absent. `GET` returns the registration with its bowler, division, squads, and sweepers in the vendor shapes. Never returned: the SSN (`BWL-17`) and payments (`PAY-06`).

## Rules

| ID | Requirement | Differs from legacy | Tests |
| --- | --- | --- | --- |
| API-01 | `GET /` is public and answers the text `Northeast Megabucks API`. | Yes: legacy sent a JSON object (D-111) | `api/src/app.test.ts` |
| API-02 | `GET /health` answers liveness and `GET /ready` checks the database. | Yes: legacy `/health` also checked the database, Key Vault, and App Insights (D-111, D-32) | `api/src/app.test.ts`, `shared/readyRoutes.test.ts` |
| API-05 | `POST /v1/registrations` creates a registration, or appends to the bowler's existing one in the tournament. | | `api/src/features/registrations/vendorRoutes.test.ts`, `register.test.ts`, `prismaWriter.db.test.ts` |
| API-06 | `GET /v1/registrations/{id}` returns the registration. 404 problem body when unknown, 400 when the id is not a UUID. | | `api/src/features/registrations/vendorRoutes.test.ts`, `prismaWriter.db.test.ts` |
| API-09 to API-09f | Request checks run first and report every failure with its code: body present, UUID tournament and division ids, first and last name, address, valid email, USBC ID, at least one squad. A payment the table cannot hold (code over 43 characters with the system prefix, amount over 999.99) is `Payment.Invalid`. | Payment checks: legacy failed in the database with a 500 (D-02) | `api/src/features/registrations/request.test.ts`, `vendorRoutes.test.ts` |
| API-10 | A new bowler's gender is `"F"` for Female and `"M"`, a missing value, or anything else for Male. A returning bowler with no gender sent keeps the stored one. | Yes: legacy made everything but `"M"` Female (D-113, D-05) | `api/src/features/registrations/bowler.test.ts`, `register.test.ts` |
| API-11 | Success is `201` with `{ registrationId }` and a `Location` header for `GET /v1/registrations/{id}`. Append answers the same, with the existing id. | | `api/src/features/registrations/vendorRoutes.test.ts` |
| API-12 | Any validation error gives `400`; any other error gives `500`, including an unknown tournament, division, or bowler record duplicate. The body is problem details: `status`, `detail`, `errors: [{ code, description }]`, `traceId` (the `x-request-id`), plus our `message`. | Kept as legacy (D-09, VC-01). `message` is new. Business-rule codes are our own; the descriptions are legacy's | `api/src/features/registrations/vendorRoutes.test.ts`, `problem.ts` through the route tests |
| API-13 | An unexpected error gives `500 { message: "Internal server error" }` and is logged. | Body differs from legacy's problem details | `api/src/shared/middleware.test.ts` |
| REG-01 | A bowler (found by exact USBC ID) with a registration in the tournament makes the request an append. Two bowler records with one USBC ID give a `500` (`Bowler.Duplicate`) and no write. | Yes: the empty-USBC-ID lookup defect cannot happen, since the API requires an ID (D-02) | `api/src/features/registrations/register.test.ts`, `prismaWriter.db.test.ts` |
| REG-02 | The bowler passes the bowler rules (`BWL-*` below), checked on the bowler as it will be stored. | | `api/src/features/registrations/register.test.ts`, `bowlerRules.test.ts` |
| REG-03 | The registration has at least one qualifying squad, counting squads already on it. | | `api/src/features/registrations/register.test.ts` |
| REG-04 (`04a` to `04h`) | Average, birth date, age, and gender checks against the division, with the legacy messages. Age counts on the tournament start date. A failure is a `400` for every caller. | Yes: D-01 said warn; create and append keep the 400 (D-107). Append checks the stored bowler plus the fields sent (D-05) | `api/src/features/registrations/eligibility.test.ts`, `register.test.ts` |
| REG-05 | A handicap division needs a USBC ID: `400` otherwise. | Same (D-107) | `api/src/features/registrations/eligibility.test.ts` |
| REG-06 | A super sweeper entry needs every sweeper of the tournament. | | `api/src/features/registrations/register.test.ts` |
| REG-07 | A bowler with this USBC ID in any tournament is reused, and only the fields the request sends with a value change. An empty string or null changes nothing. The SSN is never read or written; a new bowler gets an empty one. | Yes: legacy overwrote every field and erased the SSN (D-05) | `api/src/features/registrations/bowler.test.ts`, `register.test.ts`, `bowlerRow.test.ts`, `prismaWriter.db.test.ts` |
| REG-08 | A payment sent with the registration is saved with the server's time (`PAY-04`). | | `api/src/features/registrations/register.test.ts`, `prismaWriter.db.test.ts` |
| REG-10 to REG-14 | Append: add the new squads and sweepers to the existing registration; move it to the requested division; keep the old average when none is sent; take the request's `superSweeper`; patch the bowler; add the payment. A squad or sweeper already on the registration is a `400` ("The specified squads are already registered."). | Yes: patch, not replace (D-05) | `api/src/features/registrations/register.test.ts`, `vendorRoutes.test.ts`, `prismaWriter.db.test.ts` |
| REG-32, REG-33 (on create and append) | Every new squad and sweeper must exist, belong to the tournament, be the right kind, and be open; the division must belong to the tournament. A failure is a `400` ("Invalid squad IDs", "Cannot add squad(s) that are already complete.", "Division ID is not valid for the tournament."). An unknown tournament or division is a `500`. | Yes: legacy accepted these (D-108, VC-06) | `api/src/features/registrations/register.test.ts` |
| BWL-01 to BWL-08, BWL-10 | First and last name required; middle initial at most one character; street needs city, a two-letter state, and a 5 or 9 digit zip; a city needs a state; email, phone (as sent), birth date in the past, USBC ID like `1234-56789`. Legacy messages. | | `api/src/features/registrations/bowlerRules.test.ts` |
| BWL-07a | Phone is stored as ten digits (country code `1` and extensions dropped), or empty. Zip is stored as digits only. | | `api/src/features/registrations/bowler.test.ts` |
| BWL-09 | Age is whole years on a date. | | `api/src/features/registrations/eligibility.test.ts` |
| BWL-15, BWL-16a | A bowler is found by exact USBC ID. | See `REG-07` (D-05) | `api/src/features/registrations/register.test.ts` |
| BWL-17 (write side) | The client omits `SocialSecurityNumber` from every read, create sends `''`, and no update names it. | | `api/src/features/registrations/prismaWriter.db.test.ts` |
| PAY-02 | The stored payment code is `<processingSystem>_<confirmationCode>`. | | `api/src/features/registrations/register.test.ts`, `prismaWriter.db.test.ts` |
| PAY-03 | A payment code already on file is a retry: `201` with the registration that holds it, and nothing else is written or checked. | Yes: legacy gave a database error and a 500 (D-109) | `api/src/features/registrations/register.test.ts`, `vendorRoutes.test.ts` |
| PAY-04 | The payment time is the server's UTC time. | | `api/src/features/registrations/register.test.ts` |
| PAY-05, PAY-06 | No amount check against fees; `GET` omits payments. | | `api/src/features/registrations/vendorRoutes.test.ts` |
| D-114 (new) | `GET /openapi/v1.json` (public) returns an OpenAPI 3.1 document built from the routes' Zod schemas. It covers every vendor route listed in `openapi.ts`; a test fails when the list and the document disagree or a listed route does not answer. | New (D-114) | `api/src/openapi/openapi.test.ts` |
| Atomic save (new) | One save writes the bowler, registration, squad links, and payment in one transaction: a failure leaves nothing behind. | New | `api/src/features/registrations/prismaWriter.db.test.ts` |

## API

| Route | Request | Response | Errors | Vendor-visible |
| --- | --- | --- | --- | --- |
| `GET /` | | `200` text | | Yes (D-111) |
| `GET /openapi/v1.json` | | `200` OpenAPI 3.1 | | New |
| `POST /v1/registrations` | `API-05` body | `201 { registrationId }`, `Location` | `400` problem (checks, eligibility, ids); `401` no or wrong key and no sign-in; `403` signed in without `registrations.write`; `500` problem (unknown tournament or division, duplicate bowler record, unexpected); `503` database down | Yes |
| `GET /v1/registrations/{id}` | | `200 { registration }` (`API-06`) | `400` not a UUID; `401`; `403` without `registrations.read`; `404` problem | Yes |

`403` for a user without the permission is new and vendor-invisible: the registration site holds the key.

## Screens

None. The desk screens that call these routes come with add-registration.

## Vendor notes (to send)

Two changes the registration site can notice, both small: a bowler sent with no gender is now stored as Male instead of Female (send `"M"` or `"F"`), and a request whose division or squad belongs to another tournament, or whose squad is already complete, now gets a `400` instead of being saved (D-108). A repeated payment code now returns `201` with the same registration instead of a `500` (D-109).
