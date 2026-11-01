# Plan: auth stage 2 (sign-in and permission checks)

Branch: `authSetup`. Delete this file when the work is done and the rules are in [docs/requirements/api-access.md](../requirements/api-access.md).

Stage 2 of D-94. No legacy twin: legacy has no user accounts (`SEC-01`).

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| API-15, API-16 | Already done | Access labels. Stage 2 fills in the user half of the check |
| API-17 | Already done, changes | `GET /v1/me` fills in `user` |
| API-18 (new) | In | Sign-in and sign-out through Better Auth, cookie session, 12 hours from last use |
| API-19 (new) | In | Each role maps to permissions in one table in `api/`; admin holds all |
| API-20 (new) | In | A signed-in user passes a protected group when their role holds its permission |
| API-21 (new) | In | First-admin script; local seed users |
| Web sign-in | In | `/login` page, sign-out, the app knows who is signed in |
| Web UI rules | In | `useMe`, `<Can>`, redirect and no-permission page (D-102) |
| User management | Later | Stage 3: admin-only create-user page, invites, roles, disable, forgot password (D-101, Q-34) |
| Lock-down | Later | The release after 0.3.0 labels the public read routes (D-52) |

## Decisions used

- D-19: the API enforces access; the web app only hides what a user cannot use.
- D-27: every route group declares its access.
- D-94: stage 2 holds the issuer, the tables, sign-in, and permission checks.
- D-96: routes ask for a permission, never a role. The role turns into permissions on each request.
- D-97: roles score keeper, director, admin, and the draft permission list.
- D-98: Better Auth inside `api/`, database sessions, email and password, no public sign-up.
- D-99: `httpOnly` cookie, 12 hours from last use. No one signs in to production before 0.4.0.
- D-100: Better Auth's default table names in the shared database, created by a SQL script. WinForms stays unchanged as the fallback until go-live.
- D-101: first admin from a script; invites wait for stage 3.
- D-102: what the UI shows when signed in or out.
- D-103: a user holds one or more roles; none by default. Permissions are the union.
- D-104: local-only quick-login buttons on `/login` (admin, tournament director, score keeper).

## API

- **Better Auth handler** at `/v1/auth/*` (sign-in, sign-out, get session), mounted as a `public` group before `express.json()` (Better Auth reads the body itself). Only `POST /v1/auth/sign-in/email`, `POST /v1/auth/sign-out`, and `GET /v1/auth/get-session` need to work; sign-up is off.
- **Settings**, read in `config.ts` only:
  - `AUTH_SECRET`: required, 32 characters or more. Signs the session cookie.
  - `AUTH_BASE_URL`: the API's public URL (`http://localhost:3000` locally).
  - Trusted origins come from `CORS_ORIGIN`, so Better Auth rejects a sign-in sent from any other site.
- **Session:** `expiresIn` 12 hours, `updateAge` 1 hour, so the 12 hours count from the last use. Cookie `httpOnly`, `SameSite=Lax`, `Secure` when `AUTH_BASE_URL` is `https`. CORS gains `credentials: true`.
- **Who is calling:** `identifyCaller` also asks Better Auth for the session behind the cookie (one database read per request; fine at about five users). The caller becomes `{ apiKey: boolean, user: User | null }`, because one request can carry both (API-17). `User` is `{ id, email, name, role }`, and permissions come from the role table, not the database.
- **Access check in `mountRoutes`:**
  - No key and no user: 401, as today.
  - A user whose role holds the permission: passes.
  - A valid key on a group that accepts it: passes.
  - Anything else: 403.
- **`GET /v1/me`:** `user` becomes `{ id, email, name, role, permissions }` or `null`. A sign-in whose user is disabled or gone counts as `null`.
- **No ping route.** `GET /ready` checks the API is up, and `GET /v1/me` shows who is signed in. The permission check is tested in `mountRoutes.test.ts` with test route groups and real role names, so every branch is covered without a route that ships.
- **Logging:** the request line names the caller type and the user id. Never the password, the cookie, or the email (D-95 style). Sign-in failures count in `tournament_director.auth.failures` with the reasons `bad_sign_in` and `sign_in_throttled`. Built in step 4.

## Web

- `useMe()`: a TanStack Query hook over `GET /v1/me`, the one source of "who is signed in" and "what may they do" (D-19, D-96). `<Can permission="…">` hides its children without the permission (D-102). A `RequirePermission` route wrapper redirects a signed-out visitor to `/login` and shows "You do not have permission to view this page." to a signed-in user without it. No shipped route uses the wrapper until the lock-down release; its tests use a test route.
- Every `fetch` sends `credentials: 'include'`, so the cookie goes along once the API sits on its own subdomain (0.4.0). Locally the Vite proxy keeps it on one origin.
- **Sign-in page** at `/login`: email, password, a submit button, and one error line ("Email or password is wrong.") with no hint about which one. Success goes back to the page the user came from.
- **Top bar:** "Sign in" when signed out; the user's name and "Sign out" when signed in.
- Nothing in the shipped pages is hidden yet: no page needs sign-in until the lock-down release, and no button needs a permission until the first command feature. The tools and their tests land now so those features only wrap their buttons.
- Mockups in `docs/plans/auth-stage-2-mockups/` (sign-in page with its states, top bar signed in and out) before Phase 4, per `ui-standards`.

## Data

New tables, ours alone (D-100), created by `api/prisma/auth-tables.sql`:

| Table | Holds |
| --- | --- |
| `user` | id, email (unique), name, email verified, role, banned, created, updated |
| `session` | id, user id, token, expires, IP, user agent |
| `account` | user id, provider (`credential`), password hash |
| `verification` | reset and invite tokens (stage 3 uses it; created now so the script runs once) |

Better Auth's Prisma adapter uses these names as they are, so no mapping is needed. Prisma models go in `schema.prisma` like the legacy ones; `prisma migrate` stays off. `resetDatabase` empties the new tables too. The Testcontainers setup runs the SQL script, which also proves the script works.

## Tests

| Rule | Test |
| --- | --- |
| API-18 | `features/auth/*.db.test.ts`: good sign-in sets the cookie; wrong password 401; unknown email 401 with the same message; sign-out ends the session; a session past 12 hours is refused; sign-up answers an error; a sign-in from an untrusted origin is refused |
| API-19 | `shared/auth/roles.test.ts`: each role's permissions, admin holds every permission, an unknown role holds none |
| API-20 | `shared/mountRoutes.test.ts`: user with the permission passes, without it 403, key plus user, disabled user |
| API-17 | `features/me/routes.test.ts`: `user` filled in for a signed-in caller, `null` otherwise |
| API-21 | the script's input checks; seed users exist after `db:seed` |
| `config` | `config.test.ts`: `AUTH_SECRET` missing or short stops startup |
| Web | `useMe`, `<Can>` (signed out, signed in without, with), `RequirePermission` (redirect, no-permission message, loading), `/login` page (success, wrong password, server error, loading), top bar both states; one e2e journey: sign in, see your name, sign out |

## Steps

Two parts, API first (owner decision, 2026-11-01). The API part ends with the API fully built and tested, and `GET /v1/me` is the contract the web part builds on. Nothing in the web part should need an API change; if it does, fix the API first.

### Part A: API

1. **Try it first. Done (2026-11-01).** `better-auth` 1.7.15 (MIT) works with Prisma 7 on MariaDB, Express 5, Node 24 type stripping, and the default table names. 26 checks passed: create users with our own role names, sign-in cookie (`HttpOnly`, `SameSite=Lax`, 12 hours), sliding expiry, expired session refused, wrong password and unknown email answer alike, sign-up refused, untrusted origin refused, ban stops an open session at once, role change shows on the next request, sign-out. Telemetry is off by default; set it off explicitly anyway. Not yet seen: the `Secure` flag (needs https) and Better Auth's own rate limiter (off outside production).
2. **Done.** SQL script, Prisma models, `resetDatabase`, and the Testcontainers setup.
3. **Done.** `config.ts`: `AUTH_SECRET`, `AUTH_BASE_URL`; CORS `credentials: true`.
4. **Done.** `createAuth(deps)` in `shared/auth/`, built in `server.ts` and passed to `createApp` like the other dependencies. Handler mounted at `/v1/auth`, open for sign-in and sign-out only; telemetry off.
5. **Done.** Role table (`shared/auth/roles.ts`) from D-97, with `rolesOf` and `permissionsOf` for a stored value that may list several roles (D-103).
6. **Done.** `identifyCaller` reads the session cookie (no cookie, no lookup) and passes on the fresh cookie when Better Auth renews or clears it; `mountRoutes` lets a user in when their roles hold the permission. A failed session lookup answers 503 on a protected route, not 401. A banned user counts as signed out at once, even if edited in SQL.
7. **Done.** `GET /v1/me` returns `{ apiKey, user }`, where `user` is `{ id, email, name, roles, permissions }` or `null`; a wrong key is 401, a failed session lookup is 503, and every answer is `no-store`. This is the contract Part B builds on.
8. **Done.** `npm run users:create-admin` in `api/` asks for email, name, and password (hidden, typed twice, 12 to 128 characters); it needs only `DATABASE_URL`, shows which database it will write to, and asks before adding to a database that has users. `db:seed` adds one local user per role (`admin@example.com`, `director@example.com`, `scorekeeper@example.com`) to a local database only, listed in `api-standards.md`.
9. **Done.** Docs: rules API-16 to API-21 in `api-access.md`; settings in `deployment.md` and `api-standards.md`; Better Auth and Identity in `dotnet-to-node.md`; CLAUDE.md status.
10. **Done.** `npm run check` passes for the repo, and Stryker on `api/` scores 99.6% (the five survivors are in `ttlCache.ts`, `registrations/repository.ts`, and one stale incremental result for a constant that a fresh run kills).

### Part B: Web (next, after Part A is merged)

11. Mockups in `docs/plans/auth-stage-2-mockups/` for the `/login` page (all states, and the three dev-only quick-login buttons, D-104) and the top bar, signed in and out; the owner approves them.
12. `useMe`, `<Can>`, `RequirePermission`, `credentials: 'include'` on every `fetch`, the `/login` page, the top bar, MSW handlers and factories for `/v1/me`. Add the quick-login buttons (D-104), shown only when `import.meta.env.DEV` is true and using the users and passwords from `api/src/db/seedUsers.ts`. Add a check that the production build contains neither the buttons nor the seeded passwords (search `dist/` after `npm run build`).
13. `npm run check`, e2e (sign in, see your name, sign out), and Stryker on the changed files in `web/`.

## Not doing

- Email, invites, the create-user page and other user screens, forgot password: stage 3 (D-101, Q-34). The other Better Auth endpoints stay closed; [better-auth-routes.md](../better-auth-routes.md) lists them and when we might open each.
- A bearer header or JWT (D-98, D-99).
- Labeling the 0.2.0 public routes: the lock-down release (D-52).
- An `Origin` check on our own write routes. `SameSite=Lax` already keeps the cookie off cross-site posts. Add the check with the first command route, since another site under `bowlingmegabucks.com` would count as same-site.
- Production sign-in on `azurewebsites.net`: it waits for the domain at 0.4.0 (D-99). Check production with `curl` and a cookie jar.
- Two-factor sign-in, per-tournament roles (D-96), and Better Auth's own access-control rules (we keep our role table).
