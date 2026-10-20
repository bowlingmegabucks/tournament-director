# Tournament Management

Bowling tournament management app. React frontend (`web/`), Node.js API (`api/`).
The owner is a .NET developer learning React and Node. Explain choices briefly and compare to .NET where it helps.

## Status and plan

1. `web/` hello world, fed by mock data (MSW + faker). **Done on branch `uiShell`.**
2. Merge to `main`, add a GitHub Action that builds `web/` and deploys it to GreenGeeks over FTP.
3. Build `api/` (Express + TypeScript). **Skeleton done on branch `api`:** health and tournament list routes (random demo data, 3 to 7 per call), tests, skills, CI. **Wired on the same branch:** `npm run dev` at the root starts both; Vite proxies `/api` to the API. Production still builds with mocks until step 4.
4. Deploy `api/`. **Host chosen: Azure App Service** (Web App `app-tournamentdirector-prod`). The `deploy-api` job in `deploy.yml` is written and runs before the web deploy. Waiting on the Azure quota request, then the first run. See [docs/deployment.md](docs/deployment.md). The web build reads the API origin from the `API_BASE_URL` variable. Once the API is live, remove `VITE_USE_MOCKS` from `web/.env.production`.
5. Theming and polish. **Done on branch `uiTheming`:** tokens, light/dark, logo header, `ui-standards` skill, a11y checks.

Also done on branch `claudeSkills`: project skills in `.claude/skills/` (React, TypeScript, testing, composition) and stricter ESLint rules.

## Revisit later

- **Dev container.** Not needed now: one developer, Node 24 from `web/.nvmrc`, and CI tests a clean environment. Raise it with the owner when any of these happens:
  - `api/` needs a database or other services (a dev container with Docker Compose starts them together).
  - A second contributor joins.
  - The owner wants to run Claude with broad permissions in a sandbox.

## Stack (decided)

| Area          | Choice                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------- |
| Frontend      | Vite + React + TypeScript (static build, no server)                                       |
| Server state  | TanStack Query over plain `fetch`                                                         |
| API           | Express + TypeScript                                                                      |
| Layout        | Two separate folders, no npm workspaces. Each has its own `package.json`                  |
| Packages      | npm. Commit `package-lock.json`                                                           |
| Lint / format | ESLint + Prettier                                                                         |
| Tests         | Vitest, Testing Library, MSW, Playwright, Stryker (web); Vitest, Supertest, Stryker (api) |
| API libraries | Zod (validation), helmet (headers), cors                                                  |

## Root commands

The root `package.json` only holds shortcuts. It is not an npm workspace; `web/` and `api/` keep their own `package.json` and lockfile.

| Command             | Does                                                             |
| ------------------- | ---------------------------------------------------------------- |
| `npm run setup`     | `npm ci` in the root, `api/`, and `web/`                         |
| `npm run dev`       | API (port 3000) and web (port 5173) together; web proxies `/api` |
| `npm run dev:mocks` | Web only, with MSW mocks (no API needed)                         |
| `npm run check`     | lint, format check, typecheck, and tests in `api/` and `web/`    |

## Commands (run in `web/`; `api/` has the same names, minus e2e)

| Command                                 | Does                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run dev`                           | Dev server; `/api` goes to the API on port 3000 (prefix stripped) (`npm run dev:mocks` for mocks) |
| `npm run build`                         | Typecheck and build to `dist/`                                                                    |
| `npm run lint` / `npm run format:check` | ESLint / Prettier check                                                                           |
| `npm run typecheck`                     | `tsc -b`                                                                                          |
| `npm test`                              | Unit and integration tests                                                                        |
| `npm run test:coverage`                 | Same, with coverage. Fails under 80%                                                              |
| `npm run test:e2e`                      | Playwright against a built preview with mocks                                                     |
| `npm run test:mutation`                 | Stryker mutation tests                                                                            |

`api/` also has `npm run start` (run the build) and `npm run dev` (watch mode with `.env`). Before you say a task is done, run lint, typecheck, test, and `format:check` in each folder you changed. Run e2e when you change UI flow.

## Pinned versions and gotchas

- **Vitest stays on 4.x.** Stryker's vitest runner 10.0.0 runs zero tests per mutant on Vitest 5. Do not upgrade until Stryker supports it.
- **MSW 3** renamed `onUnhandledRequest` to `onUnhandledFrame`. Docs older than 2026 show the old name.
- **`eslint-plugin-jsx-a11y` override in `web/package.json`.** The plugin lists ESLint up to 9 as a peer, and we use 10. The override (`"eslint": "$eslint"`) lets it install. The rules work on 10. Remove the override once the plugin supports ESLint 10.
- **`qs` override in `web/package.json`.** Stryker 10.0.0 pulls `qs` 6.15.1 (through `typed-rest-client`), which has moderate advisories. The override forces 6.16.1. Dev-only. Remove it once a Stryker release ships a fixed `qs`, then run `npm audit`.
- Node 24 (`web/.nvmrc`).
- Mocks are on when `VITE_USE_MOCKS=true` (`.env.production`, `.env.mocks`). `npm run dev` uses the real API through the Vite proxy; `npm run dev:mocks` and e2e use mocks. Delete the variable from `.env.production` once the API is deployed (step 4). Until then the live site needs the mocks, because it has no API to call.
- `vite.config.ts` sets `base: './'` so the build works from any folder on the host.
- `public/mockServiceWorker.js` is generated by `npx msw init`. Do not edit it.

## API standards (summary)

Details in [docs/api-standards.md](docs/api-standards.md).

- Node 24 runs the `.ts` files directly. Erasable syntax only (no `enum`, no constructor parameter properties). Imports keep the `.ts` extension.
- Organize by feature: `src/features/<name>/` holds `routes.ts`, `repository.ts`, `types.ts`, and tests.
- `createApp(deps)` takes its dependencies as arguments. Only `server.ts` builds the real ones.
- Routes are thin: validate input with Zod, call the repository, send the result. Throw `HttpError` for expected failures. Errors are `{ message }`.
- Read `process.env` only in `config.ts`. ESLint enforces it.
- Keep `helmet` and the CORS allow-list. The web `Tournament` shape and the API's must match.
- Test with Vitest + Supertest through `createApp`. Mutation: Stryker, same thresholds as `web/`.
- `qs` override in `api/package.json`: same Stryker advisory as `web/`. Remove it in both places together.

## Code standards (summary)

Details in [docs/frontend-standards.md](docs/frontend-standards.md).

- TypeScript strict. No `any`, no non-null `!`. Use `unknown` and narrow. ESLint enforces both.
- Function components and hooks only. No class components.
- Organize by feature: `src/features/<name>/` holds components, hooks, API calls, types, and tests together. Shared code goes in `src/shared/` only when two features need it.
- Components render. Hooks hold logic. `api.ts` files call `fetch`. Do not call `fetch` inside components.
- Server data goes through TanStack Query. Do not copy it into `useState`.
- Name components `PascalCase.tsx`, hooks `useThing.ts`, everything else `camelCase.ts`. Put a test next to its file: `Thing.test.tsx`.
- No `useEffect` to derive state or fetch data. Compute during render or use a query.
- Every list needs a stable `key` (an id, not the index).
- Handle loading, error, and empty states on every data view.
- Use semantic HTML and labels. Tests query by role and text, so the UI stays accessible. Target WCAG 2.2 AA. ESLint (`jsx-a11y`) and the axe e2e test enforce it.
- Style with CSS Modules and the tokens in `src/styles/tokens.css`. No raw colors in component CSS.
- No secrets in the frontend. Anything in `VITE_*` ships to every browser.

## Testing standards (summary)

Details in [docs/testing.md](docs/testing.md).

- Test behavior the user sees, not implementation. Query with `getByRole`, `getByText`, not test ids.
- Unit and integration: Vitest + Testing Library. Mock the network with MSW (`src/mocks/`), never mock `fetch` by hand.
- Test data comes from `src/mocks/data.ts` factories. Override only the fields a test cares about.
- E2E: Playwright in `web/e2e/`. Cover main user journeys only.
- Mutation: Stryker. Thresholds in `stryker.config.json` (break at 50, aim for 80). A surviving mutant means a missing or weak assertion. Fix the test, not the threshold.
- Write the test with the code. A change without a test is incomplete.

## Skills (`.claude/skills/`)

Claude loads a skill when the task matches its description. The rules above stay short; the skills hold examples and checklists.

| Skill                           | Use for                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `react-patterns`                | Components, hooks, TanStack Query, state, effects                                                        |
| `typescript-standards`          | Types, narrowing, unions, API typing                                                                     |
| `testing-patterns`              | Vitest, MSW, factories, Playwright, Stryker survivors                                                    |
| `composition-patterns`          | Component API design: compound components, boolean props. Third party (Vercel, MIT), see its `SOURCE.md` |
| `ui-standards`                  | Designing or styling any screen: tokens, CSS Modules, semantic HTML, forms, WCAG 2.2 AA checklist        |
| `api-patterns`                  | Routes, repositories, Zod validation, errors, config in `api/`                                           |
| `api-testing-patterns`          | Vitest + Supertest, factories, error-path tests, Stryker survivors in `api/`                             |
| `pull-request-prep`, `write-pr` | Review and describe a branch before the PR                                                               |

Read any third-party skill before you add it. A skill steers Claude like code. Do not add skills that fetch their instructions from a URL at run time.

## Git and CI

- Branch from `main`. Small, focused commits. Commit messages in the imperative.
- Never commit `.env*.local`, FTP credentials, or build output.
- Deploy secrets live in GitHub Actions secrets. Never in the repo.
- See [docs/deployment.md](docs/deployment.md) for the GreenGeeks plan.

## Working with the owner

- Before you add a dependency, say why and what the alternative is.
- When a .NET concept has a Node/React twin, say so once (see [docs/dotnet-to-node.md](docs/dotnet-to-node.md)).
- Check library docs (Context7) before you use an API from memory. Major versions here are new and APIs change.
