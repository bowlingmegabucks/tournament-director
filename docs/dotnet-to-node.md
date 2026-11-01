# .NET to Node/React cheat sheet

| .NET                              | Here                                                                 |
| --------------------------------- | -------------------------------------------------------------------- |
| `.csproj` + NuGet                 | `package.json` + npm                                                 |
| `packages.lock.json`              | `package-lock.json` (commit it)                                      |
| `dotnet restore` / `dotnet build` | `npm ci` / `npm run build`                                           |
| `dotnet watch`                    | `npm run dev`                                                        |
| `.editorconfig` + analyzers       | Prettier + ESLint                                                    |
| xUnit / NUnit                     | Vitest                                                               |
| Stryker.NET                       | Stryker (JS)                                                         |
| WebApplicationFactory             | Supertest against the Express app (API phase)                        |
| `appsettings.json`                | `.env` files (`VITE_*` for the frontend)                             |
| Razor / Blazor component          | React function component                                             |
| `Component.razor.css` (scoped)    | `Component.module.css` (CSS Modules)                                 |
| `async`/`await` + `Task<T>`       | `async`/`await` + `Promise<T>`                                       |
| `HttpClient`                      | `fetch`                                                              |
| MVC routes / Blazor `@page`       | `react-router`: `<Route path="tournaments/:id">`, `useParams()`      |
| `_Layout.cshtml` / `@Body`        | A layout route that renders `<Outlet />`                             |
| EF Core table-per-hierarchy       | One table with a type column (`Squads.SquadType`): one Prisma model, and each repository filters on the type |
| `IMemoryCache` for server data    | TanStack Query cache                                                 |
| `using` / DI container            | Import modules; pass dependencies as arguments                       |
| `ILogger<T>` + logging scope      | pino logger; `requestLogger(res, logger)` adds the request id        |
| OpenTelemetry in `Program.cs`     | `src/instrumentation.ts`, loaded with `node --import` before the app |
| `AddRateLimiter` middleware       | `express-rate-limit` (`createRateLimiter`)                           |
| ASP.NET Core Identity             | Better Auth inside `api/`: users and sessions in our database, hashed passwords, a session cookie (`createAuth`). See [better-auth-routes.md](better-auth-routes.md) |
| `UserManager.CreateAsync`         | `auth.api.createUser` (the first-admin script and, later, the create-user screen) |
| `IAuthenticationHandler`          | `identifyCaller`: works out who is calling before any route runs     |
| `[Authorize(Policy = "…")]`       | A route group's access label: `{ permission: 'scores.write' }` in `mountRoutes` |
| Roles and policy requirements     | `roles.ts`: each role holds permissions; routes ask for a permission, never a role |
| Lockout on failed sign-in         | `createSignInLimiter`: 10 failed sign-ins per address per 15 minutes |
| `PrintDocument` / `PrintPage`     | `window.print()` on a print-styled page: `@media print` and a named `@page` set the paper size (`PrintSheets`) |

Two traps: `npm install` can change the lockfile (use `npm ci` in CI), and `==` coerces types (always use `===`).
