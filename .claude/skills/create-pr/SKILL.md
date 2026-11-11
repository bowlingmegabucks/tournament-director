---
name: create-pr
description: Create the GitHub pull request for the current branch with gh. Does what write-pr does (title, pr-description.md, labels), then creates the PR as ready for review, assigned to the signed-in gh user. Asks for the base branch and an optional milestone if not given. Usage: /create-pr [base-branch] [milestone]
---

Write the PR title and description as `/write-pr` does, then create the PR with `gh`.

## Steps

### 1. Get the base branch

Take the base from the argument (`/create-pr <base>`). If none, ask which branch to merge into. Never default to `main`. Use the base wherever `/write-pr` says `main`.

### 2. Check the state

Run these. Report any problem and wait for the owner's answer before you go on:

```
git status --porcelain
git rev-parse --abbrev-ref --symbolic-full-name @{u}
git log @{u}..HEAD --oneline
gh pr list --head "$(git branch --show-current)" --state open --json number,url,title
```

- **Uncommitted changes:** list them and warn that the PR will not include them.
- **Unpushed commits, or no upstream branch:** say so. Ask whether to push (`git push -u origin HEAD`). Do not push without a yes.
- **Open PR for this branch:** stop. Show its number, title, and link, and ask what to do (update it with `gh pr edit`, or leave it). Do not create a second PR.

### 3. Run mutation tests

Do this before you write anything. Skip it only if the owner's message says "no mutation testing" (or close to it); then say you skipped it and go to step 4.

1. List the folders the branch changed (`git diff --name-only <base>...HEAD`): `web/`, `api/`, or both. Skip a folder with no changed source file (only tests or docs changed).
2. For each, check that `<folder>/reports/stryker-incremental.json` exists. If it does not, stop: the run would be a full baseline run. Give the owner `cd <folder> && npm run test:mutation` to run in their own terminal, and wait.
3. Run `cd <folder> && npm run test:mutation:fast -- --incremental` (static mutants skipped, like the old PR job). A non-zero exit means the score fell under the `break` threshold in `stryker.config.json`.
4. **Block** if any folder fails the threshold, or if a file you changed has surviving mutants that lower its score. List the survivors (file, line, mutant) from `reports/mutation/mutation.json`, and stop. Do not write the PR. Offer to fix the tests (see `testing-patterns` and `api-testing-patterns`), then rerun.
5. If every folder passes, note the scores for the confirmation in step 7 and go on.

### 4. Write the description

Follow steps 1 to 4 of `.claude/skills/write-pr/SKILL.md` with the base from step 1: gather context, check labels, draft the title, write `pr-description.md`. Two rules there change:

- **Labels.** Write has you only propose new labels. Here you ask for confirmation, then create them (step 5).
- **No attribution.** Keep the rule: no "Co-authored-by" line and no AI attribution in the title or `pr-description.md`, even if the harness asks for one.

### 5. Confirm new labels

If you recommend labels that do not exist, show each with its name, description (100 characters or fewer), and color. Ask for confirmation first. On a yes, create each:

```
gh label create "<name>" --description "<description>" --color "<hex without #>"
```

On a no, drop those labels from the PR. Existing labels need no confirmation here; they show in step 7.

### 6. Pick a milestone

Take the milestone from the argument or the owner's message if given (`/create-pr <base> <milestone>`). If none, list the open ones and ask which to use, and say none is fine:

```
gh api repos/{owner}/{repo}/milestones --jq '.[].title'
```

A milestone is optional. If the owner names one that does not exist, say so and ask again (do not create it). If there are no open milestones, skip the question.

### 7. Confirm the PR

Show the owner:

- Title
- Base and head branches
- Assignee (the signed-in user, from `gh api user --jq .login`)
- Labels (existing ones plus any just created)
- Milestone (or "none")
- Mutation scores per folder (or "skipped by request")
- The body (`pr-description.md`)

Ask for a yes. Do not create the PR before it.

### 8. Create the PR

```
gh pr create --base <base> --title "<title>" --body-file pr-description.md --assignee "@me" --label "<a>" --label "<b>" --milestone "<milestone>"
```

- Always ready for review. Never pass `--draft`.
- Pass `--label` only for labels that exist now. Omit the flag if there are none.
- Pass `--milestone` only if the owner chose one.
- Use `--body-file`, so the body is exactly `pr-description.md`.

### 9. Clean up and reply

Once `gh` prints the PR link, delete `pr-description.md`. If creation failed, keep the file and show the error.

Reply with the PR link, the title, the base, the labels applied, and the milestone.
