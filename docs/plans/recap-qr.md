# Plan: recap sheet QR code

Branch: `migrate-lane-assignment-save` (owner's choice; no new branch). Delete this file when the work is done.

A QR code on every printed recap sheet. A bowler scans it with a phone and lands on the Scores tab of that squad or sweeper. Legacy has no code, so this is new (D-225 to D-227). Web only: no API change, nothing vendor-visible (D-09).

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| RPT-10 (new) | In | The code and its caption |
| RPT-05 | In | Sheet content gains the code; "Differs from legacy" gets a note |
| RPT-05b | In, test only | The code shows in the preview and prints; no behavior change |
| RPT-05a, RPT-05c, RPT-08, RPT-09, LAN-18, LAN-19 | Already done | No change |
| Scores tab rules (SCR) | Already done | The target page. Public for good (D-70) |
| A code on result printouts | Later | Not asked for |

## Decisions used

- D-225: one code per sheet, same address on every sheet of a session; caption "Squad scores" or "Sweeper scores"; in the preview and on paper; shown on a complete session too; 0.8 in square, level M, 4-module margin, black on white.
- D-226: the address is `<window.location.origin>/tournaments/{id}/squads/{sessionId}/scores` (`/sweepers/…` for a sweeper). No setting, no API change.
- D-227: add `qrcode.react` (`QRCodeSVG`).
- D-62, D-63: browser print; the sheet is paper (black on white in both themes, `--color-paper`, `--color-ink`).
- D-70: the Scores tab is public, so a scan needs no sign-in.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| RPT-05 | No code on the sheet | A QR code to the session's Scores tab | D-225, D-226 |

## API

None. `GET …/recap-sheets` already returns what the sheet needs. The dialog already holds `tournamentId`, `sessionId`, and `kind`, so the address needs no new field.

## Web

Mockup: [recap-qr-mockups/sheet.html](recap-qr-mockups/sheet.html) (open `index.html`). It shows a squad sheet and a sweeper sheet at true size.

**Where it sits.** The code goes at the left of the sheet's footer row, level with "Office Check" (right column, under the table). The left column's open row is the bowler's signing space, so the code cannot go there. The cost: the table gives up about 0.75 in of height. With three games each row goes from about 1.0 in to 0.8 in. The footer row grows from one text line to the code's height (0.8 in plus the caption).

**Parts.**
- `web/src/features/recapSheets/ScoresCode.tsx` (new): a `figure` with `QRCodeSVG` (`value`, `size` 0.8 in, `level="M"`, `marginSize={4}`, black on white) and a `figcaption` ("Squad scores" or "Sweeper scores"). The svg gets `aria-hidden`: like the sponsor image it is decoration for a camera, and the caption names it, so a screen reader does not read the same code on every sheet.
- `web/src/features/recapSheets/scoresAddress.ts` (new): `scoresAddress(origin, kind, tournamentId, sessionId)` returns the string. Pure, so it is easy to test.
- `RecapSheet.tsx`: takes `scoresAddress` and `kind` (from `session.kind`), renders the footer as a flex row of `ScoresCode` and the Office Check line.
- `RecapDialog.tsx` and `PrintSheets.tsx`: pass the address (built once from `window.location.origin`, `tournamentId`, `sessionId`, `data.session.kind`) down. Both already render `RecapSheet`.
- `RecapSheet.module.css`: a `.footer` flex row, `.code` size in inches, caption in points. No new tokens. The module has no raw colors today; the code's two colors are literal `#000000` and `#ffffff` in the TSX, because an SVG `fill` attribute may not resolve `var()` and a scan fails if the contrast is wrong. A comment says so. They match `--color-ink` and `--color-paper`.

**States.** The code has no loading, error, or empty state of its own: it renders with the sheet, and the sheet already has all three states in the dialog.

## Data

None. No type changes, no storage, no schema change.

## Tests

| Rule | Test |
| --- | --- |
| RPT-10 | `scoresAddress.test.ts`: a squad address, a sweeper address; the origin's trailing text is not doubled (RPT-10, D-226) |
| RPT-10 | `RecapSheet.test.tsx`: the caption reads "Squad scores" on a squad and "Sweeper scores" on a sweeper (D-225) |
| RPT-10 | `RecapSheet.test.tsx`: the code's modules equal those of a `QRCodeSVG` drawn with the expected address, so the right address is encoded (D-226). This decodes nothing and mocks nothing; it compares the drawn svg to a known one |
| RPT-10 | `RecapSheet.test.tsx`: the svg is hidden from screen readers; one code per sheet; a complete session still shows it (D-225) |
| RPT-05 | `RecapSheet.test.tsx`: the existing content tests still pass (name, date, division, lines, table) |
| RPT-05b | `RecapDialog.test.tsx`: the preview shows one "Squad scores" caption per sheet; the print copy holds one per printed sheet (`PrintSheets`) |
| RPT-05b | `web/e2e/tournaments.spec.ts`, recap test: the dialog shows the captions; the existing page-size and page-count checks still pass (the sheet is still 8.5 × 5.5 in with the code) |
| a11y | `web/e2e/accessibility.spec.ts`, recap dialog: the existing axe scan covers the code |
| fit | `web/e2e/tournaments.spec.ts`: the code sits inside the sheet, below the table, and does not overlap Office Check (bounding boxes). Guards the layout |

Mutation (`test:mutation:fast`) on `scoresAddress.ts` and `ScoresCode.tsx`. If `reports/stryker-incremental.json` is missing, I say a full baseline run is needed and you run it.

## Steps

1. Add `qrcode.react` to `web/` (`npm i qrcode.react`, exact version noted in the commit). Commit with the lockfile. Check `npm audit`.
2. `scoresAddress.ts` and its test. Green.
3. `ScoresCode.tsx`, the sheet footer, and CSS, with the `RecapSheet` tests. Green.
4. Pass the address through `RecapDialog` and `PrintSheets`, with the dialog tests. Green.
5. e2e: captions, fit, and the existing page checks. Run `npm run test:e2e` in `web/`.
6. Print a sheet to PDF in Chrome and scan it with a phone, at the real size. This is the check a test cannot make; you do it, since I have no phone.
7. Lint, typecheck, test, `format:check` in `web/`; `test:mutation:fast` for the new files.
8. Version: bump only if a tag exists for the current version (0.9.0); see the memory note. Otherwise leave it.
9. Phase 5: record in `docs/requirements/recap-sheets.md` and the migration docs; add the `CLAUDE.md` status entry.

## Not doing

- A code on result printouts, at-large, seeding, or the lane page (Later).
- A short redirect address. The real address holds two UUIDs (about 115 characters), so the code is a version 8 symbol: 49 modules, plus the margin, in 0.8 in. That is about 0.35 mm a module, which a phone reads from a laser or inkjet print. If scans fail in practice, the fix is a shorter address, not a bigger code.
- A setting for the site address (D-226).
- Decoding the code in a test. A real scan is step 6.
- Any API or database change.
