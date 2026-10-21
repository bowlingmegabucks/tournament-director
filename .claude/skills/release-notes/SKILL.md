---
name: release-notes
description: Generate GitHub release notes (a markdown file) for a new version of this repo. Takes the changes since the last release tag (or since the first commit for a first release), groups them by feature with PR references, derives a release title, and adds a Full Changelog link. Marks 0.x versions as pre-releases. Usage: /release-notes [new-version]
---

Generate release notes for a new release. Write them to `release-notes.md` at the repo root so they paste straight into a GitHub release.

## Steps

### 1. Determine the range

The target is the ref the tag will point at: `origin/main` after `git fetch origin main --quiet`. Releases are tagged on `main`, so notes from a feature branch would list work that has not shipped. If the user names another ref, use that. Tell the user which ref you used.

The base is the latest release tag (`git describe --tags --abbrev=0 <target>`). If no tag exists, this is the first release: the base is empty and the range is all history up to the target.

If the current branch holds commits that `main` does not, say they are left out.

### 2. Get the new version number

If `$1` is not set, ask for the version. Do not guess it.

Accept `X.Y.Z` or `vX.Y.Z`. Use the `v` prefix everywhere (`v0.2.0`), which is this repo's tag convention.

### 3. Gather the changes

```
git log <base>..<target> --oneline      # first release: git log <target> --oneline
```

Squash-merged PRs look like `<sha> <Title> (#<number>)`. For each PR number:

```
gh pr view <number> --json title,body,labels
```

Skip PRs that only bump dependencies (label `dependencies` with no other change to behavior). Note that this repo's PRs often carry the `dependencies` label next to real work, so read the body before you skip one.

The PR body is the main source. These repos write `Summary` / `What Changed` / `Deferred` sections. Use `git log <range> --stat` only as a cross-check for commits with no PR (ignore `Initial commit`).

### 4. Draft `release-notes.md`

Write for someone who uses or runs the app, not someone reading a diff. Say what the product does now, not which files changed. Follow the writing rules in the global `CLAUDE.md`: short words, active voice, no stock figures of speech.

The file opens with the title as an H1 and has no intro sentence.

```markdown
# <new-version>: <title phrase>

### <Feature area> (#<pr>[, #<pr>...])

<1-3 sentences or a short bullet list, in plain language.>

### Under the hood

- **<Item>** (#<pr>) — <what it does and why it matters, brief>

**Full Changelog**: <link>
```

Rules:

- One `###` section per feature area a user would recognize (the tournament list, the theme, the API, deployment). Not one per PR. When several PRs shaped one area, list all their numbers in the heading.
- Cite every included PR as `#123`. GitHub links them.
- **Under the hood** holds work with no visible feature: CI, linting, audit jobs, skills, docs, test tooling. Keep each item to one line.
- Name anything a person must do to run this release: new secrets, variables, or env vars (for example `TRUST_PROXY=1` on Azure). Put it in the section it belongs to, or under a `### Setup notes` section when it spans several.
- No "not here yet" or deferred section, and no top summary sentence.
- Get `<owner>/<repo>` from `gh repo view --json nameWithOwner -q .nameWithOwner`.
- Link: with a previous tag, `https://github.com/<owner>/<repo>/compare/<previous-tag>...<new-version>`. For a first release, no compare is possible, so use `https://github.com/<owner>/<repo>/commits/<new-version>`.
- If a previous release exists (`gh release view <previous-tag>`), match its tone and structure.

### 5. Derive the title

Form: `<new-version>: <title phrase>`. The phrase has 3 to 6 words and names the theme of the release, for example `v0.1.0: First Working Release`. Propose it from the content; do not ask for it.

### 6. Reply

Tell the user:

- `release-notes.md` is written at the repo root, and which ref and range it covers.
- Any commits left out and why.
- The publish command, with the title from the H1 line (minus `# `). Add `--prerelease` when the major version is 0, and `--target main`:

  ```
  gh release create <new-version> --target main --title "<title>" --notes-file release-notes.md [--prerelease]
  ```

  Do not run it. Publishing is the owner's step, and it creates the tag.
- To delete `release-notes.md` after publishing. It is in `.gitignore` and does not belong in the repo.
