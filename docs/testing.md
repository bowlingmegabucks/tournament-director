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
- Keep e2e tests few and about user journeys. Logic belongs in unit tests.

## Mutation testing

- Stryker changes your code (flips a condition, empties a string) and reruns the tests. A test run that still passes is a "survivor": your tests did not notice the change.
- Compare to .NET Stryker.NET. Same idea and same tool family.
- Read `reports/mutation/mutation.html` to see survivors line by line.
- The 10 "errors" in a run are mutants that fail TypeScript checks. They are normal.
- Run it before a PR for changed features, and in CI on a schedule (it is slow).

## API (`api/`)

| Level              | Tool               | Where                 | Run (in `api/`)         |
| ------------------ | ------------------ | --------------------- | ----------------------- |
| Unit / integration | Vitest + Supertest | `src/**/*.test.ts`    | `npm test`              |
| Mutation           | Stryker            | `stryker.config.json` | `npm run test:mutation` |

- Test through `createApp` with Supertest. It sends real HTTP requests in memory, so no port opens. Fake only storage: pass an in-memory or failing repository.
- Factories are in `src/test/factories.ts`. Override only the fields a test cares about.
- Cover happy path, empty result, bad input, missing resource, and storage failure (generic 500, no leaked detail).
- Config tests pass an object to `loadConfig`. They never set `process.env`.
- Coverage fails under 80%. Mutation thresholds match `web/` (break at 50, aim for 80).
- When the database arrives, test the real repository against a throwaway database, and keep the in-memory one for route tests.
- See the `api-testing-patterns` skill for examples.
