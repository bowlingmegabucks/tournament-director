# v1.0.0 requirements

1.0.0 means the new app can replace the WinForms Tournament Manager. This file lists what must be true to say that. Check items off as we finish them. Add items when we find them.

Feature-level work (ports of legacy rules) lives in [docs/migration/](migration/README.md) and [docs/requirements/](requirements/README.md). This file covers the release as a whole.

## Release path

| Version | Scope                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------ |
| 0.1.0   | Structure. Done.                                                                                 |
| 0.2.0   | Read-only views on the existing database. Public routes only.                                    |
| 0.3.0   | Sign-in and permission checks (Better Auth, D-98) and signed-in UI rules (D-102).                |
| 0.4.0   | Lock-down of public read routes, vendor routes (API key), cutover to `api.bowlingmegabucks.com`. |
| Then    | Commands, one feature area per release.                                                          |
| 1.0.0   | Every item below is checked.                                                                     |

Version numbers follow content, not a countdown. 0.10.0 is fine.

## Feature parity

- [ ] Every legacy rule is `Done`, `Done, differs`, or `Dropped` with a decision ID (see the Status columns in `docs/migration/`).
- [ ] Every open question in [decisions-and-questions.md](migration/decisions-and-questions.md) is settled.
- [x] The desk can generate and print recap sheets for a squad or sweeper, with the cross (`RPT-05`, `LAN-12`; [recap-sheets.md](requirements/recap-sheets.md)).

## Data and cutover

- [ ] The API reads and writes the existing database; the schema matches [database.md](migration/database.md).
- [ ] Compare app output with WinForms output on real tournament data (results, rankings, reports). Still open: squad, sweeper, at-large, seeding, and super sweeper results are built but not yet compared on real data.
- [ ] Legacy sunset date set and a freeze date for the old app.
- [ ] Rollback plan written.
- [ ] Rename the misspelled `SuperSweeperCashRatio` column (legacy issue #101) after WinForms is off, and remove the mapping workaround in the API.
- [ ] One real tournament run end to end on the new app.
- [x] Remove the Check API button from Home once the API reads the production database (D-29).
- [ ] Deep links such as `/tournaments/abc` load on the GreenGeeks host (`.htaccess` rewrite, `base: '/'`). Check after the first deploy; the fallback is a hash router. See [deployment.md](deployment.md).

## Legacy issues

Review each open issue in [bowlingmegabucks/tournament-manager](https://github.com/bowlingmegabucks/tournament-manager/issues). For each, decide: bring it over (open an issue here or record a decision in [decisions-and-questions.md](migration/decisions-and-questions.md)), already handled by the rewrite, or drop. Open issues as of 2026-10-21:

- [ ] #130 Refactor presenter construction (service locator). WinForms only; likely moot.
- [x] #124 Seeding Score (question). Answered: each finalist seeds on their best single squad entry (RES-19, built in finals results)
- [x] #122 Handicap on Seeding Report. Built as an HDCP column that shows when someone in the division has a handicap (D-92)
- [ ] #113 Lane Assignment Sorting Options
- [ ] #112 Registration Timestamp (database change; likely 1.x)
- [ ] #101 Fix SuperSweeperCashRatio spelling on Tournament entity (bug; database change). **Rename the column right before the 1.0.0 release, once WinForms is sunset** (it needs the bad name). Until then the API maps the misspelled column to the correct name in code. The release checklist must include the rename.
- [ ] #97 Add/Update Unit Tests. Likely moot.
- [ ] #94 Update Squad/Sweeper Info
- [x] #92 DNF in Squad Result Report. Built as the "Did not finish" and "No show" sections (D-75). The owner is moving the issue to this repo
- [ ] #90 Sponsor Logos (database change; likely 1.x)
- [ ] #88 Duplicate Bowler Clean-Up
- [ ] #79 Running Totals on Squad Reports (question). Later: not part of the squad results slice
- [ ] #63 Lane Assignment (Changes) (bug)

Issues that need schema changes wait for a 1.x release, after WinForms is sunset. We do not read every issue body now; we check the relevant ones as we build each feature, and re-run `gh issue list` in the legacy repo before 1.0.0 for new ones.

## Security

- [x] Auth approach decided and the API built (0.3.0): Better Auth, database sessions in a cookie, roles and permissions, `GET /v1/me` (D-98 to D-103, `API-16` to `API-21`).
- [x] Web sign-in (`WEB-01` to `WEB-08`): `/login`, `useMe`, `<Can>`, the top bar, and the dev-only quick-login buttons with the production-build check (D-102, D-104).
- [ ] User management: admin-only create-user page, email invites, roles, disable, forgot password (stage 3, D-101, Q-34).
- [x] API key for the registration site: `API_KEY` in `x-api-key`, permission-based access labels, and `GET /v1/me` (stage 1, D-94 to D-97, `API-16`, `API-17`).
- [x] Every route declares its access; undeclared routes deny (`API-15`, D-27). Permission labels now work for users and the API key (`API-16`); the lock-down release (`API-22`) now uses them.
- [ ] Roles and permissions reviewed against [security.md](migration/security.md).
- [x] Personal data (bowler records) is behind auth. The scores view is the one exception: it shows names and scratch scores to everyone on purpose (D-70). Results and the finals pages show names and pin totals the same way (D-74, D-85).
- [x] Lock-down release done before any command route (D-52, D-105, `API-22`): every public read route and page reviewed. The registrations list, lane pages, and recap sheets are behind auth; the vendor tournament routes, divisions, squads, sweepers, scores, results, and finals stay public. Still to do in 0.4.0: the registration site's key routes (`API-05` to `API-08`, labeled `apiKey: true`) and the API subdomain.
- [x] Lane assignments page and its route are signed-in only (D-59, D-105): `lanes.read`, link and tab hidden when signed out.
- [x] Recap sheet routes (`.../squads/{sessionId}/recap-sheets` and the sweeper twin) and the "Recap sheets" button are signed-in only (D-66, D-105): `lanes.read`; the button sits on the lane page.
- [x] Registrations list (`GET /v1/tournaments/{id}/registrations` and its page) is signed-in only (D-46, D-105): `registrations.read`, sidebar link hidden when signed out.
- [ ] `npm audit` clean; pinned-version overrides in CLAUDE.md reviewed.

## Production readiness

- [ ] Database backups run, and a restore test passed.
- [ ] Alerts set in Application Insights.
- [ ] Hosting tier decided (the free App Service tier is slow after idle).
- [ ] Live score updates reach every open Scores tab, signed in or not, without polling (Q-33; polls every 15 s until then, D-72).
- [ ] Load test with a full tournament's users and score entry.
- [ ] Several desk users can work at once: lane moves and new registrations show on every open screen (WebSockets or similar, Q-27), and two people racing for the last seat of a pair get one winner and a clear message for the other (Q-28).

## People

- [ ] User guide.
- [ ] Walkthrough for the people who run tournaments.

## Release candidates

- [ ] `1.0.0-rc.1` tagged and trialled; fix and cut more as needed.

## Found along the way

Add items here as they come up, then move them to a section above.

- [x] Caching reviewed before the 0.2.0 tag. Squad and sweeper results and scores now cache 5 s like the finals routes (`LIVE_CACHE_MS`). Lanes, recap sheets, and registrations do not cache: few viewers, and they go behind auth. See [api-standards.md](api-standards.md#caching). Recheck if a cached route gains sign-in.
