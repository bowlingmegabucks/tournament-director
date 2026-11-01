# Recap sheets

Built on branch `recapSheet`. Migration source: [docs/migration/reports.md](../migration/reports.md#recap-sheet) and [docs/migration/lane-assignments.md](../migration/lane-assignments.md#the-cross-lane-per-game).

A recap sheet is a half sheet (8.5 × 5.5 in) for one bowler: the lane for each game, the handicap, and blank cells for scores and signatures. The desk opens a preview from the lane page, picks sheets, and prints them from the browser. The route and the button are **public for 0.2.0 only**: the sheets name bowlers and show handicaps, and the lock-down release puts them behind auth (D-66, D-52, tracked in [docs/v1-requirements.md](../v1-requirements.md)). The API builds each sheet from the **saved** lane positions; moves made on the lane page that are not saved are not included (D-55, D-65).

## Fields

What `GET /v1/tournaments/{id}/squads/{sessionId}/recap-sheets` (and the `/sweepers/` twin) returns.

| Field         | Type    | Notes                                                                                                                       |
| ------------- | ------- | --------------------------------------------------------------------------------------------------------------------------- |
| `session`     | `{ id, kind, date, games, complete }` | `kind` is `squad` or `sweeper`. `date` is the center's local time with no zone. `games` is the tournament's games on a squad (TRN-04) and the sweeper's own on a sweeper |
| `sheets[]`    | list    | One per bowler with a saved lane, in lane order, then letter (`LAN-04`)                                                     |
| `withoutLane` | integer | Bowlers with no sheet: no lane, or a position outside the session's lanes (D-61). Zero when none                            |
| `withoutDivision` | integer | Bowlers with a lane whose division is not one of the tournament's (D-51): no sheet, and their lanes are left out of the lanes in use. Zero when none |

A sheet is `{ registrationId, name, divisionName, position, handicap, cross }`.

| Field            | Type     | Notes                                                                                                   |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `name`           | text     | `First Last`, plus `, Suffix` (`BWL-13`)                                                                |
| `position`       | text     | The saved position, such as `1A`                                                                        |
| `handicap`       | integer  | The handicap per game on a squad (`SCR-07`); the bonus pins per game on a sweeper (`SCR-09`)            |
| `cross.staggered`, `cross.same` | lists of text | One lane label per game, such as `12A`, for each skip pattern. Both are sent so the page switches with no second request |

Never sent (`BWL-17`): SSN, gender, date of birth, address, email, phone, payments, average.

## Rules

| ID | Requirement | Differs from legacy | Tests |
| -- | ----------- | ------------------- | ----- |
| RPT-05 | A sheet shows the sponsor image (it holds the Megabucks logo; it is decoration with an empty `alt`, so a screen reader does not repeat it on every sheet), the squad date (`MM/dd/yyyy`) and time (`hh:mm tt`) on one line, the bowler name (bold), the division, a signature line with the bowler's name under it, a line with "Opposing Bowler's Signature" under it, and "Office Check: __________" at the bottom right. No tournament name, no squad number. Scores are written by hand. A complete squad or sweeper prints too. | Yes: the image is `score-sheet-sponsors.png`, replaced by hand each year (code change and deploy, D-63). Content otherwise as legacy | `web/src/features/recapSheets/RecapSheet.test.tsx`, `format.test.ts` |
| RPT-05a | The table has the columns Lane, Score, Handicap, and Total, one row per game, and a Totals row. Lane is that game's lane and letter (`12A`). Handicap is the bowler's handicap on every game row, or `-` when it is 0 or less. Totals shows handicap × games in the Handicap column, or `-`. Score and Total are blank. | | `web/src/features/recapSheets/RecapSheet.test.tsx`, `format.test.ts`; `api/src/features/recapSheets/recapSheets.test.ts` |
| RPT-05b | The desk previews and prints from the browser. **Preview:** a modal over the lane page lists every sheet at readable size and scrolls. **Print:** "Print all" prints every sheet; "Print selected (n)" prints the checked ones. Each sheet is its own page, 8.5 × 5.5 in, in the preview's order. Pages print with no margin, and no page follows the last sheet. The desk loads half-sheet paper. | Yes: browser print replaces screen captures sent to a printer; a scrolling list with checkboxes replaces the slider; "Save as PDF" for a recap is dropped (D-62, D-64) | `web/src/features/recapSheets/RecapDialog.test.tsx`; `web/e2e/tournaments.spec.ts` (page size and page count) |
| RPT-05c | A sheet exists for every bowler with a saved lane on the squad or sweeper. A bowler with no lane, or in "Other positions" (D-61), gets no sheet; so does a bowler whose division is not one of the tournament's (D-51), counted apart in `withoutDivision`. The game count is the tournament's `games` on a squad and the sweeper's `games` on a sweeper. | Yes: the page warns how many bowlers get no sheet, with a second notice for bowlers whose division is unknown (D-65) | `api/src/features/recapSheets/recapSheets.test.ts`, `routes.test.ts`; `web/src/features/recapSheets/RecapDialog.test.tsx` |
| LAN-18 | **Lanes in use.** Every lane of every pair that holds at least one bowler, both lanes of the pair, sorted. **Skip** from the number of lanes in use: up to 16 is 0, 17 to 24 is 1, then one more for every 8 lanes, at most 6. | | `api/src/features/recapSheets/cross.test.ts` |
| LAN-19 | **The cross.** Game 1 is the start lane. Each later game moves forward through the lanes in use by a step, wrapping at the end. Same skip: step `(skip + 1) × 2` every game. Staggered skip, by `(game − 1) mod 4`: 0 or 1 gives `(skip + 1) × 2`, 2 gives `(skip + 2) × 2`, 3 gives `max(skip × 2, 2)`. After the walk, games 2, 4, 6, ... take the other lane of the pair (odd lane + 1, even lane − 1); a lane with no partner in use stays. The letter never changes. | Yes: the cross reads every saved assignment, whatever is checked for printing (D-64). Legacy's two radio buttons stay (staggered first) | `api/src/features/recapSheets/cross.test.ts` (every worked example), `recapSheets.test.ts` |
| RPT-08 (new) | `GET /v1/tournaments/{id}/squads/{sessionId}/recap-sheets` and `.../sweepers/{sessionId}/recap-sheets` return the sheets, public and read only. An unknown tournament gives 404 `{ message: "Tournament not found" }`; an unknown session, one of another tournament, or one of the other kind gives 404 `"Squad not found"` or `"Sweeper not found"`; an id that is not a UUID 400; bowlers per pair not 2 to 5 gives 422 (as the lane page); a stored tournament that breaks its shape 500; a database outage 503. A session no one has a lane in gives 200 with no sheets. | New (D-65, D-66) | `api/src/features/recapSheets/routes.test.ts`; `api/src/app.test.ts`; `web/src/features/recapSheets/api.test.ts` |
| RPT-09 (new) | **The modal.** A "Recap sheets" button on the lane page (shown when someone has entered) opens a large modal dialog. Loading, error with Try again (a setup error shows its message), and an empty message ("No bowler has a lane yet, so there are no recap sheets. Assign lanes first, then print.") are shown as on the lane page. **Skip:** radio buttons "Staggered skip" (default) and "Same skip" change every sheet with no new request. **Choosing:** a checkbox on each sheet, all checked at first; unchecked sheets are dimmed and say "Not printing". "Find a bowler" narrows the list (every typed word starts a word of the name or division). "Select shown", "Select all", and "Clear" change the checks; a search never unchecks a sheet, so a hidden checked sheet still prints. "Print selected (n)" counts every checked sheet and is off at 0. A notice says the lanes come from all bowlers with a lane, whatever is checked; another says how many bowlers have no lane, and a third says how many have a lane but an unknown division. Esc or Close ends the modal and focus returns to the button. | New (D-64) | `web/src/features/recapSheets/RecapDialog.test.tsx`, `filter.test.ts`; `web/src/features/lanes/LanesPage.test.tsx`; `web/e2e/tournaments.spec.ts`, `accessibility.spec.ts` |

## API

| Route | Response | Errors | Vendor-visible |
| ----- | -------- | ------ | -------------- |
| `GET /v1/tournaments/{id}/squads/{sessionId}/recap-sheets` | `200 { session, sheets, withoutLane }` (Fields above) | `400` not a UUID; `404` unknown tournament or squad; `422` bowlers per pair not 2 to 5; `500` bad tournament row; `503` database down | No. Web only |
| `GET /v1/tournaments/{id}/sweepers/{sessionId}/recap-sheets` | Same, with `kind: "sweeper"` and the bonus pins in `handicap` | Same, `404` for a sweeper | No. Web only |

Both need `lanes.read` since the lock-down (D-66, D-52, D-105, `API-22`): 401 with no sign-in, 403 for the API key or a user without the permission. The API's `features/recapSheets/types.ts` and the web app's `features/recapSheets/types.ts` carry the same fields; change both together. The web squad shape (`GET /v1/tournaments/{id}/squads`) gained `games` (the tournament's, `TRN-04`) so the route can read it; the Squads page does not show it.

## Screens

- **Lane page:** a "Recap sheets" button beside the division strip.
- **Recap sheets modal:** title with the session date, a Close button; a bar with the skip radios, "n of m selected", "Print selected (n)", and "Print all"; a bar with "Find a bowler", "Select shown (n)", "Select all", "Clear", and "Showing n of m sheets"; a scrolling list with the notices and one row per sheet (checkbox, caption with name, division, lane, and Printing or Not printing, and the sheet).
- **The sheet:** two columns on 8.5 × 5.5 in. Left: sponsor image, date and time, name, division, the two signature lines. Right: the table, then Office Check.

## Notes

- **Printing.** `PrintSheets` puts the chosen sheets in a copy outside the app (`data-recap-print-copy`). `print.ts` waits for the copy's images to decode, marks the body (`data-recap-printing`, which hides everything but the copy), and calls `window.print()`. The mark clears on `afterprint`, or when the print media query goes off (a cancelled dialog), or when the dialog goes away. One print runs at a time. The half-sheet size is a named CSS page (`@page recap`), so no other print of the app changes. Chrome and Firefox honor it; Safari may print on the paper chosen in the dialog.
- **Paper tokens.** `--color-paper` and `--color-ink` in `tokens.css` stay white and black in both themes: a sheet is paper.
- **Sponsor image.** `web/src/assets/score-sheet-sponsors.png`. A new image each year is a file swap and a deploy. Setting sponsor positions in the app is a backlog idea (Q-32).
- **Not built:** saved lane moves from the modal (the move command comes after lock-down, D-55, D-57); copying lane assignments out and pasting scores in (dropped, D-67); a server PDF (D-62).
- **Mock server.** The lane labels in the mock handler are made up; only the API computes the cross.
