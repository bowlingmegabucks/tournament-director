# Proposed features (not in legacy)

Ideas from the old `rewrite/REWRITE_SPEC.md` and from this review. **None of these exist in legacy.** Each needs a yes or no before it is built.

| Feature | From | Notes |
| --- | --- | --- |
| User login and roles | rewrite spec §3 | **Approved, changed (D-94, D-96, D-97).** Roles are score keeper, director, and admin, each a set of permissions. SSN checks are admin only. Legacy has no users (`SEC-01`) |
| JWT sessions, 8-hour expiry | rewrite spec §10 | **Approved for stage 2 (D-94).** Expiry settled with the token issuer |
| Edit tournaments, divisions, squads, sweepers | rewrite spec §6, `plan/01-tournaments.md` | **Approved (D-12).** Field rules per feature |
| Delete tournaments, divisions, squads, sweepers | rewrite spec §6 | **Approved (D-15).** Rules per feature, discussed with editing |
| Tie-breaker marks on standings | review | **Built (D-14, D-16)** on squad and sweeper results; see [results.md](../requirements/results.md) |
| Tournament list filter by year or active | rewrite spec §6.1 | **Built in part (D-20).** The list groups into Current and upcoming over Past, by date. No year filter or search yet. Legacy shows all |
| Bowler search by USBC ID on screen | rewrite spec §6.3 | Legacy desk searches by name and email only |
| Bowler profile showing all their tournaments | rewrite spec §6.3 | |
| Payment list per registration; paid vs owed | rewrite spec §6.9 | Legacy stores payments but never shows them (`PAY-01`, `PAY-05`) |
| Record desk payments | rewrite spec §6.9 | See Q-17 |
| Delete a payment | rewrite spec §7.10 | |
| Pairing sheet PDF (lane assignments) | rewrite spec §6.6 | Legacy uses the clipboard and recap sheets instead |
| Recap sheet as PDF | rewrite spec §6.10 | **Built, as browser print not PDF (D-62 to D-66).** Legacy shows recap sheets on screen and prints them. See [recap-sheets.md](../requirements/recap-sheets.md) |
| 1099 report (name, address, SSN, prize amount) | rewrite spec §5.8 | Legacy stores SSNs but has no report and no prize amounts. See Q-22 |
| Audit log of who changed what, and who viewed an SSN | rewrite spec §10, post-MVP | |
| Cut-off for the registration site once the tournament starts | rewrite spec §8 | Legacy has no cut-off; the API key works at any time |
| Mobile-friendly score entry | rewrite spec post-MVP | |
| Live standings for bowlers (public results page) | review | **Built for squads and sweepers (D-74, D-79, D-84):** the public Results tab, refreshed every 15 s, marked unofficial until the session is complete. See [results.md](../requirements/results.md). **Also built for at-large, seeding, and the super sweeper (D-85, D-88):** see [finals-results.md](../requirements/finals-results.md) |
| Drag-and-drop lane assignment in the browser | rewrite spec §6.6 | **Built in part (D-55 to D-61).** Legacy drags a bowler onto a lane; the new app drags onto a pair and the API picks the seat. The page, the drag, and an on-screen move are built; saving comes with the move command after lock-down. See [lane-assignments.md](../requirements/lane-assignments.md) |
