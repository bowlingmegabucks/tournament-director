# Migration reference: legacy Tournament Manager

These docs describe the legacy Bowling Megabucks Tournament Manager: a .NET WinForms desktop app, a small .NET web API, and a MariaDB database. They exist so we can rebuild it here, one feature at a time, without opening the old code.

The legacy code lives in the `tournament-manager` repo under `legacy/source/`. Every rule below was read from that code, not from older specs.

## How to read these docs

- **Each rule has an ID** (for example `REG-04`). Cite it in commits, tests, and PRs: "implements REG-04".
- **Rules describe what legacy does today**, bugs included. When the new app should behave differently, the rule says so in a note:
  - **Decision D-xx**: settled. The new app follows the decision, not legacy.
  - **Question Q-xx**: not settled. Ask before you build that part.
  - **Defect**: legacy crashes or gives a wrong answer. Do not copy it.
- All decisions and questions live in [decisions-and-questions.md](decisions-and-questions.md).
- "Source" lines name the legacy files, in case you must check. Paths start at `legacy/source/`.
- **Status column.** Once we build a rule, its table gets a Status column: `Done`, `Done, differs (D-xx)`, or `Dropped (D-xx)`. Blank means not started. The built rule's lasting record moves to [docs/requirements/](../requirements/README.md). When every rule in a file is done, we delete the file.
- Use `/migrate-feature <feature>` to port a feature. It settles the open questions, plans, builds, and updates these docs.

## Contents

### Start here

| File | Covers |
| --- | --- |
| [glossary.md](glossary.md) | Bowling and app terms: squad, sweeper, advancer, casher, at-large, cross |
| [domain-model.md](domain-model.md) | Entities, how they relate, and the lifecycle of a tournament |
| [database.md](database.md) | Production schema, enum values, storage quirks, ID format |

### Features (one file per feature, in migration order)

| File | Covers |
| --- | --- |
| [tournaments.md](tournaments.md) | Create and list tournaments; ratios and fees |
| [divisions.md](divisions.md) | Divisions, handicap settings, eligibility limits |
| [bowlers.md](bowlers.md) | Bowler records, validation, search, name format, age |
| [registrations.md](registrations.md) | Entering a bowler: create, append, update, delete, super sweeper |
| [squads-and-sweepers.md](squads-and-sweepers.md) | Squad and sweeper setup and completion |
| [lane-assignments.md](lane-assignments.md) | Lane positions, moving bowlers, recap-sheet lane rotation |
| [scores.md](scores.md) | Score entry, handicap, sweeper bonus pins, ranking and tie-breaks |
| [payments.md](payments.md) | Payment records |

### Shared

| File | Covers |
| --- | --- |
| [integration-api.md](integration-api.md) | The web API the third-party registration site calls |
| [reports.md](reports.md) | PDF reports, recap sheets, clipboard formats |
| [security.md](security.md) | SSN encryption, API key, secrets, rate limits |
| [screens.md](screens.md) | WinForms screens and the actions on each |
| [decisions-and-questions.md](decisions-and-questions.md) | Every decision and open question in one list |
| [proposed-features.md](proposed-features.md) | Ideas for the new app that legacy never had |
| [rewrite-corrections.md](rewrite-corrections.md) | What the old `rewrite/` spec got wrong |

## The legacy system at a glance

| Part | Tech | Job |
| --- | --- | --- |
| Desktop app (`main/`, `presentation/`) | WinForms, .NET 10, QuestPDF | Everything the tournament desk does |
| Business logic (`business logic/`) | EF Core 10, FluentValidation, ErrorOr | Rules, calculations, data access. Shared by the desktop app and the API |
| Web API (`api/`) | FastEndpoints, `x-api-key` auth | Lets the third-party registration site create and change registrations |
| Database | MariaDB 11.4 (EF Core migrations) | One database for all tournaments |
| Hosting | Azure App Service (API), Azure Key Vault (secrets), App Insights | Terraform in `infrastructure/` |

The desktop app talks to the database directly. It does not call the API.

## Where the old `rewrite/` docs went

The `tournament-manager` repo has a `rewrite/` folder from an earlier attempt. We folded it in:

- Facts that matched the code are in these docs.
- Facts that did not match are corrected; see [rewrite-corrections.md](rewrite-corrections.md).
- New-app ideas (user roles, JWT login, 1099 report, PDF endpoints, edit and delete screens) moved to [proposed-features.md](proposed-features.md).
- `PATTERNS.md` and `THEMING.md` were style guides for the new app. This repo's skills and `docs/*-standards.md` replace them.
