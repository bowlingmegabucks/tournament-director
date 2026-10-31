# Navigation and layout

Built on branch `landingPage`. These rules have no legacy twin: the WinForms app opened a tournament list, then a portal menu form (see [screens.md](../migration/screens.md)). The decisions are D-18 to D-23.

## Rules

| ID     | Requirement                                                                                                                                                                                                                                                                                                         | Differs from legacy                                       | Tests                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| NAV-01 | New. The logo header and a main menu (Home, Tournaments) show on every page. The link for the current page carries `aria-current="page"`. Each page sets its own `<title>`.                                                                                                                                         | New (D-22)                                                | `web/src/shared/AppShell.test.tsx`, `web/src/features/tournaments/TournamentLayout.test.tsx`; `web/e2e/accessibility.spec.ts` |
| NAV-02 | New. The tournament in context is in the URL (`/tournaments/{id}/…`). The tournament sidebar (name, dates, "Change tournament") shows only under that path, never on Home, the list, or a not-found page. Items for features not built yet do not appear. Items a user may not use are hidden, not disabled (D-19). | New (D-19, D-21, D-22). Replaces the WinForms portal menu | `web/src/features/tournaments/TournamentLayout.test.tsx`; `web/e2e/tournaments.spec.ts`                                       |
| NAV-03 | New. An address with no page shows "Page not found" with a link Home. An unknown tournament id shows "Tournament not found" with a link to all tournaments, and no sidebar.                                                                                                                                         | New                                                       | `web/src/shared/AppShell.test.tsx`, `web/src/features/tournaments/TournamentLayout.test.tsx`; `web/e2e/accessibility.spec.ts` |

## Layout

Top bar for the app, sidebar for the tournament, page header for a squad or sweeper (D-22). On a phone the sidebar stacks above the page. The routes are in `web/src/App.tsx`; see "Routing and layout" in [docs/frontend-standards.md](../frontend-standards.md) for how to add a page.

The sidebar lists Divisions, Squads, Sweepers, Registrations, At-large, and Seeding (D-47, D-87). The super sweeper results open from a link above the Sweepers cards, not from the sidebar (D-23, D-87).

## Designed, not built

`NAV-04` (Later; D-22, D-23). Built in part with lane assignments (D-60, [lane-assignments.md](lane-assignments.md), `LAN-15`): the breadcrumb, the date with its status, and the Lane assignments and Scores tabs (`SCR-17`). The Complete button and the Results tab are still to come, and the Squads and Sweepers card lists now link to the session pages.

- The sidebar's **Squads** and **Sweepers** items open a **card list** of sessions: date and time, Open or Complete, lanes, fee, and ratios. The cards show no entry counts: those pages stay public, and the counts sit on the Registrations page (D-50). An Add button on the list comes with commands (0.4.0 and up).
- Inside one squad or sweeper, the sidebar does not change, with its parent item marked `aria-current="location"`. The page header has a **breadcrumb** (Squads / the session), the **name** with its status badge, a **Complete** button (a complete squad is locked, D-10), and **tabs** for that session's pages: Lane assignments, Scores, Results.
- A sweeper uses the same header. **Super sweeper results** are reached from the sweeper card list, not from the sidebar's results group (D-23).
- URL shape: `/tournaments/{id}/squads/{squadId}/scores` and `/tournaments/{id}/sweepers/{sweeperId}/…`.
