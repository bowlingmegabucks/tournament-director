# Integration API

The legacy web API exists for one client: the third-party registration site. That site takes the bowler's entry and payment, then pushes the registration here. The desk app does not use this API.

**D-09:** the new API matches this contract as exactly as it can: same paths, bodies, status codes, and behavior. Any change the registration site would notice needs a reason, a discussion with the owner, and a written change doc for the vendor before we build it. The candidates are at the end of this page.

Source: `api/` (FastEndpoints). Production host: `api.bowlingmegabucks.com` (Azure App Service).

## Basics

| Item | Value |
| --- | --- |
| Version prefix | `/v1` on every endpoint route (`/v1/registrations`) |
| JSON | camelCase |
| Auth | Header `x-api-key: <key>`. One shared key from config `Authentication:ApiKey` (Key Vault secret `api-key`). Wrong or missing key on a protected route: 401 |
| Public routes | `GET /`, `GET /health`, `GET /v1/tournaments`, `GET /v1/tournaments/{id}` |
| Correlation | Optional `x-correlation-id` header is logged with the request |
| Errors | RFC 7807 problem details, `application/problem+json` |
| OpenAPI | `/openapi/v1.json`, Swagger UI |
| Rate limit | Fixed window per caller. Config: authenticated 50 per 60 s, anonymous 20 per 60 s, no queue. 429 when exceeded. See `API-14` |

## Endpoints

| ID | Method and path | Auth | Purpose |
| --- | --- | --- | --- |
| API-01 | `GET /` | none | `{ name: "Northeast Megabuck Tournament API", version: "v1", status: "OK", documentation: "/openapi/v1.json" }` |
| API-02 | `GET /health` | none | Health check (database, Key Vault, App Insights) |
| API-03 | `GET /v1/tournaments` | none | List of tournament summaries |
| API-04 | `GET /v1/tournaments/{id}` | none | Tournament detail with divisions, squads, sweepers. 404 if not found |
| API-05 | `POST /v1/registrations` | key | Create, or append when the bowler is already registered |
| API-06 | `GET /v1/registrations/{id}` | key | Registration detail. 404 if not found |
| API-07 | `PATCH /v1/registrations/{id}` | key | Change squads, sweepers, super sweeper, division, average; add a payment |
| API-08 | `DELETE /v1/registrations/{id}` | key | Delete. 204, 404, or 400 if scores exist |

## Shapes

### Tournament summary (`API-03`)

```json
{ "tournaments": [
  { "id": "uuid", "name": "text", "startDate": "2025-10-10", "endDate": "2025-10-12",
    "entryFee": 50.00, "bowlingCenter": "text" }
] }
```

### Tournament detail (`API-04`)

```json
{ "tournament": {
  "id": "uuid", "name": "text", "startDate": "2025-10-10", "endDate": "2025-10-12",
  "entryFee": 50.00, "bowlingCenter": "text",
  "divisions": [ { "id": "uuid", "name": "text", "minimumAge": null, "maximumAge": null,
                   "minimumAverage": null, "maximumAverage": 200, "gender": "Female" } ],
  "squads":   [ { "id": "uuid", "date": "2025-10-11T09:00:00", "entryFee": null } ],
  "sweepers": [ { "id": "uuid", "date": "2025-10-11T13:00:00", "entryFee": 25.00, "games": 3 } ]
} }
```

`gender` is the name (`"Male"`, `"Female"`) or `null`. A squad `entryFee` of `null` means the tournament fee applies; the client must work that out.

### Create registration (`API-05`)

```json
{ "registration": {
  "tournamentId": "uuid",
  "divisionId": "uuid",
  "average": 185,
  "squads": ["uuid"],
  "sweepers": ["uuid"],
  "superSweeper": false,
  "bowler": {
    "firstName": "text", "middleInitial": "J", "lastName": "text", "suffix": null,
    "address": { "street": "text", "city": "text", "state": "NC", "zipCode": "27601" },
    "email": "a@b.com", "phoneNumber": "919-555-1212",
    "usbcId": "1234-56789", "dateOfBirth": "1970-01-31", "gender": "M"
  },
  "payment": { "processingSystem": "Stripe", "confirmationCode": "text", "amount": 75.00 }
} }
```

Request checks, before the business rules:

| ID | Rule | Code |
| --- | --- | --- |
| API-09 | Registration body present | `Registration.Required` |
| API-09a | Tournament and division ids are UUIDs | `Registration.TournamentIdInvalid`, `Registration.DivisionIdInvalid` |
| API-09b | First and last name present | `Registration.BowlerFirstNameRequired`, `...LastNameRequired` |
| API-09c | Address object present (its fields are required by type) | `Registration.BowlerAddressRequired` |
| API-09d | Valid email | `Registration.BowlerEmailInvalid` |
| API-09e | USBC ID present | `Registration.BowlerUsbcIdRequired` |
| API-09f | At least one squad | `Registration.SquadsRequired` |

Then the create rules in [registrations.md](registrations.md) run. If the bowler is already registered for the tournament (`REG-01`), the endpoint runs **append** (`REG-10` to `REG-14`) with the same body.

| ID | Rule |
| --- | --- |
| API-10 | **Gender mapping:** `"M"` becomes Male; **anything else, including missing, becomes Female.** **Defect.** Missing gender should stay unknown (`VC-03`). For a returning bowler, D-05 keeps the stored gender when none is sent. |
| API-11 | Success: `201 Created`, body `{ "registrationId": "uuid" }`, `Location` pointing at `GET /v1/registrations/{id}`. Append also returns 201 with the existing id. |

### Registration detail (`API-06`)

```json
{ "registration": {
  "id": "uuid", "tournamentId": "uuid", "average": 185, "superSweeper": false,
  "bowler": { "id": "uuid", "firstName": "", "middleInitial": "", "lastName": "", "suffix": "",
              "address": { "street": "", "city": "", "state": "", "zipCode": "" },
              "email": "", "phoneNumber": "", "usbcId": "", "dateOfBirth": null, "gender": "Male" },
  "division": { "...": "same as tournament detail" },
  "squads": [ { "id": "uuid", "date": "...", "entryFee": null } ],
  "sweepers": [ { "id": "uuid", "date": "...", "entryFee": 25.00, "games": 3 } ]
} }
```

Payments are not included (`PAY-06`). SSN is never returned.

### Update registration (`API-07`)

```json
{ "registration": {
  "registrationId": "uuid",
  "divisionId": "uuid", "average": 190,
  "squadIds": ["uuid"], "sweeperIds": ["uuid"],
  "superSweeper": true,
  "payment": { "processingSystem": "Stripe", "confirmationCode": "text", "amount": 25.00 }
} }
```

`registrationId` in the body must equal the one in the path (`Registration.IdMismatch`). Rules `REG-30` to `REG-39` apply. Success: `204 No Content`.

## Errors

```json
{ "status": 400, "detail": "An error occurred while creating the registration.",
  "errors": [ { "code": "Registration.InvalidSquadIds", "description": "Invalid squad IDs",
                "InvalidSquadIds": "uuid, uuid" } ],
  "traceId": "..." }
```

| ID | Rule |
| --- | --- |
| API-12 | If **any** error is a validation error: 400. Otherwise: **500**, even for "not found" or conflict errors raised inside create, append, and update. Only GET by id and DELETE map "not found" to 404. **Defect, but kept (D-09)** until the vendor agrees to change it (`VC-01`). |
| API-13 | Unhandled exceptions: 500 with "An unexpected error occurred while processing your request." and a `traceId`. |
| API-14 | **Rate limiting runs before authentication**, so every caller is treated as anonymous: 20 requests per 60 seconds per IP. The 50-per-minute authenticated limit never applies. **Defect.** Fixing it changes what the vendor sees (`VC-02`). |

## Candidate vendor changes

Changes the registration site would notice. Under D-09, none of these ship until the owner approves it and the vendor has a change doc. Each change doc should give: what changes, why, before and after examples, the date it takes effect, and what the vendor must do (often nothing).

| ID | Change | Why | Vendor impact | Status |
| --- | --- | --- | --- | --- |
| VC-01 | Return 404 for "not found" and 409 for conflicts, not 500 (`API-12`) | 500 says "our server broke" when the request was the problem; retries are wasted | Must handle 404 and 409 if it branches on status | Not started |
| VC-02 | Apply the 50-per-minute limit to key holders (`API-14`) | Legacy meant 50; callers get 20 | None (looser limit) | Not started |
| VC-03 | Missing `gender` stays unknown instead of Female (`API-10`) | Stops wrong gender on records | `GET` may return `gender: null`; should send `"M"` or `"F"` | Not started |
| VC-04 | Reject a `PATCH` that leaves no qualifying squad (D-04) | No sweeper-only entries | New 400 for a request that used to pass | Not started |
| VC-05 | Accept entries that fail division limits, with a warning, instead of a 400 (D-01) | The site does not check division rules and has already taken payment | Requests that used to fail will pass; the response may carry warnings | Not started; needs a response shape for warnings |
| VC-06 | Reject division or squad ids from another tournament, and squads already complete, on create and append | Legacy accepts them by mistake | New 400s for bad requests | Not started |

Changes that are **not** vendor-visible and need no change doc: patch semantics for returning bowlers (D-05; the request is the same, we just stop erasing data), fixing the score-save and results crashes, and not logging personal data.
