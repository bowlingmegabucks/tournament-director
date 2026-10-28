# Testing

| Level              | Tool                           | Where                 | Run                     |
| ------------------ | ------------------------------ | --------------------- | ----------------------- |
| Unit / integration | Vitest + Testing Library + MSW | `src/**/*.test.ts(x)` | `npm test`              |
| End to end         | Playwright                     | `e2e/`                | `npm run test:e2e`      |
| Mutation           | Stryker                        | `stryker.config.json` | `npm run test:mutation` |

## Unit and integration

- Render the real component with the real hook. Fake only the network, using MSW.
- `src/test/setup.ts` starts the MSW server and fails any request without a handler. Add a handler per test with `server.use(...)`; resets run after each test.
- Use `renderWithClient` from `src/test/renderWithClient.tsx` for anything that uses TanStack Query.
- Use `findBy*` for things that appear after a fetch, `getBy*` for things already there.
- Use `userEvent` (not `fireEvent`) for clicks and typing.
- Cover the happy path, the empty state, and the error state.

## End to end

- Playwright builds the app with `--mode mocks` and serves it with `vite preview` on port 4173.
- Once the API deploys, add a second project that starts the real API (and a test database, if there is one) and checks one journey end to end. The current project stays on mocks.
- `e2e/accessibility.spec.ts` scans pages with axe (`@axe-core/playwright`) for WCAG 2.2 AA violations in dark and light mode, for the loaded, empty, and error states. Add each new page or route to it, with its states. jsdom cannot check contrast, so this runs in the browser.
- jsdom has no `<dialog>.showModal()` or `close()`. `web/src/test/setup.ts` stands in for both, enough to open, close, and fire `close`. Escape, the backdrop, and focus return are not simulated, so cover them in e2e (see the squad popup in `e2e/tournaments.spec.ts`).
- Keep e2e tests few and about user journeys. Logic belongs in unit tests.

## Mutation testing

- Stryker changes your code (flips a condition, empties a string) and reruns the tests. A test run that still passes is a "survivor": your tests did not notice the change.
- Compare to .NET Stryker.NET. Same idea and same tool family.
- Read `reports/mutation/mutation.html` to see survivors line by line.
- The 10 "errors" in a run are mutants that fail TypeScript checks. They are normal.
- Run it before a PR for changed features. A full run is slow, so add `-- --incremental` (`npm run test:mutation -- --incremental`): the first run writes `reports/stryker-incremental.json`, and later runs test again only the mutants whose code or covering tests changed (13 seconds instead of 80 in `api/` after a one-file change). The score still covers the whole project. Delete the file to force a full run.
- Pull requests and `main` use `--incremental` too, with the file kept in the Actions cache: a run starts from the newest cached file (its own branch, then `main`), so a pull request tests only what it changes. A run with no cached file does a full run. Pull requests run it without reporting. A push to `main` runs it again and sends the result to the [Stryker Dashboard](https://dashboard.stryker-mutator.io/reports/github.com/bowlingmegabucks/tournament-director/main) as modules `web` and `api` (set in each `stryker.config.json`), using the `STRYKER_DASHBOARD_API_KEY` Actions secret. Only the workflow adds the `dashboard` reporter (a command-line flag), so local runs never report.

## API (`api/`)

| Level              | Tool                    | Where                 | Run (in `api/`)           |
| ------------------ | ----------------------- | --------------------- | ------------------------- |
| Unit / integration | Vitest + Supertest      | `src/**/*.test.ts`    | `npm test`                |
| Database           | Vitest + Testcontainers | `src/**/*.db.test.ts` | `npm test` (needs Docker) |
| Mutation           | Stryker                 | `stryker.config.json` | `npm run test:mutation`   |

- Test through `createApp` with Supertest. It sends real HTTP requests in memory, so no port opens. Fake only storage: pass an in-memory or failing repository.
- Factories are in `src/test/factories.ts`. Override only the fields a test cares about.
- Cover happy path, empty result, bad input, missing resource, and storage failure (generic 500, no leaked detail).
- Config tests pass an object to `loadConfig`. They never set `process.env`.
- Coverage fails under 80%. Mutation thresholds match `web/` (break at 50, aim for 80).
- Test the real repository against a throwaway MariaDB 11.4.7 that Testcontainers starts once per run (the `db` Vitest project, files named `*.db.test.ts`). Call `resetDatabase(client)` in `beforeEach`; insert the rows each test needs. Keep these tests few: only what a fake cannot prove (type mapping, bad rows, outage, the ping). Route tests use the in-memory repository.
- The `db` files share one database, so they run one at a time. Stryker runs only the `unit` project (`vitest.stryker.config.ts`).
- See the `api-testing-patterns` skill for examples.
