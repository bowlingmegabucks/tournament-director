# v1.0.0 requirements

1.0.0 means the new app can replace the WinForms Tournament Manager. This file lists what must be true to say that. Check items off as we finish them. Add items when we find them.

Feature-level work (ports of legacy rules) lives in [docs/migration/](migration/README.md) and [docs/requirements/](requirements/README.md). This file covers the release as a whole.

## Release path

| Version | Scope                                                           |
| ------- | --------------------------------------------------------------- |
| 0.1.0   | Structure. Done.                                                |
| 0.2.0   | Read-only views on the existing database. Public routes only.   |
| 0.3.0   | Authentication and authorization, with a ping route to test it. |
| Next    | Lock down the read routes and pages that are public in 0.2.0. Before any command. |
| Then    | Commands, one feature area per release (0.4.0+ in the old plan). |
| 1.0.0   | Every item below is checked.                                    |

Version numbers follow content, not a countdown. 0.10.0 is fine.

## Feature parity

- [ ] Every legacy rule is `Done`, `Done, differs`, or `Dropped` with a decision ID (see the Status columns in `docs/migration/`).
- [ ] Every open question in [decisions-and-questions.md](migration/decisions-and-questions.md) is settled.

## Data and cutover

- [ ] The API reads and writes the existing database; the schema matches [database.md](migration/database.md).
- [ ] Compare app output with WinForms output on real tournament data (results, rankings, reports).
- [ ] Legacy sunset date set and a freeze date for the old app.
- [ ] Rollback plan written.
- [ ] Rename the misspelled `SuperSweeperCashRatio` column (legacy issue #101) after WinForms is off, and remove the mapping workaround in the API.
- [ ] One real tournament run end to end on the new app.
- [x] Remove the Check API button from Home once the API reads the production database (D-29).
- [ ] Deep links such as `/tournaments/abc` load on the GreenGeeks host (`.htaccess` rewrite, `base: '/'`). Check after the first deploy; the fallback is a hash router. See [deployment.md](deployment.md).

## Legacy issues

Review each open issue in [bowlingmegabucks/tournament-manager](https://github.com/bowlingmegabucks/tournament-manager/issues). For each, decide: bring it over (open an issue here or record a decision in [decisions-and-questions.md](migration/decisions-and-questions.md)), already handled by the rewrite, or drop. Open issues as of 2026-10-21:

- [ ] #130 Refactor presenter construction (service locator). WinForms only; likely moot.
- [ ] #124 Seeding Score (question)
- [ ] #122 Handicap on Seeding Report
- [ ] #113 Lane Assignment Sorting Options
- [ ] #112 Registration Timestamp (database change; likely 1.x)
- [ ] #101 Fix SuperSweeperCashRatio spelling on Tournament entity (bug; database change). **Rename the column right before the 1.0.0 release, once WinForms is sunset** (it needs the bad name). Until then the API maps the misspelled column to the correct name in code. The release checklist must include the rename.
- [ ] #97 Add/Update Unit Tests. Likely moot.
- [ ] #94 Update Squad/Sweeper Info
- [ ] #92 DNF in Squad Result Report
- [ ] #90 Sponsor Logos (database change; likely 1.x)
- [ ] #88 Duplicate Bowler Clean-Up
- [ ] #79 Running Totals on Squad Reports (question)
- [ ] #63 Lane Assignment (Changes) (bug)

Issues that need schema changes wait for a 1.x release, after WinForms is sunset. We do not read every issue body now; we check the relevant ones as we build each feature, and re-run `gh issue list` in the legacy repo before 1.0.0 for new ones.

## Security

- [ ] Auth approach decided and built (0.3.0).
- [x] Every route declares its access; undeclared routes deny (`API-15`, D-27). Only `public` exists until sign-in (0.3.0); recheck then.
- [ ] Roles and permissions reviewed against [security.md](migration/security.md).
- [ ] Personal data (bowler records) is behind auth.
- [ ] Lock-down release done before any command route (D-52): every public read route and page reviewed, and those that should not be public put behind auth.
- [ ] Lane assignments page and its route are signed-in only (D-59). They ship public in 0.2.0; label them in the lock-down release and hide the link when signed out.
- [ ] Registrations list (`GET /v1/tournaments/{id}/registrations` and its page) is signed-in only. It ships public in 0.2.0 (D-46); lock it down once 0.3.0 has auth, and hide the sidebar link when signed out.
- [ ] `npm audit` clean; pinned-version overrides in CLAUDE.md reviewed.

## Production readiness

- [ ] Database backups run, and a restore test passed.
- [ ] Alerts set in Application Insights.
- [ ] Hosting tier decided (the free App Service tier is slow after idle).
- [ ] Load test with a full tournament's users and score entry.

## People

- [ ] User guide.
- [ ] Walkthrough for the people who run tournaments.

## Release candidates

- [ ] `1.0.0-rc.1` tagged and trialled; fix and cut more as needed.

## Found along the way

Add items here as they come up, then move them to a section above.

-
