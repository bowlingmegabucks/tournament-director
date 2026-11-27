# SMART scholarship (youth bowlers)

Built on branch `rc4`. New: legacy has no youth indicator, so the rules are new (`SMT-01` to `SMT-08`). Decision: D-317 in [decisions-and-questions.md](../migration/decisions-and-questions.md). A youth bowler's winnings go to their SMART account, not to them. Entering and tracking payouts works as it does for cash ([payouts.md](payouts.md)); what differs is what the screens and reports say about the money.

## Field

`Registrations.SmartScholarship`, `TINYINT(1) NOT NULL DEFAULT 0`, from [api/prisma/smart-scholarship-column.sql](../../api/prisma/smart-scholarship-column.sql). On the API and the web it is `smartScholarship`. It belongs to the registration, not the bowler: a bowler who ages out does not change an earlier year's reports.

## Rules

| ID     | Requirement | Tests |
| ------ | ----------- | ----- |
| SMT-01 | The Bowler step of the add and edit registration pages has the checkbox "Youth bowler: winnings go to their SMART account". Review says when it is set or changed. | `SmartScholarshipField.test.tsx`, `EditRegistrationPage.test.tsx`, `web/e2e/smartScholarship.spec.ts` |
| SMT-02 | It is stored per registration and covers every payout of it: squad, sweeper, super sweeper, and finals. A request that leaves it out keeps what is stored (false for a new registration). Desk only: the vendor routes neither take nor return it (D-09). | `deskRegister.test.ts`, `editRegister.test.ts`, `prismaWriter.db.test.ts`, `deskForm.test.ts`, `editForm.test.ts` |
| SMT-03 | A SMART amount reads "SMART scholarship $100.00" instead of "Payout $100.00" on results, seeding, the TV page, and printed results. A row with no amount carries nothing about it, so a public page names a youth only beside money they won. | `loadResults.test.ts`, `PayoutTag.test.tsx`, `prismaStore.db.test.ts` (payouts) |
| SMT-04 | Payout screens and prints include the bowler and say "SMART scholarship: do not pay"; the "Received by" box holds that text instead of a signature line. Totals split into cash and SMART scholarship wherever there is any, as does the Complete tournament dialog. The registrations list marks the bowler "SMART". "Paid" means sent to SMART. | `PayoutEntry.test.tsx`, `PayoutsPage.test.tsx`, `smartTotals.test.ts`, `completeApi.test.ts`, `prismaComplete.db.test.ts`, `RegistrationsPage.test.tsx` |
| SMT-05 | It can change until the tournament is complete, and saved payouts follow it. When a payout of the registration is marked paid, an edit answers `409` with a warning to confirm. The add page, appending to an existing registration, refuses the change and sends the desk to Edit registration. | `editRegister.test.ts`, `deskRegister.test.ts`, `EditRegistrationPage.test.tsx` |
| SMT-06 | A change drops the cached public pages and tells the session and TV streams, so the label moves at once. | `publishingWriter.test.ts` |
| SMT-07 | Ticking it for a bowler who is 18 or older, or has no date of birth, shows a warning. It never blocks: SMART has its own eligibility rules. | `deskForm.test.ts`, `SmartScholarshipField.test.tsx` |
| SMT-08 | The column script adds the column only if it is missing, so it can run twice. Run it before deploying. | `smartScholarshipSchema.test.ts` |

## API

No new route. `smartScholarship` is added to:

- `POST` and `PATCH /v1/tournaments/{id}/registrations…` (optional), and `GET …/edit-info`, `GET /v1/bowlers/{id}`, `GET /v1/tournaments/{id}/registrations`.
- Result rows: `smartScholarship: true`, present only beside a SMART amount.
- Payout sheet payees, `GET /payouts` lines, and `GET /payouts/totals` bowlers.
- `complete-info`: `unpaidPayoutSmartTotal`.

## Later

The 1099 report (D-282) should leave SMART money out. Confirm with whoever handles the taxes before building it.
