# .NET to Node/React cheat sheet

| .NET                              | Here                                           |
| --------------------------------- | ---------------------------------------------- |
| `.csproj` + NuGet                 | `package.json` + npm                           |
| `packages.lock.json`              | `package-lock.json` (commit it)                |
| `dotnet restore` / `dotnet build` | `npm ci` / `npm run build`                     |
| `dotnet watch`                    | `npm run dev`                                  |
| `.editorconfig` + analyzers       | Prettier + ESLint                              |
| xUnit / NUnit                     | Vitest                                         |
| Stryker.NET                       | Stryker (JS)                                   |
| WebApplicationFactory             | Supertest against the Express app (API phase)  |
| `appsettings.json`                | `.env` files (`VITE_*` for the frontend)       |
| Razor / Blazor component          | React function component                       |
| `Component.razor.css` (scoped)    | `Component.module.css` (CSS Modules)           |
| `async`/`await` + `Task<T>`       | `async`/`await` + `Promise<T>`                 |
| `HttpClient`                      | `fetch`                                        |
| `IMemoryCache` for server data    | TanStack Query cache                           |
| `using` / DI container            | Import modules; pass dependencies as arguments |

Two traps: `npm install` can change the lockfile (use `npm ci` in CI), and `==` coerces types (always use `===`).
