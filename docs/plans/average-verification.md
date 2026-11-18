# Plan: average verification

Branch: `migrate-average-verification`. Delete this file when the work is done.

New feature, no legacy twin. Rules get the prefix `AVG`. Mockups: [average-verification-mockups/index.html](average-verification-mockups/index.html).

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| AVG-01 | In | `AverageVerification` table, one row per registration (D-287) |
| AVG-02 | In | Averages page and menu item, handicap divisions only, filter Unverified or All (D-295) |
| AVG-03 | In | Verify (D-291) |
| AVG-04 | In | Adjust: whole 1 to 300, note required, at most 500 characters (D-291) |
| AVG-05 | In | Adjusted average outside the division's limits is refused (D-291) |
| AVG-06 | In | Scores exist: `409` warning, confirm; stronger text when a scored session is complete (D-294) |
| AVG-07 | In | Re-adjust and remove the check (D-292) |
| AVG-08 | In | A changed average or division clears the verification (D-290) |
| AVG-09 | In | Handicap uses verified, else provided (D-288) |
| AVG-10 | In | Permission `averages.verify` for director and admin (D-292) |
| AVG-11 | In | Registrations page: check mark, adjusted number, Details popup (D-295) |
| AVG-12 | In | Lane page: average in use, marker (D-293) |
| AVG-13 | In | Marker on results, scores, score entry, and TV pages (D-293) |
| AVG-14 | In | Recap dialog warning (D-293) |
| AVG-15 | In | Complete tournament: page read only, saves answer `409` (D-294) |
| AVG-16 | In | A handicap division needs an average, including the vendor routes (D-289, VC-08) |
| AVG-17 | In | Check-in sheet prints the status (D-296) |
| AVG-18 | In | Completing a squad or sweeper warns about unverified scored bowlers (D-297) |
| AVG-19 | In | Saving a verification sends an `averages` event and drops the caches (D-298) |
| Verify all | Dropped | Owner chose one bowler at a time (D-295) |
| REG-04a, REG-16, SCR-07 | Already done | Changed by AVG-16, AVG-08, AVG-09; update their notes |

## Decisions used

- D-287: new table, provided average stays on `Registrations`.
- D-288: one function returns the average in use.
- D-289: handicap division needs an average; vendor 400 (`VC-08`); old rows stay editable.
- D-290: a changed average or division clears the row.
- D-291: verify and adjust rules and messages.
- D-292: `averages.verify`; re-adjust and remove allowed; log without the note.
- D-293: marker on every screen that shows handicap or scores; recap warning.
- D-294: scores warning; complete tournament frozen.
- D-295: Averages page layout, Registrations column.
- D-296: check-in sheet.
- D-297: complete warning.
- D-298: `averages` event.
- Reused: D-96 (permissions), D-100 (new tables only), D-130 (complete freeze), D-201 (confirm pattern), D-218 and D-243 (events carry no data), D-232 (cache drop), D-285 (the `payouts` pattern this copies).

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| REG-04a | Average required only when the division has a min or max average | Also required when the division has a handicap percentage (vendor too) | D-289 |
| REG-16 | A changed average only changes the column | Also deletes the verification row | D-290 |
| SCR-07 | Handicap reads `Registrations.Average` | Reads the average in use | D-288 |
| REG-15 | A division change keeps nothing else tied to the average | Also deletes the verification row | D-290 |

## API

All new routes are web-only, beside the vendor routes, which stay untouched except VC-08.

| Route | Access | Does |
| --- | --- | --- |
| `GET /v1/tournaments/{id}/averages` | `registrations.read` | Rows for handicap-division registrations: `registrationId`, `bowlerName`, `divisionName`, `usbcId`, `providedAverage`, `status` (`unverified`, `verified`, `adjusted`), `verifiedAverage`, `note`, `verifiedBy`, `verifiedAt`, plus `locked` (tournament complete) and, per row, `hasScores`. `404` for an unknown tournament. |
| `PUT /v1/tournaments/{id}/registrations/{registrationId}/average-check` | `averages.verify` | Body `{ action: 'verify' }` or `{ action: 'adjust', average, note, confirmWarnings? }`. `200` with the new row. `400 { message, errors }` for a bad number, a missing note, a limit breach (field `average`), or an unverifiable null average. `404`. `409 { message, warnings }` when scores exist and `confirmWarnings` is missing (text per D-294). `409` when the tournament is complete. |
| `DELETE /v1/tournaments/{id}/registrations/{registrationId}/average-check` | `averages.verify` | Removes the row. Same `409` rules (a removal changes handicap when the adjusted number differs from the provided one). |

Changed existing routes:

- Create, append, and `PATCH` (vendor) and the desk add and edit routes: the average-required check (AVG-16). Vendor shapes keep their wording; only the new 400 appears (`VC-08`, vendor note before release).
- Edit and `PATCH`: delete the verification row when the average value or the division changes (AVG-08).
- Lane page read: bowler rows gain `average` (in use), `averageStatus` (`verified`, `adjusted`, `unverified`, or `none` for a scratch division), `providedAverage`, and `averageNote`. The check-in sheet and the marker read these.
- Results, scores, score entry, and TV feeds: each bowler row gains `unverified: boolean`, nothing else. Handicap in those feeds already comes from one place; it moves to the in-use function (AVG-09).
- Squad and sweeper complete routes: `409 warnings` per D-297.
- Recap sheets route: counts `withoutVerifiedAverage` next to `withoutLane`.

New change kind `averages` on the session stream (every session the registration is on) and the tournament TV stream. Handlers drop the same caches the `payouts` save drops.

## Web

Mockups: `averages.html`, `registrations.html`, `lanes.html`, `results.html`, `tv.html`.

- **Averages page** `/tournaments/{id}/averages`, a sidebar link after Registrations. Components in `web/src/features/averages/`: `AveragesPage`, `AdjustDialog`, `AverageDetails` (popup, shared with Registrations). `useAverages`, `useAverageCheck`. States: loading, error with Try again, two empty sentences, read-only (no permission or complete). Table reflows to stacked rows on a phone. Buttons hide without `averages.verify` (`Can`, D-102).
- **Marker** `AverageMarker` in `web/src/shared/`: the "Avg not verified" outline chip, text only (no symbol), tokens only. Used by the lane page, results pages, scores tab, score entry, TV, Registrations (long form there: "Not verified" or "No average").
- **Registrations page**: a new Average column per the mockup.
- **Lane page**: shows the in-use average and the marker. The recap dialog adds the unverified notice. The complete-squad dialog shows the D-297 warning and a "Complete anyway" button. The check-in sheet gets an "Average check" column on a squad sheet.
- **Live**: every screen above already refetches on events; add `averages` to the kinds each one reacts to (the lane page, results tabs, score entry, scores tab, TV). Seeding and super sweeper keep their poll.
- No new tokens. The marker uses `--color-accent`.

## Data

`api/prisma/average-tables.sql` (run once per database before deploying; added to `npm run db:tables`, `docs/deployment.md`, and the CLAUDE.md script list):

```
AverageVerification
  RegistrationId  char(36) primary key (no foreign key, like Payouts: WinForms owns Registrations; our delete routes remove the row)
  ProvidedAverage int null
  VerifiedAverage int not null
  Note            varchar(500) null   -- null means verified as provided
  VerifiedBy      varchar(36) not null  -- the user id
  VerifiedAt      datetime(6) not null
```

`ProvidedAverage` is a copy of `Registrations.Average` at the moment of the check (null when the bowler had none), so the Details popup shows what was checked even if WinForms edits the column later. A changed provided average from this app deletes the row (AVG-08); if WinForms changes it behind our back, the page shows the row's own provided number. Status: no row is unverified; a row with no note is verified; a row with a note is adjusted. A verify copies the provided number into `VerifiedAverage`. Prisma model `AverageVerification`; run `npm run db:generate`.

Types: `averageInUse(provided, verification)` in `api/src/features/averages/`. The web `Average` types match the API.

## Tests

| Rule | Test |
| --- | --- |
| AVG-01 | `averages/prismaStore.db.test.ts`: one row per registration, removed by the desk and vendor delete; `test/averageSchema.test.ts` |
| AVG-02 | `averages/routes.test.ts`: handicap divisions only, status values; `AveragesPage.test.tsx`: filter, states |
| AVG-03 | `averages/save.test.ts`: verify copies the provided number, no note; `AveragesPage.test.tsx`: Verify button |
| AVG-04 | `save.test.ts`: whole number, 1 to 300, note required and at most 500; `AdjustDialog.test.tsx`: messages |
| AVG-05 | `save.test.ts`: over the maximum and under the minimum refused with the D-291 messages |
| AVG-06 | `routes.test.ts`: `409` with warnings, resend with `confirmWarnings`, stronger text for a complete session |
| AVG-07 | `routes.test.ts`: adjust a verified row, delete the row |
| AVG-08 | `editRegister.test.ts`, `update.test.ts`: average or division change deletes the row; same value keeps it |
| AVG-09 | `averages/inUse.test.ts`; a lane-page, results, recap, and TV test each check handicap off the verified number |
| AVG-10 | `routes.test.ts`: scoreKeeper `403`, director `200`; `roles.test.ts` |
| AVG-11 | `RegistrationsPage.test.tsx`: mark, adjusted number, popup |
| AVG-12 | `LanesPage.test.tsx`: average in use and marker |
| AVG-13 | `results/*.test.tsx`, `ScoresPage.test.tsx`, `LiveResultsPage.test.tsx`: marker for unverified handicap, none for scratch or verified |
| AVG-14 | `RecapDialog.test.tsx`: notice with the count |
| AVG-15 | `routes.test.ts`: `409` on a complete tournament; `AveragesPage.test.tsx`: read only |
| AVG-16 | `eligibility.test.ts`, `vendorRoutes.test.ts`, `deskRoutes.test.ts`, `editRoutes.test.ts`: required, old row editable, clearing refused |
| AVG-17 | `CheckInSheet.test.tsx`: Verified, Adjusted from N with the note, Not verified, scratch blank |
| AVG-18 | `completeRoutes.test.ts`: `409` warning with the count, resend completes |
| AVG-19 | `averages/routes.test.ts`: publishes `averages` to each session and the tournament stream; `liveEvents.test.ts` |

Playwright (`web/e2e/`): verify one bowler and watch the marker leave the results page; adjust with a note and open its Details from Registrations. Add the Averages path to `accessibility.spec.ts`. Extend `test:lifecycle` with a verify step if the stage fits. Run `test:mutation:fast` on the new API logic.

## Steps

1. Table script, Prisma model, `averageInUse`, the `averages.verify` permission and role mapping. Green.
2. Store and the save rules (verify, adjust, limits, scores warning, complete freeze), with routes `GET`, `PUT`, `DELETE`, and the `averages` event.
3. AVG-16 on the vendor, desk add, and edit routes. AVG-08 on edit and `PATCH`. Vendor note for `VC-08`.
4. Switch every handicap read to `averageInUse` (lane page, recap sheets, results, finals, seeding, super sweeper, TV). Add `unverified` to the feeds and the lane fields.
5. Complete-squad and sweeper warning (AVG-18). Recap count (AVG-14).
6. Web: `AverageMarker`, `AverageDetails`, Averages page and menu link, Adjust dialog.
7. Web: Registrations column, lane page, check-in sheet, results pages, scores, entry, TV, live kinds.
8. Seed data: a few verified, adjusted, and unverified rows in `db:seed`; `db:tables` and docs.
9. E2E, accessibility, mutation fast.

Each step ends green (lint, typecheck, tests, format).

## Not doing

- Bulk verify (D-295).
- A verified badge on recap sheets: they print the handicap from the average in use, and the warning covers the rest.
- A history of past adjustments: a row holds the latest only; the log holds the rest (D-292).
- Showing a number on the TV or scores feeds: they carry only the yes or no flag.
- Any change to vendor reads: the registration site still sees the provided average.
