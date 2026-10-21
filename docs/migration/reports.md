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
| RPT-05 | Shows: squad date (`MM/dd/yyyy`) and time (`hh:mm tt`); bowler name; division; one row per game with that game's lane from the [cross](lane-assignments.md#the-cross-lane-per-game) and the handicap; a total row with handicap × games; a bowler signature line with the bowler's name; "Office Check: __________". Scores are written by hand. |

## Clipboard formats

The desk copies lane assignments out (to a scoring system or spreadsheet), enters scores there, and pastes them back.

| ID | Rule |
| --- | --- |
| RPT-06 | **Copy assignments.** One line per assigned bowler, tab-separated: `position`, `bowlerId` (UUID), `bowler name`, then **division number** on a squad or **Y/N super sweeper** on a sweeper, then `handicap` (or bonus pins). Error if no one is assigned: "No lanes have been assigned". |
| RPT-07 | **Paste scores.** Lines split on carriage return; fields on tab. Field 0 position, 1 bowler id, 2 name, fields 3 and 4 ignored, fields 5 onward are game 1, game 2, ... up to the session's game count. So the pasted text is the copied text with scores added on the end. |

The new app may replace the clipboard flow with an upload or direct entry, but the scoring vendor may depend on this format. See Q-19.

## Not in legacy

No pairing sheet, no 1099 report, no payment report, no registration export. See [proposed-features.md](proposed-features.md).
