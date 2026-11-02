# Plan: create tournament

Branch: `createTournament` (already checked out). Delete this file when the work is done.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| TRN-01 | In | Name required; trimmed, 1 to 100 characters (D-125) |
| TRN-02 | In | Start on or before end; one message on End (D-121) |
| TRN-03 | In | Fee above 0, at most 999.99, two decimals (D-125) |
| TRN-04 | In | Games whole, 1 to 99 (D-125) |
| TRN-05 | In | Finals ratio above 1, at most 99.9, one decimal |
| TRN-06 | In | Cash ratio above 1, at most 99.9, one decimal |
| TRN-07 | In | Bowling center required; trimmed, 1 to 100 characters |
| TRN-08 | Dropped | No `completed` field on the form or route (D-119) |
| TRN-09 | In | Super sweeper cash ratio required, at least 1 (D-13, D-122) |
| TRN-10 | In (create only) | Edit, delete: Later (D-12, D-15). Complete: Later (Q-03) |
| TRN-11, TRN-12 | Already done | The list shows the new row with no change |
| TRN-19 | In, new | `POST /v1/tournaments`: access, `201`, body, `Location` (D-121) |
| TRN-20 | In, new | Same name and start date gives `409` (D-123) |
| TRN-21 | In, new | `GET /v1/tournaments/{id}/settings` (D-126) |
| TRN-22 | In, new | New tournament button and the form page (D-120) |
| TRN-23 | In, new | Overview shows games and the ratios (D-126) |

## Decisions used

- D-09: the vendor routes keep their shape. `POST` and `settings` are web only.
- D-13, D-17, D-122: super sweeper ratio at least 1 on save; old zeros stay.
- D-19, D-102: hide the button without `tournaments.write`; the page needs sign-in.
- D-96, D-97: the route names `tournaments.write`; director and admin hold it; the API key does not.
- D-119: create only; `TRN-08` dropped.
- D-120: page at `/tournaments/new`; redirect to the overview with a toast.
- D-121: `201` + `Location`; `400 { message, errors }`; browser and server run the same rules.
- D-123: duplicate name and start date is `409`.
- D-124, D-125: any dates; limits refused, never rounded.
- D-126: web-only settings read, shown on the overview.
- D-31, D-32: bad stored row gives 500; database outage gives 503 (settings read).
- D-53: shared `Loading`. D-21: the tournament lives in the URL.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| TRN-02 | Two messages ("before" / "after") | One message on End: "End date must be on or after start date" | D-121 |
| TRN-08 | "Tournament is already completed" | Dropped: no `completed` input | D-119 |
| TRN-09 | No check, default 0 | Required, at least 1, no default | D-13, D-122 |
| TRN-01 | No duplicate check | Same name (trimmed, any case) and start date is refused | D-123 |
| TRN-01, 07 | No length limit beyond `longtext` | 1 to 100 characters, trimmed | D-125 |
| TRN-03 to 06 | Numeric box limits | Over-limit and extra decimals refused with a message | D-125 |

## API

All in `api/src/features/tournaments/`. Nothing here is vendor-visible.

### `POST /v1/tournaments` (TRN-19, TRN-01 to TRN-07, TRN-09, TRN-20)

- Access: `{ permission: 'tournaments.write' }`, no `apiKey`. Mounted as a second group on `/v1/tournaments` with `methods: ['POST']`, beside the public `GET` group (the registrations routes do the same, D-105).
- Body (Zod `createTournamentSchema`, strict: unknown keys refused so a stray `completed` is a `400`):

```json
{ "name": "Spring Classic", "startDate": "2027-03-12", "endDate": "2027-03-14",
  "entryFee": 60, "games": 5, "finalsRatio": 8, "cashRatio": 5,
  "superSweeperCashRatio": 4, "bowlingCenter": "Bowl-O-Rama" }
```

- `201`, header `Location: /v1/tournaments/{id}`, body `{ tournament: { id, name, startDate, endDate, entryFee, bowlingCenter, games, finalsRatio, cashRatio, superSweeperCashRatio } }`.
- `400 { message, errors: { name?, startDate?, endDate?, entryFee?, games?, finalsRatio?, cashRatio?, superSweeperCashRatio?, bowlingCenter? } }`. `message` is "Check the highlighted fields." with the first field message appended. Wrong type, missing field, or malformed JSON are `400` with the same shape. Messages:

| Field | Message |
| --- | --- |
| name | "Name is required" / "Name cannot be longer than 100 characters" |
| startDate, endDate | "Start date is required" / "End date is required" / "Enter a valid date" |
| endDate | "End date must be on or after start date" |
| entryFee | "Entry fee must be greater than $0" / "Entry fee cannot be more than $999.99" / "Use at most two decimal places" |
| games | "Must have at least one game" / "Games cannot be more than 99" / "Enter a whole number" |
| finalsRatio, cashRatio | "Finals ratio must be greater than 1" / "Cash ratio must be greater than 1" / "… cannot be more than 99.9" / "Use at most one decimal place" |
| superSweeperCashRatio | "Super sweeper cash ratio must be at least 1" / "… cannot be more than 99.9" / "Use at most one decimal place" |
| bowlingCenter | "Bowling center is required" / "Bowling center cannot be longer than 100 characters" |

- `409 { message, errors: { name: "A tournament with this name and start date already exists" } }`. The check and insert share one transaction; the name compares trimmed and ignoring case.
- `401` no sign-in, `403` API key or a user without the permission, `503` database down (existing `withDatabaseErrors`).
- Log one `info` line, fields first: `{ tournamentId }` then "Tournament created" (use `requestLogger`). Never log the body. Add the counter `tournament_director.tournaments.created` only if the observability skill calls for one (check `api-observability` in step 3).

### `GET /v1/tournaments/{id}/settings` (TRN-21)

- Public. `200 { settings: { games, finalsRatio, cashRatio, superSweeperCashRatio } }`.
- `400` not a UUID, `404 { message: "Tournament not found" }`, `500` bad stored row (logged with the id), `503` database down. Same as `TRN-15`.
- A stored super sweeper ratio of 0 is sent as 0 (D-17).

## Web

Mockups (open `docs/plans/create-tournament-mockups/index.html`): [list](create-tournament-mockups/list.html), [form](create-tournament-mockups/form.html), [overview](create-tournament-mockups/overview.html).

- **Tournaments page** (`TournamentsPage.tsx`): a "New tournament" link styled as the primary button beside the `<h1>`, inside `<Can permission="tournaments.write">`. It is a router `Link`, not a button, since it moves to another page.
- **New tournament page** (`NewTournamentPage.tsx`, route `tournaments/new` under `AppShell`, wrapped in `RequirePermission permission="tournaments.write"`; declared before `tournaments/:id` so `new` is not read as an id). Title "New tournament · Tournament Director".
  - Fields in order: Name, Start date, End date, Bowling center, Entry fee, Games, Finals ratio, Cash ratio, Super sweeper cash ratio. Visible labels. Dates are `type="date"`. Money and ratios are `type="text"` with `inputmode="decimal"` (a number input hides the "too many decimals" case); games is `inputmode="numeric"`. A hint under each ratio says "1 in N" in plain words.
  - Checks run on submit and again per field on blur. After a failed submit, focus moves to the first invalid field and an error summary (`role="alert"`) lists them. Each message is linked with `aria-describedby` and `aria-invalid`.
  - Save is disabled while saving and says "Saving…". Cancel is a link back to `/tournaments`.
  - Server `400`/`409` `errors` show under their fields. A `401`/`403`/`503`/network failure shows a `Toast` error (D-102, errors stay until dismissed).
  - On `201`: invalidate the tournaments query, navigate to `/tournaments/{id}`, and show a `Toast` "Tournament created" with `autoDismissMs`. (A toast must outlive the route change: put the message in router `state` and let the overview show it, or mount the toast in `AppShell`; the build step picks the one `Toast.tsx` already supports.)
- **Overview** (`TournamentOverview.tsx`): below the four fields, a "Format" group: Games, Finals ratio, Cash ratio, Super sweeper cash ratio, from `useTournamentSettings`. Own loading (`Loading`), error (`QueryError` with Try again), and no empty state (the route always has values). A stored 0 super sweeper ratio shows "0 (not set)".
- **Files**: `validateTournament.ts` (pure, the one rules module with the messages; the form and tests use it), `useCreateTournament.ts` (TanStack `useMutation`), `useTournamentSettings.ts`, `api.ts` gains `createTournament` and `fetchSettings`, `types.ts` gains the new types, CSS Modules next to each component. No `fetch` in components.
- **Mocks** (`web/src/mocks/handlers.ts`, `data.ts`): handlers for `POST /v1/tournaments` (runs the same validation, 409 for the demo duplicate) and `GET …/settings`; a `settings` factory. Under `dev:mocks` the mock user needs `tournaments.write` so the button shows.
- States covered: form (empty, filled, invalid, saving, server error), overview settings (loaded, loading, error), list (button shown, button hidden).

## Data

- `schema.prisma` already maps `games`, `finalsRatio`, `cashRatio`, `superSweeperCashRatio`. Add `completed Boolean @map("Completed")` to the `Tournament` model. No schema change in the database: nothing runs `prisma migrate`.
- `TournamentWriter` interface (`writer.ts`): `create(input): Promise<CreateResult>` where the result is `{ created: StoredTournament } | { duplicate: true }`. `prismaWriter.ts` runs the duplicate lookup and the insert in one `$transaction`, writes `Completed = false`, converts `YYYY-MM-DD` to midnight UTC (the read side cuts the same way), and sets the id with `crypto.randomUUID()`.
- `createApp` gains a `tournamentWriter` dependency; only `server.ts` builds the real one. An in-memory writer serves route tests.
- `TournamentSettingsRepository`-style read: add `getSettings(id)` to the existing `TournamentRepository` (in-memory and Prisma). A row whose games or ratios do not parse is a bad stored row (500), like `tournamentRow.ts`.
- `db:seed` needs no change (it already writes the five columns; confirm in step 1).

## Tests

Cite the rule ID in each test name.

| Rule | Test |
| --- | --- |
| TRN-01, 02, 03, 04, 05, 06, 07, 09 (rules) | `api/src/features/tournaments/createRequest.test.ts`: one case per rule and per limit (name empty / whitespace / 101 chars; end before start, equal dates pass; fee 0, 999.99 passes, 1000, three decimals; games 0, 99 passes, 100, 2.5; ratio 1 fails, 1.1 passes, 99.9 passes, 100, two decimals; super sweeper 0 fails, 1 passes; center like name; unknown key `completed` refused) |
| Same rules | `web/src/features/tournaments/validateTournament.test.ts`: the same table, the same messages |
| TRN-19 | `routes.test.ts`: `201` + `Location` + body; `400` shape; `401` signed out; `403` API key; `403` score keeper; `201` for director and admin |
| TRN-20 | `routes.test.ts`: `409` with the name error; case and spaces ignored; same name, different start passes. `prismaWriter.db.test.ts`: the transaction finds a stored duplicate; the row stores `Completed = false`, midnight dates, the five columns |
| TRN-21 | `routes.test.ts`: `200`, `400`, `404`, `500` (bad row), `503`; `prismaRepository.db.test.ts`: decimal mapping, a stored 0 ratio |
| TRN-22 | `NewTournamentPage.test.tsx`: required messages on submit, focus on the first invalid field, per-field messages, saving state, `201` navigates to the overview with the toast, `409` shows the name error, `403` shows a toast. `TournamentsPage.test.tsx`: button shown with `tournaments.write`, hidden without it and when signed out. `App` route test: signed-out visit to `/tournaments/new` goes to `/login`; a user without the permission sees "You do not have permission to view this page." |
| TRN-23 | `TournamentOverview.test.tsx`: shows the four values; loading; error with Try again; a stored 0 shows "0 (not set)" |
| Whole flow | `web/e2e/createTournament.spec.ts` (mocks): sign in, New tournament, submit empty, fix, save, land on the overview. Add `/tournaments/new` to `web/e2e/accessibility.spec.ts` (and open an error state before the scan) |
| Security | `api/src/shared/mountRoutes.test.ts` already covers method-split groups; add a case in `routes.test.ts` that `GET /v1/tournaments` stays public |

Run `npm run test:mutation` in `api/` for the rules module and the writer, and in `web/` for `validateTournament.ts`; fix survivors.

## Steps

1. API data: add `completed` to the Prisma model; `npm run db:generate`; confirm `db:seed` still passes. Green.
2. API rules: `createRequest.ts` (Zod schema, field messages, an `errors` builder) + `createRequest.test.ts`. Green.
3. API writer: `writer.ts`, `prismaWriter.ts`, in-memory writer, `prismaWriter.db.test.ts` (Docker). Green.
4. API routes: `POST` handler, 409, logging, wire into `createApp`/`server.ts` with the `tournaments.write` group; update `routes.test.ts`. Add the route to the OpenAPI document only if web-only routes appear there today (check `D-114`; the vendor list covers vendor routes only). Green.
5. API settings: `getSettings` on both repositories, the `settings` route, tests. Green.
6. Web rules and data: `validateTournament.ts`, types, `api.ts`, hooks, mocks, tests. Green.
7. Web form page and route; `RequirePermission`; toast hand-off; tests. Green.
8. Web list button and overview settings; tests. Green.
9. E2E and axe; mutation runs; `npm run check` at the root; run the app (`npm run dev`) and create a tournament as `director@example.com`-style seeded user to see it end to end.
10. Commit after each step with imperative messages that cite rules (for example "Add tournament create rules (TRN-01 to TRN-09)").

## Not doing

- Edit, delete, and complete tournament (D-12, D-15, Q-03).
- A `completed` field (D-119) or any way to set `Completed`.
- A database unique index on name and start date (schema change; waits for the 1.0.0 schema work, D-123).
- Adding divisions, squads, or sweepers during create. The new tournament starts empty; those features add their own commands.
- Games and ratios in the vendor routes (D-09).
- Copying a past tournament as a template (a possible later feature).
- Vendor change note: none needed, since no vendor-visible route changes.
