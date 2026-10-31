# API route access

Built on branch `landingPage`. This is a platform rule with no legacy twin (D-27). The 0.2.0 release rule is "every route declares its access; undeclared routes deny".

## Rules

| ID     | Requirement                                                                                                                                                                                                                                                         | Differs from legacy | Tests                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------- |
| API-15 | New. `createApp` mounts every router through `mountRoutes`, as `{ path, access, router }`. `access` is `public` until sign-in exists (0.3.0 adds the rest). A group with no access label, or an unknown one, stops startup. A path that is not mounted answers 404. | New (D-27)          | `api/src/shared/mountRoutes.test.ts`, `api/src/app.test.ts` ("route access") |

## Notes

- Mounted today, all `public`: `/health`, `/ready`, `/v1/tournaments`, and the web-only routes under `/v1/tournaments/:id/` for divisions, squads, sweepers, registrations, the lane pages (`squads/:sessionId/lanes` and `sweepers/:sessionId/lanes`), and the recap sheets (`squads/:sessionId/recap-sheets` and `sweepers/:sessionId/recap-sheets`), the scores (`squads/:sessionId/scores` and `sweepers/:sessionId/scores`), and the results (`squads/:sessionId/results` and `sweepers/:sessionId/results`).
- `/v1/tournaments/:id/registrations` shows bowler names and entries. It ships public only because 0.2.0 has no auth. The lock-down release right after 0.3.0 puts it, and any other public read route that should not be public, behind auth (D-46, D-52).
- The recap sheets show bowler names and handicaps, so they ship public for the same reason, and the lock-down release puts them behind auth (D-66, D-52).
- The lane pages show bowler names and averages, so they ship public only for the same reason, and the lock-down release puts them behind auth too (D-59, D-52).
- The scores are public for good, so viewers who are not signed in watch scores come in. The lock-down release leaves them alone; only entry will need sign-in (D-70).
- The results are public for good, like the scores: viewers who are not signed in watch standings. The lock-down release leaves them alone (D-74). The at-large, seeding, and super sweeper routes (`/v1/tournaments/:id/at-large`, `/seeding`, `/super-sweeper`) are public for good too (D-85).
- The API enforces access; the web app only hides what a user cannot use (D-19).
- Do not call `app.use` with a router in `app.ts`. See `docs/api-standards.md`.
