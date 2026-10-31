# Requirements

What the new app does, feature by feature. These files replace [docs/migration/](../migration/README.md) as we build: once a legacy rule is built, its lasting record lives here.

The `/migrate-feature` skill writes these files. Edit them by hand when a requirement changes, and update the tests with it.

## Rules

- **Keep the legacy rule ID** (`TRN-01`), so tests, commits, and PRs stay traceable. A new rule with no legacy twin gets the feature prefix and the next free number, marked "new".
- **Describe the new app**, not legacy. Fold in the decisions; do not make readers chase them.
- **Name every difference from legacy** and cite the decision (`D-13`) in `docs/migration/decisions-and-questions.md`.
- **Link the tests** that prove each rule.

## File format

```markdown
# <Feature>

Built on branch `migrate-<feature>`. Migration source: [docs/migration/<feature>.md](../migration/<feature>.md).

## Fields

| Field | Type | Required | Notes |
| ----- | ---- | -------- | ----- |

## Rules

| ID     | Requirement                                         | Differs from legacy             | Tests                                         |
| ------ | --------------------------------------------------- | ------------------------------- | --------------------------------------------- |
| TRN-01 | Name is required. Message: "Name is required"       |                                 | `api/src/features/tournaments/routes.test.ts` |
| TRN-09 | Super sweeper cash ratio must be at least 1 on save | Yes: legacy has no check (D-13) | ...                                           |

## API

Routes, shapes, status codes.

## Screens

What the user sees and can do.
```

## Index

| Feature                                 | File                                             |
| --------------------------------------- | ------------------------------------------------ |
| Tournaments (list, Home card, overview) | [tournaments.md](tournaments.md)                 |
| Divisions (list)                        | [divisions.md](divisions.md)                     |
| Squads and sweepers (lists)             | [squads-and-sweepers.md](squads-and-sweepers.md) |
| Registrations (list)                    | [registrations.md](registrations.md)             |
| Lane assignments (page, drag, portal)   | [lane-assignments.md](lane-assignments.md)       |
| Recap sheets (preview, print, the cross) | [recap-sheets.md](recap-sheets.md)              |
| Scores (view)                           | [scores.md](scores.md)                           |
| Results (squad and sweeper)             | [results.md](results.md)                         |
| Navigation and layout                   | [navigation.md](navigation.md)                   |
| API route access                        | [api-access.md](api-access.md)                   |
