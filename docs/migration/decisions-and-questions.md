# Decisions and open questions

One list for everything the new app must decide. When a question is answered, move it to Decisions with the date and the reason, and update the rule it points to.

## Decisions

| ID | Decision | Reason | Rules | Date |
| --- | --- | --- | --- | --- |
| D-01 | Eligibility (average, age, gender) **warns** and lets the entry through. Legacy blocks it. The warning names the failed rule. | The registration site takes payment and does not check division rules, so we must accept what it sends. | `REG-04`, `REG-37`, `REG-15` | 2026-10-20 |
| D-02 | Legacy **defects** listed below are fixed, not copied, unless a question says otherwise. **Exception:** anything the registration site can see (paths, bodies, status codes, limits) stays as legacy until a vendor change is agreed (D-09). | Recording legacy as-is is for reference; copying crashes and data loss helps no one. | see table | 2026-10-20 |
| D-03 | **One registration (one division) per bowler per tournament.** Enforce in code. Adding a database constraint is a schema change; decide it with the Prisma work. | Owner confirmed. | `REG-01` | 2026-10-20 |
| D-04 | **No sweeper-only entries.** Every registration keeps at least one qualifying squad, on create **and** on update. | Owner confirmed. Legacy checks only on create; `PATCH` can remove every squad. | `REG-03`, `REG-31` | 2026-10-20 |
| D-05 | **Returning bowler: patch, not replace.** Only fields the request sends overwrite stored values. Missing fields (SSN, date of birth, gender) keep their stored values. Same for append. | Owner confirmed. Fixes the SSN-erasing defect. | `REG-07`, `REG-14`, `BWL-16a` | 2026-10-20 |
| D-06 | **A paid squad entry counts as an entry**, bowled or not. No-shows get zeros on completion, as in legacy. A **refunded** entry is removed from the squad (its `SquadRegistration` row deleted), so it stops counting. | Owner confirmed. Prize spots are funded by paid entries. | `SQD-15`, `RES-02`, `REG-20` | 2026-10-20 |
| D-07 | **"Previous casher" flag stays as-is.** It marks an at-large advancer (or seeded finalist) who already received a cash payout on a squad. It is information for the director; the app does not change any amount. | Owner explained: finals ratio (say 1 in 7) is tighter than cash ratio (1 in 5), so a bowler can cash on a squad without advancing, then make the at-large. | `RES-16`, `RES-21` | 2026-10-20 |
| D-08 | **No advancers means exactly one casher**, even if the cash ratio allows more. Keep legacy. | Owner confirmed. | `RES-05` | 2026-10-20 |
| D-10 | **A complete squad or sweeper is locked.** No refunds, no removals, no score changes, no lane moves. A refund removal must happen before the squad is completed. The new **server** enforces this; legacy only locks the screens. | Owner confirmed. | `SQD-17`, `REG-20`, `REG-34`, `SCR-06` | 2026-10-20 |
| D-11 | **Refunds happen outside the app.** For our system, a refund is just deleting the squad registration (desk "remove from squad", or a site `PATCH` that drops the squad). No refund record is kept. | Owner confirmed. | `REG-20`, `REG-31`, D-06 | 2026-10-20 |
| D-12 | **Tournaments, divisions, squads, and sweepers can be edited** (legacy can only add them). Which fields, and when, is settled per feature as we build it. General rule: **a squad or sweeper with scores is locked from editing.** Editing a division's criteria after bowlers are registered shows a warning: the change is not retroactive, already-registered bowlers may no longer fit, and the director must review them by hand. | Owner decision. Details to discuss feature by feature. | `TRN-10`, `DIV-12`, `SQD-14` | 2026-10-20 |
| D-13 | **Super sweeper cash ratio must be at least 1.** | Owner decision. Stops the divide-by-zero crash. Note: other ratios must be **greater than** 1; with 1, every super sweeper bowler cashes. Existing rows may hold the legacy default 0. | `TRN-09`, `RES-28` | 2026-10-20 |
| D-14 | **Ties at the cut are settled by the tie-breakers, as in legacy.** The number who advance never grows because of a tie. The **cut line always divides** advancers (above) from non-advancers (below); the cash line works the same way. When the last spot above a line was won on a tie-breaker (equal total), the standings mark the bowlers on both sides of the line who share that total, and say which tie-breaker decided it. | Owner decision; legacy behavior confirmed in tests (`NoPreviousAdvancers_TieForLastAdvancer`). Owner was unsure whether all tied bowlers should advance; legacy does not do that. | `SCR-11`, `RES-07`, `RES-11` | 2026-10-20 |
| D-09 | **The integration API matches legacy as exactly as it can.** Any change the registration site would notice needs a reason, a discussion, and a written change doc for the vendor before we build it. Candidates are listed in [integration-api.md](integration-api.md#candidate-vendor-changes). | Owner decision. The vendor's system depends on the current contract. | `API-*` | 2026-10-20 |

## Open questions

| ID | Question | Legacy today | Suggested answer | Rules |
| --- | --- | --- | --- | --- |
| Q-03 | Should the new app also **delete** tournaments, divisions, squads, and sweepers? What does "complete tournament" do? (Editing is settled in D-12.) | Add only; `Completed` unused | Delete only when nothing hangs off it; "complete" makes the tournament read-only | `TRN-10`, `DIV-12`, `SQD-14` |
| Q-25 | Existing tournaments may have super sweeper cash ratio 0 (legacy default). Fix the data to 1 (or another value), or only require ≥ 1 on new and edited tournaments? | Default 0 | Require on save; show an error on results until it is fixed | `TRN-09`, D-13 |
| Q-05 | USBC ID for handicap divisions: warn like D-01, or block? | Block | Warn (the API requires a USBC ID anyway) | `REG-05` |
| Q-07 | When should super sweeper changes lock: once **any** sweeper score exists in the tournament, or once **this bowler** has one? | API: any. Desk: this bowler | This bowler | `REG-18`, `REG-36` |
| Q-08 | Should changing an average re-check division limits (as a warning)? Lock once scores exist? | No check; allowed any time | Warn; allow with a confirm after scores, since it changes handicap and results | `REG-16`, `REG-38` |
| Q-10 | Should squad setup only allow 2 to 5 per pair, to match the lane screen? | Saves any value > 0 | Yes, 2 to 5 | `LAN-02`, `SQD-04` |
| Q-11 | Sweeper bonus pins: are there standard amounts (the old spec said +10 handicap, +6 for 55+ or women, 0 scratch) to pre-fill? | Typed per division, no defaults | Pre-fill if standard; still editable | `SCR-09`, `SQD-13` |
| Q-13 | Should at-large spots use the squad finals ratio overrides, or always the tournament ratio? | Always tournament | Ask; it matters only when a squad overrides | `RES-12` |
| Q-14 | Super sweeper: must a bowler bowl every sweeper to be ranked? How do differing bonus pins combine? | No check; first sweeper's pins used for all | Each sweeper's own pins; flag bowlers who missed one | `RES-26`, `RES-27` |
| Q-16 | A payment arrives with a confirmation code already on file. Error, or treat as a retry and ignore? | Database error, HTTP 500 | Treat as a retry (idempotent) | `PAY-03` |
| Q-17 | Desk registrations save a $0 `Manual_` payment. Keep? Should the desk record real cash or check payments? | $0 placeholder | Ask | `PAY-01a` |
| Q-19 | Which scoring system gets the copied lane assignments and returns scores? Must the tab format stay? | Tab-separated clipboard | Keep until we know | `RPT-06`, `RPT-07` |
| Q-20 | A **full tie** at the cut: equal on total, high game, and every other game. Legacy has no rule left and picks one at random (sort order). What should happen: both advance, a roll-off, or the director picks? (Ties settled by a tie-breaker are covered by D-14.) | Order not defined | Flag it and let the director pick | `SCR-11`, D-14 |
| Q-21 | Bowlers with more games entered rank above those with fewer, whatever the pins. Fine for live standings? | Yes | Keep, but show "games bowled" | `SCR-11` |
| Q-22 | Who may see SSNs in the new app, and do we need a 1099 report? | No one sees them; verify by retyping | Ask; see proposed features | `SEC-10` |
Answered and moved to Decisions: Q-01 (D-03), Q-04 (D-04), Q-06 (D-05), Q-09 (D-06), Q-12 (D-07), Q-15 (D-08), Q-18 (D-09), Q-23 (D-10), Q-24 (D-11), Q-02 (D-13). Q-03 and Q-20 were narrowed by D-12 and D-14.

## Defects index

Legacy behavior to fix, not copy (D-02).

| Rule | Defect |
| --- | --- |
| `REG-07`, `API-10` | API re-registration erases the bowler's SSN, clears date of birth, and turns a missing gender into Female |
| `REG-01` | Empty USBC ID matches every bowler with no USBC ID: false "already registered", or a lookup failure |
| create (`REG-02` to `REG-08`) | No check that division and squads belong to the tournament or that squads are open |
| `REG-38` | API ignores an average sent without a division |
| `REG-37` | API allows a division change after scores; the desk does not |
| `SCR-05`, `SCR-06` | A bowler who fails score validation has their saved scores deleted |
| `RES-08` | Crash when no one advances but a previous advancer bowled; crash when not enough bowlers to fill cash spots |
| `RES-27` | Super sweeper uses the first sweeper's bonus pins for every game |
| `TRN-09`, `RES-28` | Super sweeper cash ratio 0 divides by zero |
| `API-12` | Not found and conflict errors return HTTP 500. **Kept until a vendor change is agreed (D-09)** |
| `API-14` | Rate limit runs before auth, so the authenticated limit never applies. **Vendor-visible; see D-09** |
| `REG-31` | `PATCH` can remove every qualifying squad (D-04) |
| `SQD-17` | The server does not lock complete squads; only the screens do (D-10) |
| `SEC-13` | API logs full requests, including personal data |
