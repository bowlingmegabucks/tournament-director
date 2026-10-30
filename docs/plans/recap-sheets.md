# Plan: recap sheets

Branch: `recapSheet`. Delete this file when the work is done.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| RPT-05 | In | Sheet content (D-63) |
| RPT-05a | In | Table, `-` for handicap 0 |
| RPT-05b | In, differs | Browser print, modal preview, print all or selected (D-62, D-64) |
| RPT-05c | In | Every bowler with a saved lane; two skip patterns |
| LAN-18 (new) | In | Lanes in use and the skip (the cross, inputs) |
| LAN-19 (new) | In | Steps and the swap on even games (the cross, steps) |
| RPT-08 (new) | In | The two recap routes (D-65, D-66) |
| RPT-09 (new) | In | The modal: button, scrolling list, checkboxes, skip radios, warning (D-64) |
| LAN-12 (recap part) | In | The "Recap sheets" button |
| LAN-12 (add, new registration, remove, copy) | Later | Other features; copy is Dropped (D-67) |
| RPT-06, RPT-07 | Dropped | D-67 |
| RPT-03 (recap) | Dropped | D-62 |
| RPT-01 to RPT-04 | Later | Other reports |

## Decisions used

- D-62: print from the browser, half sheet, no PDF.
- D-63: legacy content and layout; `score-sheet-sponsors.png` is the left-column image (the logo is inside it).
- D-64: modal preview, scrolling list, checkboxes, skip radios, Print all / Print selected.
- D-65: API builds the sheets from saved positions; no-lane bowlers get no sheet and a warning.
- D-66: public for 0.2.0, signed-in at lock-down.
- D-67: clipboard copy and paste dropped.
- D-55, D-61: on-screen moves are not saved, so not printed; "Other positions" get no sheet.
- D-56, D-58: seat letters and pairs as the lane page.
- D-27, D-09: the route declares `public`; web only, not vendor-visible.
- D-53: shared `Loading`. Use `QueryError` for errors.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |
| RPT-05b | Screen capture of the form, printed as images | Print-styled HTML, browser print dialog | D-62 |
| RPT-05b | Slider, one sheet at a time | Modal, scrolling list, checkboxes | D-64 |
| RPT-05b | Prints everything | Print all or print the checked sheets | D-64 |
| RPT-05c | Sheets for unassigned bowlers: none, no message | None, plus an on-screen warning | D-65 |
| RPT-03 | Save as PDF | Dropped for recap (browser dialog may still offer it) | D-62 |
| RPT-06, RPT-07 | Clipboard copy and paste | Dropped | D-67 |

## API

Two routes, web only, label `public` (D-27), beside the lane routes.

| Route | Response | Errors |
| --- | --- | --- |
| `GET /v1/tournaments/{id}/squads/{sessionId}/recap-sheets` | `200 { session, sheets, withoutLane }` | `400` not a UUID; `404` unknown tournament or squad; `422` bowlers per pair not 2 to 5 (as the lane route); `500` bad tournament row; `503` database down |
| `GET /v1/tournaments/{id}/sweepers/{sessionId}/recap-sheets` | Same, `kind: "sweeper"`, `handicap` holds the bonus pins | Same, `404` for a sweeper |

Shape:

```ts
{
  session: { id, kind, date, games, complete },
  sheets: [
    {
      registrationId, name, divisionName, position,
      handicap,                                  // pins per game (SCR-07 or SCR-09)
      cross: { staggered: ['1A', '4A', ...], same: ['1A', '4A', ...] },  // one label per game
    },
  ],
  withoutLane: 4,                                // unassigned plus "Other positions" (D-61)
}
```

- **Both crosses in one reply.** The skip switch then flips on screen with no second fetch. The cost is small (a few labels per bowler). Say if you would rather have `?staggeredSkip=` and a refetch.
- **The cross never depends on the selection.** The API builds every cross from all saved assignments (every pair with a bowler), and the page picks which finished sheets to print. A test proves a sheet is the same with one bowler checked as with all checked.
- **Order:** lane, then letter (`LAN-04`), the order the lane page already builds.
- **Reuse.** The route calls the same repositories as the lane route and `buildLanePage`, then a pure `buildRecapSheets(page, games)`. No new storage code.
- **Games.** A sweeper has `games`. A squad needs the tournament's `Games` (NOT NULL in the legacy table; the Prisma `Tournament` model does not read it yet). Add `games Int @map("Games") @db.SmallInt` to the model. The squad's web shape gets an effective `games` (as D-43 does for fee and ratios), so the recap route reads it from the squad repository. To verify while building: the test tables and `db:seed` already create `Games`.
- **Cross function** (`api/src/features/recapSheets/cross.ts`, pure):
  - `lanesInUse(pairs)`: both lanes of every pair with at least one assigned bowler, sorted. The doc says "unused pairs at the end drop out"; I read the first sentence of `LAN-18` as the rule, so an empty pair in the middle also drops. Check this against legacy before the cross tests lock in (worked examples have no middle gap).
  - `skipFor(lanes)`: the table in `lane-assignments.md`.
  - `cross(start, lanesInUse, skip, games, staggered)`: steps forward through the list with wrap, then swaps to the other lane of the pair on games 2, 4, 6, ...; the letter stays.
- Logging: reuse the lane route's once-per-process warning for positions outside the lanes; no new fields. Never log names.
- Never sent: SSN and the other fields in `BWL-17`; the lane route's rules apply.

## Web

Mockups: [index](recap-sheets-mockups/index.html), [modal](recap-sheets-mockups/modal.html), [sheet](recap-sheets-mockups/sheet.html).

New feature folder `web/src/features/recapSheets/`:

| File | Job |
| --- | --- |
| `types.ts` | Same shape as the API (change both together) |
| `api.ts`, `useRecapSheets.ts` | `fetch` and TanStack Query. Fetched when the modal opens (`enabled`), so the lane page costs nothing extra |
| `RecapSheet.tsx` (+ module CSS) | One half sheet: the markup in `sheet.html`. Sizes in inches and points. Handicap shows `-` when 0 or less; Totals is handicap × games or `-` |
| `RecapDialog.tsx` (+ module CSS) | The modal `<dialog>` (as `AssignDialog`): header with Close, sticky bar (skip radios, "n of m selected", Print selected, Print all), the warning, the scrolling list with a checkbox per sheet. Loading, error, empty states |
| `PrintSheets.tsx` | The print copy: the chosen sheets, one per page, in a portal on `document.body`, shown only while printing |
| `print.ts` | Prints: renders `PrintSheets`, calls `window.print()`, clears on the `afterprint` event |

- The lane page gets a "Recap sheets" button (in `LanesPage.tsx`, beside the division strip) that opens the dialog. The page does not change otherwise. It stays when the session is complete (D-63).
- **Print CSS.** `PrintSheets` sets `page: recap` and `@page recap { size: 8.5in 5.5in; margin: 0 }`, so only the recap print gets the half-sheet size and every other page prints as before. `@media print` hides the app root and the dialog; the portal shows. Each sheet has `break-after: page`. A named `@page` works in current Chrome and Firefox; Safari may print on the paper chosen in the dialog (the desk already loads half-sheet paper, D-62).
- **New tokens** in `tokens.css`: `--color-paper` (white), `--color-ink` (black), `--color-ink-muted`, the same in dark and light, because a sheet is paper whatever the theme. The sheet is the only user.
- **Asset.** Add `score-sheet-sponsors.png` (from the owner's Desktop) to `web/src/assets/`. It replaces legacy's header image; a new one each year is a file swap and a deploy. Shown at the column width with its own aspect ratio (1000 × 635), not stretched.
- **Scaling the preview.** Sheets are laid out at true size (8.5 × 5.5 in) and shown with CSS `zoom` in the dialog so they fit and stay readable.
- **States.** Loading (`Loading`, 2 rows), error (`QueryError`, or the setup message for a 422), empty ("No bowler has a lane yet, so there are no recap sheets. Assign lanes first, then print."), and the warning (`role="status"`) when `withoutLane` is above 0: "4 bowlers have no lane and get no sheet. The lanes in use change the cross, so print after everyone has a lane. Moves made on the lane page but not saved are not included."
- **Keyboard and a11y.** The checkboxes are labelled "Print Joe Fontaine"; the radios sit in a `<fieldset>` with a legend; Esc and Close end the dialog and focus returns to the button; "Print selected" is disabled with none checked. Each sheet has an `aria-label`. Add the open dialog to the axe test.
- **Selecting sheets** (mockup section 3): a checkbox per sheet, all checked at first; a "Find a bowler" box narrows the list (as D-49, names and division); "Select shown", "Select all", and "Clear"; a filter never unchecks anything, so a hidden checked sheet still prints; the count and "Print selected (n)" count every checked sheet. Unchecked sheets are dimmed and say "Not printing". A notice says the lanes come from all bowlers with a lane, whatever is checked. Selection lives in the dialog's state and resets when it closes.
- **No Add button logic** here; the signed-in label and hiding the button come at lock-down (D-66).

## Data

No new storage. One Prisma model change: `Tournament.games` (a read of an existing column; no migration, D-30). Types as above.

## Tests

| Rule | Proof |
| --- | --- |
| LAN-18 | `api/src/features/recapSheets/cross.test.ts`: lanes in use from the pairs (both lanes of a used pair, sorted, unused dropped); skip table at every boundary (16, 17, 24, 25, 32, 33, 40, 41, 48, 49, 56, 57) |
| LAN-19 | `cross.test.ts`: every worked example in `lane-assignments.md` (same and staggered, 1A, 2B, 8 games with wrap); the swap on even games; the letter never changes |
| RPT-05c | `recapSheets.test.ts` (`buildRecapSheets`): one sheet per bowler with a saved lane, lane order, unassigned and "Other positions" counted in `withoutLane`, handicap or pins, game count |
| RPT-05a | `RecapSheet.test.tsx`: columns, one row per game, `-` for handicap 0, Totals = handicap × games, lane labels |
| RPT-05 | `RecapSheet.test.tsx`: date `MM/dd/yyyy`, time `hh:mm tt`, name, division, the name under the bowler's signature line, the opposing line, Office Check, the image with alt text |
| RPT-08 | `routes.test.ts`: 200 squad and sweeper, 404 tournament, 404 squad or wrong kind, 400 bad id, 422 pairs, none assigned, `db.test` for `Games`; `app.test.ts` mounts it public |
| RPT-09 | `RecapDialog.test.tsx`: loading, error, empty, warning, skip radios switch the lane labels, checkboxes and the count, Print selected disabled at 0, Print all prints every sheet and Print selected the checked ones (`window.print` spied, the print copy counted), focus returns on close |
| RPT-05b | `web/e2e/tournaments.spec.ts`: open the modal from a squad and print preview; `page.pdf` with the print CSS gives pages of 8.5 × 5.5 in, one per sheet; `accessibility.spec.ts`: the open modal, dark and light |
| LAN-12 (button) | `LanesPage.test.tsx`: the button opens the dialog, also on a complete session |

Mutation tests run on `cross.ts` and `buildRecapSheets`; fix survivors.

## Steps

1. Docs only done already: decisions D-62 to D-67, Q-32. (Committed with this plan.)
2. API: `Tournament.games` in the Prisma model; squad web shape gets `games`; tests and types.
3. API: `cross.ts` with tests (worked examples first).
4. API: `buildRecapSheets` and the two routes, access label, tests, `app.test.ts`.
5. Web: tokens, assets, `RecapSheet` with tests.
6. Web: `api.ts`, `useRecapSheets`, `RecapDialog` (loading, error, empty, warning, skip, selection) with tests.
7. Web: `PrintSheets`, print CSS, `print.ts`, the button on the lane page, tests.
8. e2e: open and preview, PDF page size, axe. Mock handlers and factories in `src/mocks/`.
9. Run `npm run check`, e2e, mutation. Fix survivors.

Each step ends with lint, typecheck, and tests green, in the folder changed.

## Not doing

- Saved moves or lane changes from the recap modal (move command, after lock-down).
- Server PDF, "Save as PDF" button (D-62).
- Tournament name, squad number, QR code, or seat map on the sheet (D-63).
- Choosing sponsor images or positions in the app (Q-32).
- A signed-in check or hiding the button when signed out (lock-down, D-66).
- Copying lane assignments or pasting scores (D-67).
- Sheets for unassigned bowlers (D-65).
