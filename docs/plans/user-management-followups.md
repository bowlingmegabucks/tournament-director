# User management: follow-up work for 0.4.1

Branch `registerUser` built the first four slices of stage 3 (D-94, D-101): add a user, the set-password page, forgot password, and the admin users list with password reset (`USR-01` to `USR-18`, [user-management.md](../requirements/user-management.md)). This plan lists what is left, one branch each, so the first can be a pull request on its own. All of it is 0.4.1 work.

Each branch follows the usual path: settle the rules here, build with tests, run `npm run check` and the e2e suite, then add the rules to `docs/requirements/user-management.md` (next free ID is `USR-19`), tick the item in [v1-requirements.md](../v1-requirements.md), and run `/pull-request-prep` and `/write-pr`.

## Order

| #   | Branch            | Why it comes here                                                                                              |
| --- | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | `userEdit`        | The biggest gap: no way to remove someone's access without editing the database.                               |
| 2   | `userChecks`      | Checks the new code against a real database and with mutation tests. Do it before the work goes to production. |
| 3   | `userGoLive`      | Production setup. Nothing here works for real users until it is done.                                          |
| 4   | `userSelfService` | Optional. Only if the owner wants it before 1.0.0.                                                             |

## 1. `userEdit`: disable, enable, edit roles (built)

Built as `USR-19` to `USR-22`. One change from the plan below: the last-admin check on disable is the self-disable refusal, since the caller is always an enabled admin.

**Goal.** An admin can disable a user who has left, bring them back, and change a user's roles, from the users list.

**Rules to settle and write down**

- **Disable.** `POST /v1/users/:id/disable` and `POST /v1/users/:id/enable` (`users.manage`). Call Better Auth's `banUser` and `unbanUser` in-process with the admin's headers, as the existing user routes do. A ban ends the user's open sessions and blocks sign-in, which the existing sign-in tests already show. The sign-in page already says "This account is disabled. Ask an admin." (`WEB-05`). Disabled users stay in the list, marked "(disabled)" (`USR-17`). Never delete users: disabling keeps the history (see [better-auth-routes.md](../better-auth-routes.md)).
- **Edit roles.** `PATCH /v1/users/:id` with `{ roles }` (`users.manage`). At least one role, from `roleNames` (D-103). Call `setRole`; it takes effect on the user's next request. The web app reuses the role checkboxes from the add-user page (`roleLabels.ts`; a shared `RolePicker` component is the clean way).
- **Last-admin guard.** Refuse, with a 409 and a clear message, any change that would leave no enabled admin: disabling the last enabled admin, or removing `admin` from them. Better Auth already refuses a self-ban; keep that and test it. Decide in the plan whether an admin may remove their own `admin` role when another admin exists (suggested: yes).
- **Who did it.** Add `actorId` (the signed-in admin's id, from `callerOf(res)`) to the log lines for add, reset, disable, enable, and role change. The existing lines name the affected `userId` and never an email (`USR-08`); keep that. This is the audit trail; no new table.
- **Refresh.** After a change, the users list refetches. A role change for the signed-in admin themselves also refetches `['me']`.

**Web.** On each row of `/users`: a "Disable" or "Enable" button and an "Edit roles" button that opens a dialog (a native `<dialog>`, like the recap dialog). Disable asks for confirmation, since it signs the person out. Toasts report the result, and errors stay until dismissed.

**Tests.** API: 401/403/404/409, the last-admin cases, a disabled user's session ends, a role change reaches the next request, the logs hold `actorId` and no email. Web: each button, the dialog, confirmation, errors, and one Playwright journey plus an axe check of the dialog.

## 2. `userChecks`: real database and mutation tests

Nothing in `registerUser` has run against real MariaDB; the user tests use Better Auth's in-memory database.

- Add `*.db.test.ts` tests (Testcontainers, Docker) for `GET /v1/users` (sort by name, `banned` and `role` columns), `POST /v1/users` (create, duplicate email, rollback when the invite mail fails), reset-password (token used once), and `POST /v1/users/:id/password-reset`. Use the Better Auth tables from `api/prisma/auth-tables.sql`.
- Run `npm run test:mutation` in `api/` and `web/` and fix surviving mutants in the new code (`features/users`, `features/auth/routes.ts`, `shared/mail`, `SetPasswordPage`, `ForgotPasswordPage`, `UsersPage`, `NewUserPage`). Fix the tests, not the thresholds. If `reports/stryker-incremental.json` is missing, a full baseline run comes first; the owner runs it in a VS Code terminal.
- Split the link lifetime. Today an invite and a forgot-password link both last 72 hours (`resetLinkSeconds`). Suggested: invites 72 hours, forgot password and admin reset 1 hour. Better Auth has one setting, so either set the verification row's expiry in our `sendResetPassword` path or issue invite tokens another way. Settle in the plan; update the email wording (it states the hours) and `USR-03`, `USR-13`, `USR-16`.
- Test a mail failure on the first real send (see `userGoLive`).

## 3. `userGoLive`: production setup

Do these in order. They belong with the 0.4.0 steps for the API subdomain and turning on sign-in ([deployment.md](../deployment.md)).

1. **Tables.** Create the Better Auth tables on the production database with `api/prisma/auth-tables.sql` (once).
2. **First admin.** Run `npm run users:create-admin` against production (see [api-standards.md](../api-standards.md#database)).
3. **Mail settings** as App Service application settings: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `WEB_BASE_URL` ([user-management.md](../requirements/user-management.md#settings)). Never set `SMTP_ALLOW_SELF_SIGNED` in Azure.
4. **Mail records.** Add SPF and DKIM records for the sending domain so invites reach the inbox (Q-34). Send one real invite and one reset to a mailbox you own; check spam and the From address.
5. **Subdomain and sign-in.** The API on `api.bowlingmegabucks.com`, `AUTH_BASE_URL`, the CORS list, `TRUST_PROXY=1`, then `SHOW_SIGN_IN=true` and a redeploy. Until then production hides `/login`, `/set-password`, and `/forgot-password` (`WEB-07`). `WEB_BASE_URL` must be the exact address of the web app, with its path.
6. **Smoke test in production,** in this order: sign in as the admin; add a second user; open the invite from the real mailbox; set a password; sign in as that user; use Forgot password; send a reset from the users list. Check that the director and score keeper do not see "Users".
7. **Check the logs** (Application Insights): no email address, no link, no token in any line.

## 4. `userSelfService` (optional)

- **Change my own password.** Open Better Auth's `POST /change-password` (closed today) for a signed-in user: current password and new password, with the 12 to 128 character rule, and end other sessions. It needs its own throttle (it guesses a password), a page, and a link in the top bar's user area. Forgot password already covers the need, so skip it if it is not wanted.
- **My profile** (change my own name): only if wanted. Test first that a user cannot set their own role or banned flag through `POST /update-user` (see [better-auth-routes.md](../better-auth-routes.md)).

## Not planned

Self-sign-up, changing a user's email (an admin would remove and re-add), deleting users, impersonation, social sign-in, and per-tournament roles (D-96). Reasons are in [better-auth-routes.md](../better-auth-routes.md) and D-96 to D-103.
