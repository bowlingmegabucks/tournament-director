---
name: migrate-feature
description: Port one feature from the legacy WinForms Tournament Manager. Looks up the rules in docs/migration/, settles every open question tied to them, writes a plan to docs/plans/, builds it with tests, then records the result in docs/requirements/ and marks the migration docs. Usage: /migrate-feature <what we are migrating>
---

Port one feature from legacy, using `docs/migration/` as the source of truth. The owner describes the feature; you find the rules, settle the questions, plan, build, and record.

Work in five phases. **Stop for the owner's OK at the end of each phase.** Do not skip ahead, even if the answer looks obvious.

## Arguments

- **feature** (required): the owner's words for what to migrate, such as "create and list tournaments" or "division setup". If missing, ask.

## Files you touch

| File | Role |
| --- | --- |
| `docs/migration/*.md` | Legacy rules. Read them. Add a Status column when rules are done |
| `docs/migration/decisions-and-questions.md` | Move answered questions to Decisions; add new D-xx and Q-xx |
| `docs/migration/proposed-features.md` | Mark a proposed feature approved or built when this feature covers it |
| `docs/plans/<feature>.md` | Temporary plan. Deleted in the last phase |
| `docs/plans/<feature>-mockups/*.html` | Temporary UI mockups, when the feature has UI. Deleted with the plan |
| `docs/requirements/<feature>.md` | Lasting record of what the new app does. Format in [docs/requirements/README.md](../../../docs/requirements/README.md) |

Use a short kebab-case slug for `<feature>`, matching the migration file when there is one (`tournaments`, `divisions`).

## Phase 0: Set up

1. Check git. If on `main`, make a branch: `git checkout -b migrate-<feature>`. If the working tree has changes not part of this work, tell the owner and ask before you go on.
2. Read, in this order:
   - `docs/migration/README.md`, `glossary.md`, `domain-model.md`
   - The feature file(s) the description points to
   - `decisions-and-questions.md` (all of it: decisions apply everywhere)
   - `proposed-features.md`, `rewrite-corrections.md`
   - The parts of `screens.md`, `integration-api.md`, `database.md`, `reports.md`, and `security.md` that cite this feature's rules or tables. Search for the rule prefix (`grep -n "TRN-" docs/migration/*.md`).
3. Read what is already built: `docs/requirements/`, `api/src/features/`, `web/src/features/`. A rule may be partly done.
4. Do **not** open the legacy code in `tournament-manager` unless a rule is unclear and the owner agrees. The docs replace it.

## Phase 1: Scope

List **every** rule in the feature file(s), plus rules from other files that this feature depends on (a rule that cites another, like `TRN-12` citing `RES-12`). Sort each into:

- **In**: built in this run.
- **Later**: belongs to a later feature or a later slice of this one. Say which.
- **Dropped**: the new app will not do this. Needs a D-xx with a reason.
- **Already done**: in `docs/requirements/`. Note it and move on.

Show it as a table: ID, one-line summary, proposed bucket, why. Also list:

- **Defects** from the Defects index that touch In rules. D-02 says fix them; confirm none is vendor-visible (D-09).
- **Proposed features** that touch this area (for example edit and delete, D-12 and D-15).
- **Integration API** impact. Anything the registration site can see stays as legacy (D-09).

Ask the owner to confirm or move rules between buckets.

## Phase 2: Settle questions

Do not plan until every question tied to the In rules is answered.

1. **Collect** questions:
   - Every open `Q-xx` whose Rules column names an In rule, or that an In rule's text names.
   - Every decision that says "settled per feature" (D-12 edit fields, D-15 delete effects) when this feature covers that entity.
   - Gaps you find yourself: behavior the docs do not cover, new-app choices legacy never faced (screen layout, empty states, error wording, which fields can change after scores exist, what the API returns).
2. **Ask** with `AskUserQuestion`, up to four at a time. Each question gives what legacy does, your recommendation first and marked "(Recommended)", and the trade-off. Group related questions.
3. **Follow up.** An answer often raises a new question (for example "edit is allowed" → "which fields, and what if scores exist?"). Keep asking until nothing tied to the In rules is open. Say when you think you are done, and ask the owner if anything is left.
4. **Record** each answer in `decisions-and-questions.md` before you write the plan:
   - An answered `Q-xx` moves to Decisions as the next free `D-xx`, with the reason, the rules, and today's date. Add it to the "Answered and moved" line.
   - A new choice (including any deviation from legacy) becomes a new `D-xx`.
   - A question you raised that the owner wants to leave open becomes a new `Q-xx`, and its rule goes to Later.
   - Update the rule's note in its feature file to cite the new decision, the way existing rules cite D-xx.

## Phase 3: Plan

Write `docs/plans/<feature>.md`:

```markdown
# Plan: <feature>

Branch: `migrate-<feature>`. Delete this file when the work is done.

## Scope

| Rule | Bucket | Note |
| --- | --- | --- |
| TRN-01 | In | |
| TRN-10 | Later | Edit and delete: next slice |

## Decisions used

D-xx: one line each, for every decision that shapes this work.

## Differs from legacy

| Rule | Legacy | New app | Decision |
| --- | --- | --- | --- |

## API

Routes, request and response shapes, status codes, errors. Note which are vendor-visible.

## Web

Screens, components, hooks, states (loading, error, empty), forms and messages. Link the mockups.

## Data

Types and storage. Note any schema change.

## Tests

Which test proves each In rule. Name the file and the case. Every In rule needs at least one.

## Steps

1. Ordered, small steps. Each one ends green (lint, typecheck, tests).

## Not doing

Anything the owner might expect that is out of scope, and why.
```

### UI mockups

If the feature adds or changes any screen, form, dialog, or list, make HTML mockups before the owner approves the plan.

1. Load the `ui-standards` skill and follow it: semantic HTML, the layout recipes, labels, and the states every data view needs.
2. Write one static HTML file per screen in `docs/plans/<feature>-mockups/`, such as `list.html` and `create-form.html`. Link the real styles so the mockup matches the app: `<link rel="stylesheet" href="../../../web/src/styles/tokens.css">` and `base.css`. No raw colors; use the tokens.
3. Show each state on the page, one after another with a heading: filled, loading, empty, error, and form validation errors with the real messages from the rules.
4. Use mock data that looks real (bowling center names, plausible fees and ratios).
5. Add an `index.html` that links every mockup, and list the files in the plan's Web section.
6. Ask the owner to open them in a browser (`open docs/plans/<feature>-mockups/index.html`). Revise until they approve. The approved mockup is the target for Phase 4.

Mockups are throwaway: no scripts beyond what a state needs, no build step.

### Review

Go through the plan with the owner section by section. Raise changes you would suggest (simpler routes, a rule that would be cheap to pull in, a risk). Revise until the owner approves. Then commit the plan and the doc updates from Phase 2:

```
git add docs/plans docs/migration
git commit -m "Plan <feature> migration"
```

## Phase 4: Build

1. Follow the plan's steps. Load the skills that fit: `api-patterns` and `api-testing-patterns` for `api/`; `react-patterns`, `typescript-standards`, `testing-patterns`, `ui-standards` for `web/`.
2. Cite the rule ID in each test name: `it("rejects an empty name (TRN-01)")`.
3. If the build shows the plan is wrong, stop. Tell the owner, agree a change, and update the plan file (and decisions, if it is a new choice) before you go on.
4. Before you call it done, run lint, typecheck, test, and `format:check` in each folder you changed (`npm run check` at the root does both). Run `npm run test:e2e` in `web/` if the UI flow changed. Run `npm run test:mutation` for new logic and fix survivors.
5. Commit in small steps with imperative messages that cite rules: `Add tournament create route (TRN-01 to TRN-09)`.

## Phase 5: Record

1. **Requirements.** Create or update `docs/requirements/<feature>.md` using the format in `docs/requirements/README.md`. One row per In rule, same ID, written as what the new app does (not what legacy did). Fold in the decisions. Link each rule to its tests. Add the file to the index in `docs/requirements/README.md`.
2. **Migration docs.** In each rules table that holds an In or Dropped rule, add a `Status` column as the last column (if it is not there) and fill it:
   - `Done`: built as legacy does it.
   - `Done, differs (D-xx)`: built, but not as legacy.
   - `Dropped (D-xx)`: will not be built.
   - Blank: not started (Later rules stay blank).
   Fill every row of a table you change, blank if needed, so the table still renders.
3. **Defects index.** Add `**Fixed.**` to each defect row this work fixed.
4. **Proposed features.** Mark any proposed feature this work built.
5. **Empty files.** If every rule in a migration file is now Done or Dropped, ask the owner whether to delete it. If yes, delete it and remove it from the README contents table. Never delete `decisions-and-questions.md`, `glossary.md`, or `domain-model.md` while other features remain.
6. **Delete the plan.** `git rm -r docs/plans/<feature>.md docs/plans/<feature>-mockups` (the mockups folder only if it exists).
7. **CLAUDE.md.** If the "Status and plan" section should mention this feature, propose a one-line update.
8. Commit:

```
git add docs
git commit -m "Record <feature> requirements and migration status"
```

9. Tell the owner what was built, what differs from legacy, what went to Later, and any new Q-xx. Point to `/pull-request-prep` for the review.

## Rules for every phase

- The migration docs win over memory and over the legacy code.
- A deviation from legacy is never silent. It needs a D-xx.
- Vendor-visible behavior (D-09) does not change without a written vendor change doc.
- When a .NET idea has a Node or React twin, say so once.
