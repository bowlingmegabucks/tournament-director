# Plan: payouts

Branch: `payout` (made before this run; the skill's `migrate-payouts` name is not used). Delete this file when the work is done. Last feature for 1.0.0.

No legacy rules exist, so the rules are new, `PAY-01` to `PAY-19`. The record goes to `docs/requirements/payouts.md`.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| PAY-01 | In | `Payouts` row: payee per event, amount, note, paid |
| PAY-02 | In | Squad: inferred cashers who did not advance |
| PAY-03 | In | Sweeper: inferred cashers |
| PAY-04 | In | Super sweeper: inferred cashers |
| PAY-05 | In | Finals: seeding finalists per division |
| PAY-06 | In | Any entered bowler can be added; a note says why |
| PAY-07 | In | Typed amount, blank = none, above $0 to $99,999.99 |
| PAY-08 | In | "Same amount for all" (finals: for ticked) |
| PAY-09 | Dropped | Ties are not split (D-271) |
| PAY-10 | In | Gates (D-272) |
| PAY-11 | In | Complete tournament locks payouts |
| PAY-12 | In | Create, change, delete; one Save per event |
| PAY-13 | In | Paid flag, modal tick and list toggle |
| PAY-14 | In | Disclaimer, entry pages, and the full page |
| PAY-15 | In | Complete dialog lines |
| PAY-16 | In | `payouts.read`, `payouts.write` |
| PAY-17 | In | `payout-tables.sql` |
| PAY-18 | In | Tournament delete removes its payouts; other deletes already protect them |
| PAY-19 | In | Full list route, by-bowler totals route with `min` |
| PAY-20 | In | Results show the amount for inferred payees: squad, sweeper, super sweeper, seeding; TV page and print too; public (D-284) |
| PAY-21 | In | A save drops the cached public pages and publishes `payouts` (D-285) |
| 1099 report, SSN use, threshold, year totals | Later | Q-22, D-282 |

## Decisions used

D-267 table and key. D-268 inferred payees. D-269 any entered bowler, note rule. D-270 amount rules and the Same amount button. D-271 ties. D-272 gates. D-273 lock, paid-row confirm. D-274 paid flag. D-275 permissions. D-276 pages. D-277 finals. D-278 one Save per event. D-279 complete lines. D-280 deletes. D-281 SQL file. D-282 data only. D-283 disclaimer. D-284 results show the amount. D-285 cache drop and `payouts` message.
Existing: D-09, D-96, D-130 (frozen tournament), D-155 (serializable and retry), D-258, D-259 (complete-info), D-215 (danger style), D-07 (advancer is not a casher).

D-273 is fixed in the decisions file: a confirm is needed to **change the amount of** or **delete** a paid payout, not to create one. Un-ticking Paid and editing a note need none.

## Differs from legacy

Nothing: legacy has no payouts. D-282 notes the 1099 report stays open.

## Data

New file `api/prisma/payout-tables.sql`, safe to run again, no foreign keys (D-281):

```sql
CREATE TABLE IF NOT EXISTS `Payouts` (
  `Id`             CHAR(36)      NOT NULL,
  `TournamentId`   CHAR(36)      NOT NULL,
  -- squad | sweeper | superSweeper | finals
  `Source`         VARCHAR(16)   NOT NULL,
  -- Squads.Id, Divisions.Id (finals), or the tournament id (superSweeper)
  `EventId`        CHAR(36)      NOT NULL,
  `RegistrationId` CHAR(36)      NOT NULL,
  `Amount`         DECIMAL(7,2)  NOT NULL,
  `Note`           VARCHAR(200)  NULL,
  `Paid`           TINYINT(1)    NOT NULL DEFAULT 0,
  `CreatedAt`      DATETIME(3)   NOT NULL,
  `CreatedBy`      CHAR(36)      NOT NULL,   -- user id
  `UpdatedAt`      DATETIME(3)   NOT NULL,
  `UpdatedBy`      CHAR(36)      NOT NULL,
  PRIMARY KEY (`Id`),
  UNIQUE KEY `UX_Payouts_Event_Registration` (`Source`, `EventId`, `RegistrationId`),
  KEY `IX_Payouts_Tournament` (`TournamentId`)
);
```

- `schema.prisma` gets a `Payout` model (mapped names), then `npm run db:generate`. Prisma never migrates (D-30).
- Tests run this file through `src/test/` (as `scoreSchema.ts` does); `db:tables`, `resetDatabase.ts`, and the lifecycle stack include it.
- Amount maps to a string at the edge (`Decimal`), never a float: money is cents, handled as integer cents inside the pure code.
- A new `payouts.read` and `payouts.write` in `permissions.ts`. The director gets both by the existing "everything except withheld" rule; the admin too; `scoreKeeper` lists neither. The `GET /v1/me` permission list and the web `Permission` type gain them.

## API

All web-only, never vendor-visible, no API key (D-09, D-96). Base `/v1/tournaments/{id}`. General rate-limit bucket. A new feature folder `api/src/features/payouts/`.

| Route | Access | Does |
| --- | --- | --- |
| `GET /payouts` | `payouts.read` | `{ payouts: PayoutRow[], summary: { count, total, paidCount, unpaidCount, unpaidTotal }, tournamentComplete }` for the tournament, sorted by event date, then name |
| `GET /payouts/totals?min=` | `payouts.read` | `{ bowlers: [{ registrationId, name, divisionName, count, total, unpaidTotal }] }`, highest total first; `min` (decimal, optional) keeps totals at or above it. `400` for a bad `min` |
| `GET /payouts/squad/{sessionId}` `/sweeper/{sessionId}` `/super-sweeper` `/finals/{divisionId}` | `payouts.read` | The entry sheet (below) |
| `PUT` on the same four paths | `payouts.write` | Save the whole event |
| `PATCH /payouts/{payoutId}` | `payouts.write` | `{ paid: boolean }` → `200 { payout }` |

Money is a string with two decimals in and out (`"100.00"`); the request also accepts a number. `400` for an id that is not a UUID; `404` for an unknown tournament, session, division, or payout (a squad route given a sweeper id is a `404`).

**Entry sheet** (`GET`): `{ event: { source, eventId, label, divisionName? }, status: 'open' | 'notReady' | 'locked', reason: string | null, payees: Payee[], others: Other[], tournamentComplete }`.
- `payees`: every inferred payee, plus any non-inferred bowler who already has a saved payout. Each: `{ registrationId, name, divisionName, inferred, detail ("cashed, place 9" / "seed 2"), seed?, previousCasher?, payout: { id, amount, note, paid } | null }`. Order: as the results rank them (squad and sweeper by division number, then place; finals by seed).
- `others`: entered bowlers in the event who are not in `payees`, for the Add another bowler search: `{ registrationId, name, divisionName }`.
- `notReady`: gate closed (D-272): `payees` and `others` empty, `reason` set. `locked`: tournament complete; rows are read only, `reason` set. A gate never hides saved rows when locked.
- Inference runs the existing loaders (`loadSquadResults`, `loadSweeperResults`, `loadSuperSweeper`, `loadSeeding`) in steady (`full-game`) mode. A complete session ranks all games, so the lists cannot move after the gate opens.
  - squad: rows with `group = 'casher'` in every division;
  - sweeper and super sweeper: rows with `group = 'casher'`;
  - finals: the `finalist` rows of the division (`seeding`);
  - `others`: the session's entries (or the division's registrations for finals) not in `payees`.

**Save** (`PUT`): body `{ payouts: [{ registrationId, amount: string | number | null, note: string | null, paid: boolean }], confirmPaid?: boolean }` (at most 500 rows, one per registration).
- A row with a blank/null amount is deleted if it exists, else ignored. A row not in the request is untouched.
- Amount: up to two decimals, above 0, at most 99999.99. Notes are trimmed and at most 200 characters.
- A payee who is not inferred (not in the results list) needs a non-blank note; an inferred payee may have none.
- The registration must be entered in the event (squad or sweeper entries; super sweeper flag on the registration and entered in every sweeper (as the super sweeper lists); finals: a registration of that division). Otherwise per-row `400`.
- Gate and lock rechecked inside the transaction:
  - tournament complete → `409 { message, errors: { event: "This tournament is complete. Payouts are locked." } }`;
  - squad or sweeper not complete → `errors.event` "This squad is not complete. Complete it before you enter payouts." (sweeper twin);
  - super sweeper: no sweeper → "This tournament has no sweeper"; open sweepers → "N of M sweepers are not complete. Complete them before you enter super sweeper payouts.";
  - finals: no squad, or open squads → "N of M squads are not complete. Complete them before you enter finals payouts."
- A change of amount or a delete on a row that is saved with `paid = true`, without `confirmPaid` → `409 { message, warnings: { paid: "…" }, paidRows: [{ registrationId, name, from, to }] }` and nothing is saved. With `confirmPaid: true` it goes through. Un-ticking Paid, a note edit, and a new row need none. If the set of paid rows that would change differs from what the page saw it still just warns again (the request carries no counts; the check runs inside the transaction).
- Per-field `400`: `{ message, errors: { "amount:<registrationId>": msg, "note:<registrationId>": msg } }`.
- One serializable transaction with retry (D-155, D-278), sets `UpdatedAt` and `UpdatedBy` (the user id) and `CreatedAt` and `CreatedBy` on new rows. `200 { sheet }` holds the fresh sheet.
- Log: "Payouts saved" with the actor id, tournament id, source, event id, counts (created, changed, deleted) and the new total. Never a name or a note (see `api-observability`).

**Paid toggle** (`PATCH /payouts/{payoutId}`): `409` when the tournament is complete; no confirm.

**Complete-info** (`GET /complete-info`, existing): adds `payoutCount`, `unpaidPayoutCount`, `unpaidPayoutTotal` (string). `POST /complete` is unchanged (no block).

**Tournament delete** (existing): the one transaction also deletes `Payouts` of the tournament (D-280).

**Results carry the amount** (PAY-20, D-284). These existing routes stay public and web-only; only the rows change:
- `ResultsDeps` gains `payouts: PayoutAmounts`, a read-only port with `listByTournament(tournamentId)` returning `{ source, eventId, registrationId, amount }` (amount only; no note, paid flag, or user). One query per request; the loaders index it by source, event, and registration.
- Rows gain `payout: string | null` in `squadRowSchema`, `sweeperRowSchema`, `superSweeperRowSchema`, and `seedingRowSchema` (and the web copies in `web/src/features/results/types.ts`; change both together, as the file header says). It is set only when the row is an inferred payee (`casher`, or seeding `finalist`) and a payout is saved; every other row, and a hand-added payee, gets `null`.
- Squad: key `squad`/session id. Sweeper: `sweeper`/session id. Super sweeper: `superSweeper`/tournament id. Seeding: `finals`/division id. The TV feed (`loadLiveResults`) gets it from the same `toSquadResults` and sweeper and super sweeper builders.
- No change to the wire for the vendor (D-09), and `payouts.read` is not needed to see an amount.

**Cache and stream** (PAY-21, D-285): `ChangeKind` gains `payouts`. The save route gets the `ScoreCache`, the finals cache keys, and the event hubs, and after the commit: drops the session's cached pages (`dropSession`) for a squad or sweeper save; drops the cached finals, at-large, seeding, and super sweeper pages and the TV feed (`dropTournament`); then publishes `payouts` to the session stream (squad and sweeper) and the tournament stream (all four, with the session id where there is one). A paid toggle changes no public page and publishes nothing. The lane and score pages ignore the new kind. I check the exact finals cache keys in `results/routes.ts` while building.

## Web

Feature folder `web/src/features/payouts/`. Mockups: [docs/plans/payouts-mockups/index.html](payouts-mockups/index.html) (entry squad, entry finals, event tab, full list, complete dialog).

- `types.ts`, `api.ts` (calls `apiFetch`), hooks: `usePayoutSheet(source, eventId)`, `useSavePayouts`, `usePayouts`, `usePayoutTotals(min)`, `useSetPaid`.
- **Event page** `EventPayoutsPage` (`source` prop): heading, disclaimer, summary (payouts, total, not paid), "Enter payouts" button (needs `payouts.write`, disabled with the reason when `status ≠ open`), and a read-only table of saved rows. Routes:
  - `squads/:sessionId/payouts` and `sweepers/:sessionId/payouts` (a **Payouts** tab on the session portal beside Results; hidden without `payouts.read`);
  - `super-sweeper/payouts` (a "Super sweeper payouts" link on the Sweepers page);
  - `seeding/:divisionId/payouts` (a "Pay finals" link per division on the Seeding page; the page title says "Finals payouts: Open division").
- **Phone layout of the entry sheet** (see the phone section of `entry-squad.html`): below 40 rem the dialog is a full-screen sheet with a sticky header (title, Close) and a sticky footer (total, Save). Each bowler is a card: name and detail on the left, a `$` amount box on the right (`inputmode="decimal"`, labelled with the bowler's name), then Paid on the left and an "Add note" link on the right. The note opens from the link for an inferred payee and is always open and required for a hand-added one. Same amount and Add bowler sit side by side under a one-line disclaimer with a Details toggle. From 40 rem it is the four-column row of the other mockups.
- **`PayoutSheetDialog`** (native `<dialog>`, shared `Dialog.module.css`): rows with Amount, Note, Paid; inferred rows first; a "added by hand" tag and a required note for others; the running total; "Same amount for all" (finals: "for ticked") opens `SameAmountDialog` (lists who gets it; replaces typed values; fills boxes only); "Add another bowler" opens `AddBowlerDialog` (search over `others`, each Add makes a row). Save sends all rows with a value or a saved payout. On `409 warnings` it shows `ConfirmPaidDialog` (tick "I know this was already paid out") and resends with `confirmPaid: true`. Per-field errors sit by the field (`aria-describedby`); focus goes to the first one. Not ready and locked states as the mockup. A form that sends data uses `useLeaveGuard(dirty)` and `LeaveDialog`; the dialog's Cancel with typed values asks first (CLAUDE.md).
- **Full page** `PayoutsPage` at `tournaments/:id/payouts` (sidebar **Payouts**, needs `payouts.read`): tabs **By payout** (table; event and paid filters; the Paid cell is a real checkbox that saves at once with `PATCH /payouts/{id}`, only for a user with `payouts.write` on an open tournament; otherwise it is plain text, "✓ Paid" or "Not paid", never a disabled checkbox; a refused save un-ticks the box and shows a Toast) and **By bowler** (table; "Earned at least $" box calls `totals?min=`, debounced). Loading with `Loading`, error with `QueryError`, empty sentences as the mockup. Tables reflow to cards on a phone.
- **`PayoutDisclaimer`**: the D-283 sentence, on the event page, the dialog (above Save), and the full page.
- **Results pages show the amount** ([results-amount.html](payouts-mockups/results-amount.html)): `ResultsTable`, `SweeperTable`, `SuperSweeperTable`, `SeedingTable` get a **Payout** column that shows only when some row of the table has an amount (a badge after the tag on a phone card); `formatMoney` in `src/shared/` (`$100.00`); the TV page rows show it at the right (large type); `PrintResults` and `PrintFinals` carry it. The squad and sweeper Results tabs and the TV refetch on a `payouts` message (they already follow the stream, D-241); Seeding and super sweeper wait for their 15 s poll.
- Complete dialog (`CompleteTournamentDialog`): reads the three new fields and adds the two lines.
- Access: `<Can permission="payouts.read">` around the links and tab, `RequirePermission` around routes; the Enter button and toggles need `payouts.write`. The score keeper sees nothing.
- Mocks: `src/mocks/` gets handlers and `data.ts` factories for the sheet, list, and totals (the PR build runs on mocks).
- a11y: add the new routes to `web/e2e/accessibility.spec.ts`, with the dialog open.
- Tab navigation and sidebar tests; the squad portal tab for `sweepers` too.

## Tests

| Rule | Test |
| --- | --- |
| PAY-01 | `api/src/features/payouts/prismaPayouts.db.test.ts`: "stores a payout with its key (PAY-01)"; "a second row for the same payee and event is refused (PAY-01)" |
| PAY-02 | `payeesOf.test.ts`: "a squad lists its cashers and not its advancers (PAY-02)"; `sheetRoutes.test.ts` |
| PAY-03, PAY-04 | `payeesOf.test.ts`: sweeper and super sweeper cashers |
| PAY-05 | `payeesOf.test.ts`: finalists in seed order |
| PAY-06 | `savePlan.test.ts`: "a payee the results did not infer needs a note (PAY-06)"; "a bowler not entered is refused (PAY-06)"; `PayoutSheetDialog.test.tsx`: add another bowler, required note |
| PAY-07 | `savePlan.test.ts`: amount bounds, cents, blank deletes, zero refused; `money.test.ts` |
| PAY-08 | `SameAmountDialog.test.tsx` (squad fills all inferred; finals fills ticked) |
| PAY-10 | `savePlan.test.ts` and `saveRoutes.test.ts`: each gate's refusal and message; `prismaPayouts.db.test.ts` with real completes |
| PAY-11 | `saveRoutes.test.ts`: complete tournament refuses save and toggle; `sheetRoutes.test.ts`: status `locked` |
| PAY-12 | `prismaPayouts.db.test.ts`: create, change, delete in one save; a refusal saves nothing; two saves race; `saveRoutes.test.ts` paid-row confirm and `confirmPaid` |
| PAY-13 | `paidRoutes.test.ts`; `PayoutsPage.test.tsx` toggle; dialog tick |
| PAY-14 | `PayoutDisclaimer` is in the three screens' tests |
| PAY-15 | `completeInfo` tests (db and route); `CompleteTournament.test.tsx` lines |
| PAY-16 | `roles.test.ts` (director and admin hold both, score keeper neither); `app` access tests: 401, 403 for score keeper, API key refused; web `Can` tests |
| PAY-17 | `payoutSchema.test.ts` (as `scoreSchema.test.ts`); `createTables.test.ts` |
| PAY-18 | `prismaWriterDelete.db.test.ts`: payout rows go with the tournament |
| PAY-19 | `listRoutes.test.ts`, `totalsRoutes.test.ts` (`min`, sort, bad `min`, empty); `PayoutsPage.test.tsx` |
| PAY-20 | `loadResults.test.ts`: "a casher row carries the saved amount; an advancer, an other, and a hand-added payee carry null (PAY-20)"; `loadFinals.test.ts` (super sweeper, seeding); `loadLiveResults.test.ts`; `results.db.test.ts` and `finals.db.test.ts` with a saved payout; route tests show no note or paid flag; web `ResultsTable`, `SweeperTable`, `SuperSweeperTable`, `SeedingTable`, `PrintResults`, `PrintFinals`, and TV tests: column appears only with an amount |
| PAY-21 | `saveRoutes.test.ts`: "a save drops the cached pages and publishes payouts (PAY-21)"; "a paid toggle publishes nothing"; `liveEvents.test.ts` and `useEventStream` tests for the new kind; `ScoresPage` and lane page ignore it |
| E2E | Playwright (mocks) one journey: open a completed squad's Payouts tab, Same amount, add a bowler with a note, Save; and axe |
| Lifecycle | `web/lifecycle/`: add a payouts stage after each squad, the sweepers, and the finals (see Steps 11); the Complete dialog lines |

Mutation: `npm run test:mutation:fast` for the pure files (`payeesOf`, `savePlan`, `money`, `totals`).

## Steps

Each step ends with lint, typecheck, and tests green.

1. Permissions: add `payouts.read` and `payouts.write`; update `roles.test.ts`, `/v1/me` tests, web `Permission` type.
2. `payout-tables.sql`, Prisma model, test schema, `db:tables`, `resetDatabase`; `payoutSchema.test.ts`.
3. Pure code with unit tests: `money.ts` (cents in and out), `payeesOf.ts`, `savePlan.ts` (validation, gates, paid-row warning), `totals.ts`.
4. Prisma repository and writer (`prismaPayouts.ts`): sheet facts, list, totals, save in one serializable transaction with retry, paid toggle; db tests.
5. Routes (`sheetRoutes`, `saveRoutes`, `listRoutes`, `paidRoutes`), mount in `app.ts` with the access comment `PAY-16, D-275`; route tests; OpenAPI is not changed (web-only).
6. Complete-info fields and tournament delete tidy-up; tests.
6a. Results carry the amount: the `PayoutAmounts` port and its Prisma read, the four row schemas, the loaders and the TV feed, `payout: null` in every fake and factory; then the cache drop and the `payouts` event kind (PAY-20, PAY-21); tests.
7. Web: types, api, hooks, mocks and factories, `money` helpers.
7a. Web: the Payout column and badge in the four results tables, the TV rows, and the two print pages; the `payouts` message refetches; tests.
8. Web: `PayoutSheetDialog` and its three small dialogs; tests.
9. Web: event page, the Payouts tab (squad and sweeper portals), the super sweeper link and "Pay finals" links, routes.
10. Web: full page with both views, sidebar link; complete dialog lines; axe and e2e.
11. Lifecycle: payouts after each squad, the sweepers, super sweeper, and finals; the completed-tournament lock and the Complete dialog lines. Update `docs/plans/lifecycle-e2e.md`.
12. `npm run check`, `test:e2e`, mutation (fast) for the new pure files; fix survivors.
13. Docs (Phase 5): requirements, migration status, `v1-requirements.md`, `docs/deployment.md` (run `payout-tables.sql` before deploying), `docs/api-standards.md` database section, CLAUDE.md status line (item 47), delete plan and mockups.

## Not doing

- The 1099 report, SSN reads, the dollar limit, and year totals (D-282, Q-22).
- A printable payout sheet or export.
- Splitting ties (D-271) or computing prize amounts from a table (D-270).
- A finish place (D-277).
- A history of changes to a payout (the row keeps only the last editor and time; the log line holds the counts).
- Live updates of the payout entry screens over the event stream: a save refetches the sheet and the list, and a second desk sees changes on the next load. (The public results and the TV do update, PAY-21.)
- Showing a hand-added payout, a note, or the paid flag in the results (D-284).
- Payouts for bowlers who are not registered in the tournament.
- Reopening a complete tournament to change payouts (D-130).
