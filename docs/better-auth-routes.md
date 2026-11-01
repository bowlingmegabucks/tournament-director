# Better Auth endpoints

Better Auth (D-98) brings 45 HTTP endpoints and one server-only call. We open **two** of them. This page lists the rest, what each does, and when we might open it, so we can decide later without reading its source. Counts and paths are from Better Auth 1.7.15 with the `admin` plugin. After an upgrade, compare against `Object.keys(auth.api)`.

## Where this stands

- `features/auth/routes.ts` lists the open paths. Every other path under `/v1/auth` answers 404, even for a signed-in admin (`routes.test.ts`, "Better Auth paths we do not open").
- Opening one means: add it to that file on purpose, write its test, decide its rate limit (anything that guesses a secret needs one), and make the web app send the cookie (`credentials: 'include'`, D-99). Every POST that carries the cookie must come from a page in `CORS_ORIGIN`, or Better Auth answers 403.
- Admin paths check Better Auth's own admin role (`admin`, set in `createAuth.ts`). Our permission table (D-96) still decides what routes of ours allow; do not use `POST /admin/has-permission` for that.
- Where a user-management screen needs a rule of ours (D-103: at least one role), put our own route in front and call `auth.api.<name>` in the same process. The library endpoint stays closed.
- The .NET twin is ASP.NET Core Identity's `UserManager` and `SignInManager`.

## Open now

| Method and path | What it does |
| --- | --- |
| `POST /sign-in/email` | Email and password in, session cookie out. A wrong password and an unknown email answer alike. Throttled to 10 refused sign-ins per address per 15 minutes (a failure of ours, a 5xx, does not count). The answer is `{ redirect, user }`: a hook drops `token`, which Better Auth would also send. A database that cannot be reached answers 503 `Database unavailable`. |
| `POST /sign-out` | Ends the session and clears the cookie. **Known limit:** if the database cannot be reached, Better Auth logs the failure, clears the cookie anyway, and reports success, so the session row lives until it expires (12 hours at most). It never answers 503 here. |

## Closed: sessions

| Method and path | What it does | Identity twin | When we might open it |
| --- | --- | --- | --- |
| `GET`, `POST /get-session` | Returns the session and user behind the cookie. | `HttpContext.User` | Not needed. The API reads the session in-process on every request, and the web app asks `GET /v1/me` (D-102). Open only if a client needs Better Auth's own shape. |
| `GET /list-sessions` | Every live session of the signed-in user (their devices). | none | A "where am I signed in" page. Low value for five users. |
| `POST /revoke-session` | Ends one of the user's own sessions. | `SignOutAsync` for a device | With the page above. |
| `POST /revoke-sessions` | Ends all of the user's sessions, this one too. | `UpdateSecurityStampAsync` | A "sign out everywhere" button, for a lost phone or a shared desk PC. |
| `POST /revoke-other-sessions` | Ends every session except the current one. | same | The same button, kept signed in here. Pair with change password. |
| `POST /update-session` | Changes extra fields on the session. | none | No. We store nothing extra on sessions. |

## Closed: the signed-in user's own account

| Method and path | What it does | Identity twin | When we might open it |
| --- | --- | --- | --- |
| `POST /change-password` | Current password plus a new one. Enforces the 12-character minimum. Can end other sessions. | `ChangePasswordAsync` | A "change my password" page. Likely soon after stage 3. |
| `POST /verify-password` | Checks the signed-in user's password without changing anything. | `CheckPasswordAsync` | A "confirm your password" step before a sensitive action, if we ever want one (for example before SSN checks, `BWL-17`). |
| `POST /update-user` | The user edits their own name or image. | `UpdateAsync` | A "my profile" page. **Before opening, test that a user cannot set their own role or banned flag through it.** |
| `POST /change-email` | Moves the account to a new email, after the user confirms it. | `ChangeEmailAsync` | Probably never. An admin changes an email (`/admin/update-user`), since the email is the sign-in name. Needs email (Q-34). |
| `POST /delete-user`, `GET /delete-user/callback` | The user deletes their own account. | `DeleteAsync` | No. We disable users instead of deleting them. |
| `GET /list-accounts` | Sign-in methods linked to the user (password, Google). | `GetLoginsAsync` | No. Only email and password exist. |
| `POST /link-social`, `POST /unlink-account` | Add or remove a Google or similar login. | `AddLoginAsync` | No. See social sign-in below. |
| `GET /account-info` | Details of a linked social account. | none | No. |

## Closed: forgot password, invites, email checks

All three need the API to send email, which is Q-34 (stage 3).

| Method and path | What it does | Identity twin | When we might open it |
| --- | --- | --- | --- |
| `POST /request-password-reset` | Emails the user a one-time link. | `GeneratePasswordResetTokenAsync` | "Forgot password" and the invite (D-101): an admin creates a user, and the same link lets them set a first password. Needs a `sendResetPassword` function that sends the mail. Rate limit it, and answer the same whether or not the email exists. |
| `GET /reset-password/:token` | Where the emailed link lands; Better Auth checks the token and redirects to a web page with it. | none | With the one above. The web page is ours. **The token is in the URL path.** The request log already replaces it with `[redacted]` (`redactSecrets` in `requestLogging.ts`, tested). Still to do when opening this route: OpenTelemetry's HTTP spans record the URL too, so redact the path there (a `requestHook` on the HTTP instrumentation in `telemetry.ts`) and test it, or tokens reach Seq and Application Insights. |
| `POST /reset-password` | The new password plus the token. Enforces the minimum length. | `ResetPasswordAsync` | With the two above. |
| `POST /send-verification-email`, `GET /verify-email` | Proves the user owns the address. | `GenerateEmailConfirmationTokenAsync` | Probably never. An admin creates each account, and finishing the invite already proves the address. |
| `setPassword` (server-only, no HTTP path) | Sets a password on an account that has none. | `AddPasswordAsync` | Only if we add social sign-in. |

## Closed: admin plugin

These need a signed-in `admin`. The stage 3 user screens open them, one at a time, behind the rules in [D-101](migration/decisions-and-questions.md) and [D-103](migration/decisions-and-questions.md).

| Method and path | What it does | Identity twin | When we might open it |
| --- | --- | --- | --- |
| `POST /admin/create-user` | Makes a user with email, name, roles, and optionally a password. Does not check the password length. | `CreateAsync` | Stage 3 create-user screen, through our own route that requires at least one role (D-103) and then starts the invite (D-101). The first-admin script (step 8) calls `auth.api.createUser` in-process. |
| `GET /admin/list-users` | Users, with search, sort, and paging. | `Users` query | Stage 3 users list. |
| `GET /admin/get-user` | One user by id. | `FindByIdAsync` | Stage 3 edit page. |
| `POST /admin/update-user` | Admin edits name, email, and other fields. | `UpdateAsync` | Stage 3 edit page. |
| `POST /admin/set-role` | Changes a user's roles. Takes effect on the user's next request (tested). | `AddToRoleAsync`, `RemoveFromRoleAsync` | Stage 3 edit page. Add our rule: at least one role (D-103). |
| `POST /admin/ban-user`, `POST /admin/unban-user` | Disables or re-enables a user, with a reason and an optional end date. An open session stops at once and sign-in is refused (tested). An admin cannot ban themselves. | `SetLockoutEndDateAsync` | Stage 3 "Disable" and "Enable". This is how we remove someone; it keeps history. |
| `POST /admin/list-user-sessions` | A user's live sessions. | none | Stage 3, if admins want to see them. |
| `POST /admin/revoke-user-session`, `POST /admin/revoke-user-sessions` | Ends one or all sessions of a user. | `UpdateSecurityStampAsync` | Stage 3 "Sign out this user", for a lost device. A ban also ends them. |
| `POST /admin/set-user-password` | An admin picks another user's password. | `RemovePasswordAsync` + `AddPasswordAsync` | No. The admin should never know a password (D-101). Use a reset link. |
| `POST /admin/remove-user` | Deletes a user and their data for good. | `DeleteAsync` | Probably never. Disable instead. |
| `POST /admin/impersonate-user`, `POST /admin/stop-impersonating` | The admin acts as another user. | none | No. It blurs who did what. If a support need appears, talk first and log it. |
| `POST /admin/has-permission` | Better Auth's own permission check. | `IAuthorizationService` | No. Our role table decides (D-96). |

## Closed: other ways in

| Method and path | What it does | Why closed |
| --- | --- | --- |
| `POST /sign-up/email` | Public self-registration. | Off in the library (`disableSignUp`) and not routed. Users come from an admin (D-98). |
| `POST /sign-in/social`, `GET`, `POST /callback/:id`, `POST /get-access-token`, `POST /refresh-token` | "Sign in with Google" and the token calls behind it. | Not planned. About five users with admin-made accounts need no second identity provider. Revisit if people ask. |
| `GET /ok`, `GET /error` | A library health check and an error page. | We have `/health` and `/ready`. The error page would show library text. |
