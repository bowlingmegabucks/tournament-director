# No-shows after a squad is complete (move or refund)

Built on branch `rc4`. New: legacy locks a completed squad (`D-10`) and has no way to move a bowler who missed it. Plan: [no-show-move-refund.md](../plans/no-show-move-refund.md). Decisions: D-309 to D-315 in [decisions-and-questions.md](../migration/decisions-and-questions.md).

## Tests

| What                                                              | Where                                                                      |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Forced advancers (NSH-20 to NSH-24)                               | `api/src/features/results/squadResults.test.ts`, `forcedAdvancers.test.ts` |
| Before and after comparison, later squads, ticks (NSH-09, NSH-20) | `api/src/features/noShows/fallout.test.ts`                                 |
| Access, refusals, preview, save, notes, log (NSH-01 to NSH-14)    | `api/src/features/noShows/routes.test.ts`, `notes.test.ts`                 |
| The transaction and facts that change before the save             | `api/src/features/noShows/prismaStore.db.test.ts`                          |
| Dialog, button, tag                                               | `web/src/features/noShows/*.test.ts(x)`, `web/e2e/noShow.spec.ts`          |
| The whole story on a real API and database                        | stage 10 of `web/lifecycle/lifecycle.spec.ts`                              |

## Rules

| ID     | Rule                                                                                                                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NSH-01 | Admin only. New permission `entries.override`, withheld from the director. Web only; the API key cannot reach it.                                                                                                                        |
| NSH-02 | Squads only, never sweepers. The source squad is complete (an open squad uses the normal edit). The tournament is not complete.                                                                                                          |
| NSH-03 | Only a true no-show: no score above 0 in the source squad.                                                                                                                                                                               |
| NSH-04 | **Move:** the target is an open squad the bowler has not entered. The source entry, its lane, and its zeros are removed. The new entry has no lane.                                                                                      |
| NSH-05 | **Refund:** the source entry and its zeros are removed. No refund is recorded.                                                                                                                                                           |
| NSH-06 | A refund of the only squad entry deletes the registration. The preview warns that the bowler becomes ineligible for sweepers and that their sweeper entries are removed. It also shows any real payment, as desk delete does (`DRG-02`). |
| NSH-07 | NSH-06 is refused if the bowler has any other score in the tournament (`REG-19`). The source squad's zeros do not count. They can still be moved.                                                                                        |
| NSH-08 | Refused while the no-show has a payout for the source squad. A refund that deletes the registration is refused while they have any payout.                                                                                               |
| NSH-09 | Nothing is saved until the admin has seen a preview of what changes and confirmed it.                                                                                                                                                    |
| NSH-10 | Payout amounts and paid ticks never change.                                                                                                                                                                                              |
| NSH-11 | A saved payout whose bowler stops being a casher (or finalist) gets a system note if it has none, with the admin as last editor. An existing note is left as is, and so is its last editor.                                              |
| NSH-12 | A bowler who loses a cash spot and has no payout gets no flag. The director adds them by hand (`PAY-06`).                                                                                                                                |
| NSH-13 | A payout with a note on a bowler the results do not infer is not shown on public results or the TV (`PAY-20`, unchanged).                                                                                                                |
| NSH-14 | Every move and refund is logged with the admin id, ids, and counts. There is no audit table.                                                                                                                                             |

System note (cut to 200 characters):

- `Maria Chen moved from the 11/26 8:00 AM squad to the 11/27 8:00 AM squad after completion.`
- `Maria Chen refunded from the 11/26 8:00 AM squad after completion.`

## Forced advancer

| ID     | Rule                                                                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NSH-20 | The preview lists each bowler who would stop advancing, with a "Keep advancing" checkbox, unticked. This is the only place to set it, and there is no way to unset it.                 |
| NSH-21 | A forced advancer is an advancer in every way: they take no squad cash, count as "advanced earlier" in later squads (`RES-06`), leave the at-large pool, and are seeded as a finalist. |
| NSH-22 | They count against the cash spots like any advancer.                                                                                                                                   |
| NSH-23 | They come out of the at-large spots. With none left, at-large stays at zero and the finals field has one more.                                                                         |
| NSH-24 | They show "Advanced by ruling" wherever they show as an advancer. No reason or name is shown or stored.                                                                                |

How a division works out: natural advancers are the same top `A = floor(N / finalsRatio)` as today. Advancers are those **plus** any forced bowler not already among them. `T` is the number of advancers. Cash spots are 1 when `T` is 0, else `max(floor(N / cashRatio) - T, 0)`. The cut score stays the last advancer's total.

Example (finals 1 in 7, cash 1 in 5):

| Entries             | Advance          | Cash |
| ------------------- | ---------------- | ---- |
| 21, before the move | A, B, C          | D    |
| 20, box unticked    | A, B             | C, D |
| 20, C ticked        | A, B, C (ruling) | D    |

In a later squad, C cannot advance again. C cashes there if the score earns it (`D-81`, unchanged).

## Data

One new column: `SquadRegistration.ForcedAdvancer TINYINT(1) NOT NULL DEFAULT 0`. The flag is a fact about one entry and goes away with it.

- New script `api/prisma/forced-advancer-column.sql` (`ADD COLUMN IF NOT EXISTS`). **Run it on production before deploying**, or reads of the column fail.
- Add the field to `schema.prisma`, to `db:tables`, and to the test schema.
- Registration edits only delete removed entries and insert new ones, so the flag survives them.

## API

Mounted under `/v1/tournaments/{id}/squads/{sessionId}/no-shows/{registrationId}`, access `entries.override`.

| Route           | Body                                                                | Answer                                                                                           |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `POST /preview` | `{ action: 'move' \| 'refund', targetSquadId?, keepAdvancing: [] }` | `200 { preview }`: warnings, changes, payout notes, `version`                                    |
| `POST /`        | The same, plus `version`                                            | `200` when saved; `409 { errors }` when refused; `409 { preview }` when `version` is out of date |

`keepAdvancing` holds `{ squadId, registrationId }` pairs.

The preview works the results out twice, as they are and as they would be, and compares them:

- **Each completed or scored squad, in date order:** who stops or starts advancing and cashing. Later squads are included, because a lost advancer can advance there and push someone else out. So ticking a box runs the preview again.
- **At-large:** spots before and after, and who joins or leaves. For a move it says these figures will change again when the target squad is bowled.
- **Payouts:** which saved payouts get a note.
- **Registration:** what is deleted (NSH-06).

The target squad is not previewed. It has not been bowled.

The save is one serializable transaction. It rechecks the tournament, both squads, the no-show, and the payouts before writing. `version` is a hash of the preview, so a change made since the admin looked is shown again instead of saved.

After the save, publish the entry, result, TV, and payout events for the squads touched.

## Screens

- **Entry point:** a "Move or refund" button on each row of the **No show** list on a completed squad's Results tab, shown only with `entries.override` on an open tournament. (A completed squad's lane page has no row buttons today.)
- **Dialog** (full screen on a phone): choose Move or Refund; for a move, pick the target; review the preview; tick any "Keep advancing"; confirm. States: loading, nothing changes, refused, out of date, saving, error.
- **Tag:** "Advanced by ruling" on squad results, print, TV, and seeding.
