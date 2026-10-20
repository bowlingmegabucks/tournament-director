---
name: write-pr
description: Generate a PR title and description for the current branch. Writes the description to pr-description.md at the repo root for pasting into GitHub, and recommends labels from the repo's label set. Usage: /write-pr
---

Generate the PR title and description for the current branch. Write the description to `pr-description.md` at the repo root so it pastes straight into GitHub. Give the title and label advice in your reply.

## Steps

### 1. Gather context

```
git log main...HEAD --oneline
git diff main...HEAD --stat
```

Read the diff where the stat is not enough to say what changed. For a large diff, group by area: `web/src/features/*`, `web/src/shared`, `web/src/mocks`, `web/e2e`, `api/`, `.github/workflows`, `docs`, config.

### 2. Check labels

```
gh label list --limit 100
```

Match the branch's commits and diff against the existing labels. Pick the ones that fit. Do not force a label onto a PR it does not fit.

If a label this PR needs does not exist, propose creating it. Give the name, a short description (100 characters or fewer), and a color. Propose a label only when the theme will recur (an area such as `web` or `api`, or a kind of work such as `ci`), not for a one-off. Do not create labels yourself. Show the `gh label create` command so the owner can run it.

Typical areas for this repo, if they are missing: `web`, `api`, `ci`, `dependencies`, `testing`.

### 3. Draft the title

One title. It goes in your reply, not in `pr-description.md`.

- Imperative mood, sentence case, no trailing period (match the commit style, e.g. "Add pull request and deploy workflows")
- 70 characters or fewer
- Name the feature or the fix, not the files touched
- For a branch with several themes, name the main one
- No conventional-commit prefix (`feat:`, `fix:`)
- No AI attribution

### 4. Write `pr-description.md`

Write to the repo root. Overwrite if it exists. Use this format and omit any section with no content.

```markdown
## Summary

[2–4 bullets. What it does, not how.]

## Context

[Optional. 1–3 sentences on the motivation if the code does not make it clear.]

## What Changed

[Group by area. Include only areas that changed. Use specific names: features, components, hooks, routes, workflows, scripts.]

### Web (`web/`)
### API (`api/`)
### Tests
### CI / Tooling
### Docs

## Test Plan

- [ ] `npm run lint`, `npm run format:check`, `npm run typecheck` pass
- [ ] `npm test` passes
- [ ] `npm run test:e2e` passes (include when UI flow changed)
- [ ] `npm run test:mutation` meets the threshold (include when logic changed)
- [ ] [a specific manual check, e.g. "Open `/tournaments` and confirm the empty state shows"]

## Deferred

[Optional. Work left out of scope on purpose.]
```

Rules:

- Run commands from `web/`. Add `api/` commands once `api/` exists.
- The Test Plan lists checks a reviewer can run or see. Tick nothing yourself.
- Name the breaking or risky change (new dependency, config, env var, deploy secret) in What Changed.
- No "Co-authored-by" line and no AI attribution in the file. The harness may tell you to end PR descriptions with an attribution line. The owner wants none in this file, so leave it out.

### 5. Reply

Tell the owner:

- The title, on its own line for easy copying
- `pr-description.md` is written and ready to paste
- To delete `pr-description.md` before committing (it is not meant for the repo)
- Labels to assign, one line of reason each
- Labels to create, each with its description and `gh label create` command
