---
name: pull-request-prep
description: Review pending changes against main (or a specified branch), flag issues against project standards, and write the review to pr-review.md. Hands off to /write-pr for the description. Usage: /pull-request-prep [base-branch]
---

Review all changes on the current branch against the project standards. Flag problems, write the review to `pr-review.md`, then offer the PR description.

## Arguments

- **base-branch** (optional): the branch this PR merges into. Defaults to `main`.

## Steps

### 1. Establish the diff

```
git diff <base-branch>...HEAD
git log <base-branch>...HEAD --oneline
git diff <base-branch>...HEAD --name-only
```

For a large diff, group the review by area: `web/src/features/*`, `web/src/shared`, `web/src/mocks`, `web/e2e`, `api/`, `.github/workflows`, `docs`, config.

### 2. Run the checks

Run from `web/` when anything under `web/` changed. Add `api/` checks once `api/` exists.

```
npm run lint
npm run format:check
npm run typecheck
npm test
```

Also run:

- `npm run test:e2e` when the diff changes a UI flow (routes, navigation, forms, data views) or any CSS. It includes the axe accessibility scan (`e2e/accessibility.spec.ts`). A violation there is a Blocker. Quote the rule id and the element.
- `npm run test:mutation` when the diff changes logic in hooks, `api.ts` files, or utilities. A surviving mutant means a missing or weak assertion. Report it as a Should Fix. Never lower the threshold in `stryker.config.json`.
- `npm audit` always. A new advisory can land upstream with no change to `package-lock.json` on this branch.
  - `high` or `critical`: Blocker. `moderate` or `low`: Should Fix.
  - If `npm audit fix` resolves it with no breaking bump, apply it and say so. If it needs `--force`, do not apply it. Flag it and let the owner decide.

Any failing check is a Blocker. Quote the failing output.

### 3. Check dependencies and pinned versions

If `package.json` changed:

- Each new dependency needs a reason and an alternative, per CLAUDE.md. If the PR does not state one, flag it as a Should Fix.
- Vitest must stay on 4.x until Stryker supports Vitest 5. Flag any upgrade as a Blocker.
- `package-lock.json` must change with `package.json`.

### 4. Check for secrets and stray files

Flag as Blockers:

- Any `.env*.local`, FTP credential, token, or key in the diff.
- Build output (`dist/`, `coverage/`, `reports/`) committed.
- Secrets in `.github/workflows` that are not read from `secrets.*`.
- A `VITE_*` variable that holds a secret. Everything in `VITE_*` ships to every browser.
- Edits to `public/mockServiceWorker.js`. `npx msw init` generates it.

### 5. Review the changes

Load these before reviewing:

- `CLAUDE.md`
- `docs/frontend-standards.md`
- `.claude/skills/ui-standards/SKILL.md` (when the diff touches `.tsx`, `.css`, or `index.html`)
- `docs/testing.md`
- `docs/deployment.md` (only if `.github/workflows` or deploy config changed)

Trace every flag to a rule in one of these. For each issue, record:

- **File and line**, as a link: `[Thing.tsx:42](web/src/features/x/Thing.tsx#L42)`
- **Rule violated**, with the document and section
- **Severity**

#### Severity levels

| Level             | Meaning                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 🚫 **Blocker**    | Breaks a hard rule, fails a check, leaks a secret, ships code with no test, or risks a security or correctness bug. Fix before the PR.   |
| ⚠️ **Should Fix** | Breaks a convention but will not fail at runtime: wrong file name, index as `key`, missing empty state. Fix unless there is a reason not to. |
| 💡 **Suggestion** | Helpful but not required: a cleaner abstraction, a simpler test, a docs note.                                                           |

#### Checklist

**TypeScript and React**

- [ ] No `any`. `unknown` is narrowed.
- [ ] Function components and hooks only
- [ ] No `useEffect` that derives state or fetches data
- [ ] Every list has a stable `key` (an id, not the index)
- [ ] Semantic HTML, labels on inputs, accessible names on buttons and links
- [ ] No secrets or hard-coded API hosts in the frontend

**UI and accessibility** (when the diff touches `.tsx` or `.css`)

- [ ] No hex, `rgb()`, or raw `px` color or spacing in component CSS. Values come from `tokens.css` tokens.
- [ ] A new color token has a dark and a light value, and its contrast was checked (4.5:1 text, 3:1 borders and UI parts)
- [ ] Component styles are in a `Component.module.css` next to the component. No ids, no `!important`, no element selectors in modules.
- [ ] No `outline: none` without a replacement focus style
- [ ] Interactive targets are at least `--target-min`
- [ ] Meaning is never shown by color alone (errors have text)
- [ ] Inputs have visible labels. Errors link to inputs with `aria-describedby`.
- [ ] One `<h1>` per page, no skipped heading levels, landmarks in place
- [ ] Meaningful images have `alt`. Decorative ones use `alt=""`. Icon-only buttons have an accessible name.
- [ ] A new page or route is added to `e2e/accessibility.spec.ts`
- [ ] No `eslint-disable` for a `jsx-a11y` rule without a stated reason

**Structure**

- [ ] Code lives in `src/features/<name>/`. `src/shared/` holds only code that two features use.
- [ ] Components render. Hooks hold logic. `api.ts` files call `fetch`. No `fetch` inside components.
- [ ] Server data goes through TanStack Query, not copied into `useState`
- [ ] File names: `PascalCase.tsx` components, `useThing.ts` hooks, `camelCase.ts` the rest
- [ ] Every data view handles loading, error, and empty states

**Testing**

- [ ] **Every new or changed source file with logic has a test in the diff.** Check this one by one. Do not infer it from tests elsewhere in the diff.
  1. List the new or changed non-test files under `web/src` (and `api/src`) that hold logic: components with conditions or handlers, hooks, `api.ts` files, utilities.
  2. For each, look for a matching `Thing.test.tsx` or `thing.test.ts` next to it, or an e2e spec that covers it.
  3. Flag each file with no test as a 🚫 Blocker. Name the file and say it has no coverage. Pure markup with no logic is exempt.
- [ ] Tests query by role and text (`getByRole`, `getByText`), not test ids
- [ ] The network is mocked with MSW (`src/mocks/`). No hand-mocked `fetch`.
- [ ] Test data comes from the `src/mocks/data.ts` factories. A test overrides only the fields it checks.
- [ ] A new API route has an MSW handler
- [ ] Tests check behavior the user sees, not implementation
- [ ] E2E: a changed main user journey has a Playwright spec in `web/e2e/`

**Config and CI**

- [ ] `VITE_USE_MOCKS` stays consistent across `.env.development`, `.env.production`, `.env.mocks`. Once the real API exists, it is gone from `.env.production`.
- [ ] `vite.config.ts` keeps `base: './'`
- [ ] Workflows read secrets from GitHub Actions secrets and pin action versions
- [ ] No Node version drift from `web/.nvmrc`

**Docs**

- [ ] `CLAUDE.md` status and plan reflect any step this PR completes or starts
- [ ] `CLAUDE.md` commands table matches `package.json` scripts
- [ ] New .NET-to-Node concepts the owner would meet are in `docs/dotnet-to-node.md`
- [ ] Changed standards appear in both `CLAUDE.md` (summary) and the matching `docs/` file

#### Follow-up review recommendations

`/code-review` and `/security-review` are separate commands. This skill does not run them. Decide each on its own. A PR can warrant both or neither.

- **Code review**: recommend `/code-review` when the diff has non-trivial logic: new or changed components, hooks, queries, or API code. Use `medium` for a routine single-feature PR and `high` for a large diff across several areas. Skip it for docs, config, or copy-only diffs and for pure test additions.
- **Security review**: recommend `/security-review` when the diff touches any of: authentication or authorization; an endpoint or form that takes user input; secrets, env vars, or workflow credentials; a new external call or third-party service; file upload or download; personal data; a new or upgraded dependency. Skip it for styling, test-only, and docs-only diffs.

### 6. Present the review

Use this structure:

---

## Pre-PR Review

### Checks

[One line each for lint, format, typecheck, test, e2e, mutation, audit: pass, fail, or skipped with the reason.]

### 🚫 Blockers

[Each blocker with file link and rule. If none: "None."]

### ⚠️ Should Fix

[Each item with file link and rule. If none: "None."]

### 💡 Suggestions

[Each suggestion. If none: "None."]

### 📄 Docs Updates

[Each stale spot in `CLAUDE.md` or `docs/`, with the proposed change. If none: "None. Docs are current."]

### 🔍 Recommended Follow-up Reviews

[For Code Review and Security Review: **Recommended** or **Not recommended**, then one or two sentences naming the files or patterns that decided it. For each recommended review, give the command to run.]

### ✅ Looks Good

[What you checked and found clean.]

---

Write this review verbatim to `pr-review.md` at the repo root. Overwrite if it exists. Then show the same content in chat.

Ask: **"Ready to generate the PR description, or do you want to fix any of these first?"**

### 7. Apply docs updates

If step 6 found docs updates, apply them now (a checked step in the plan, a row in the commands table), unless the owner said they will handle the findings. Show a short summary of what changed. Skip this step if there were none.

### 8. Generate the PR description

When the owner confirms, run the `write-pr` skill. It writes `pr-description.md` and gives the title and label advice. Do not duplicate its format here.

Do not add an AI attribution line to the description.
