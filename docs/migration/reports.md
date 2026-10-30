# Reports and exports

Legacy makes four PDF reports with QuestPDF, a recap sheet screen, and two clipboard formats. Each PDF can be saved or printed.

Source: `main/ResultReportBase.cs`, `main/*/Results/*Report.cs`, `main/Tournaments/Seeding/TournamentSeedingReport.cs`, `main/Scores/RecapSheetForm.cs`, `main/LaneAssignments/LaneAssignmentsForm.cs`, `presentation/LaneAssignments/LaneAssignmentViewModel.cs`, `presentation/Scores/ScoresGridViewModel.cs`.

## Common PDF layout

| ID | Rule |
| --- | --- |
| RPT-01 | Page margin 35. Header: title (20 pt, semibold, centered); then "Date: `MM/dd/yyyy - hh:mm tt`" if the report has a date; then "Division: name" if it has a division. The Northeast Megabucks header image sits on the right (300 wide, 125 high). Footer: "page / total", centered. |
| RPT-02 | One table. Header row semibold with a black bottom border. Rows have a light grey bottom border. Divider rows ("Cut Line", "Cash Line", "No Advancers") are small italic text with extra space. |
| RPT-03 | Save offers a file name of `<title>.pdf`. Print renders each page as an image at 90 DPI and sends it to the printer. |

## The four PDF reports

| ID | Report | Title | Date | Division | Columns | Dividers | Detail |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RPT-04a | Squad results | Squad Results | yes | yes, one PDF per division | Place, Name, Total, HG, HDCP (handicap divisions only) | Cut Line (or No Advancers), Cash Line | [results.md](results.md#squad-results) |
| RPT-04b | Sweeper and super sweeper results | Sweeper Results / Super Sweeper Results | sweeper only | no | Place, Name, Total, HG | Cash Line | [results.md](results.md#sweeper-results) |
| RPT-04c | At-large | At Large | no | yes, one per division | Place, Squad, Name, Total, HG, Casher ($ icon) | none | [results.md](results.md#at-large) |
| RPT-04d | Finals seeding | Finals Seeding | no | yes, one per division | Seed (`#n`), Name, Total, HG, Casher ($ icon) | Cut Line | [results.md](results.md#finals-seeding) |

## Recap sheet

One sheet per assigned bowler, made from the lane screen (`LAN-12`). Shown on screen with a slider to page through bowlers, and printed from there.

| ID | Rule |
| --- | --- |
| RPT-05 | Shows: header image (Northeast Megabucks, top left); squad date (`MM/dd/yyyy`) and time (`hh:mm tt`); bowler name; division; a table with one row per game; a totals row; a bowler signature line with the bowler's name above it; an "Opposing Bowler's Signature" line; "Office Check: __________" at the bottom right. Scores are written by hand. |
| RPT-05a | **Table.** Columns: Lane, Score, Handicap, Total. Header row, then one row per game, then a row labelled "Totals". Lane shows that game's lane and letter from the [cross](lane-assignments.md#the-cross-lane-per-game) (`12A`). Handicap shows the bowler's handicap on every game row, or `-` when it is 0 or less. Score and Total are blank (hand-written). The Totals row shows handicap × games (or `-`) in the Handicap column; its Score and Total cells are blank. Calibri 11 pt, bold headers. |
| RPT-05b | **Print.** Legacy shows one sheet at a time with a slider to page through bowlers. Print asks for a printer, then screen-captures each sheet as an image and prints one per page on a **half sheet, 8.5 × 5.5 inches** (paper size "Half Sheet", 850 × 550). Order follows the lane screen's list. Cancel closes the screen. **D-62, D-64:** the new app prints from the browser, previews in a modal with a scrolling list, and can print all or the checked sheets. |
| RPT-05c | **Which bowlers.** Every bowler with a position on the squad or sweeper (`LAN-12`: "generate recap sheets"). Unassigned bowlers get no sheet (D-65). The game count is the tournament's `games` on a squad, the sweeper's `games` on a sweeper. The cross pattern is two radio buttons in legacy ("Same skip", "Staggered skip", staggered selected at start); the new app keeps both, staggered first (D-64). **D-63:** content and layout stay as legacy, with a sponsor image. **D-65:** the API builds the sheets from saved positions. |

## Clipboard formats

The desk copies lane assignments out (to a scoring system or spreadsheet), enters scores there, and pastes them back.

| ID | Rule |
| --- | --- |
| RPT-06 | **Copy assignments.** One line per assigned bowler, tab-separated: `position`, `bowlerId` (UUID), `bowler name`, then **division number** on a squad or **Y/N super sweeper** on a sweeper, then `handicap` (or bonus pins). Error if no one is assigned: "No lanes have been assigned". **Dropped (D-67).** |
| RPT-07 | **Paste scores.** Lines split on carriage return; fields on tab. Field 0 position, 1 bowler id, 2 name, fields 3 and 4 ignored, fields 5 onward are game 1, game 2, ... up to the session's game count. So the pasted text is the copied text with scores added on the end. **Dropped (D-67).** |

The new app drops the clipboard flow: it captures and shows scores itself (D-67, Q-19 closed).

## Not in legacy

No pairing sheet, no 1099 report, no payment report, no registration export. See [proposed-features.md](proposed-features.md).

## Recap sheet in the new app (plan notes)

In progress on branch `recapSheet`. Settled in D-62 to D-66 (Q-29 to Q-31 are answered). The plan is in `docs/plans/recap-sheets.md` until the work is done; the lasting record is `docs/requirements/recap-sheets.md`. The notes below are the earlier sketch.

**Goal.** From the lane assignments page, the desk generates one recap sheet per assigned bowler and prints them, with no screen capture. Legacy's slider preview can stay as a preview.

**What the sheet needs, and where it comes from.**

| Field | Source |
| --- | --- |
| Squad date and time | The squad or sweeper (already on the lane page) |
| Bowler name, division, handicap | The lane assignment (already on the lane page; `SCR-07`, `SCR-09`) |
| Lane per game | The cross: starting lane and letter, lanes in use, skip, game count, staggered or not. Not built. A pure function with unit tests against the worked examples in [lane-assignments.md](lane-assignments.md#worked-examples-checked-with-a-script) |
| Game count | Tournament `games` or sweeper `games` |

**Sketch of the pieces** (to confirm in the plan):

1. A cross function in `api/` (pure, tested with the worked examples).
2. A read route, for example `GET /v1/tournaments/{id}/squads/{sessionId}/recap-sheets?staggeredSkip=true` and a sweeper twin, that returns one object per assigned bowler: name, division, handicap, and the lane label for each game. Web-only shape, like the lane routes.
3. A print page in `web/` that lays out one sheet per half page and calls the browser print dialog, or a PDF the API makes (see Q-29).
4. A "Recap sheets" button and a "Staggered skip" checkbox on the lane page.

**Access.** The sheets name bowlers and their handicaps, so signed-in only, like the lane page (D-59). The route only reads, so D-52 does not block it, but it ships with or after auth.

**Test ideas.** The cross against every worked example; a squad with no one assigned (`RPT-06` shows "No lanes have been assigned" for the copy; recap needs a similar message); a bowler with handicap 0 (`-`); one bowler; many bowlers (page breaks); a sweeper with and without super sweeper; the printed page size.

**Not in the sheet today.** No tournament name, no squad number, no lane-pair seat map, no barcode or QR. Add only by decision.
