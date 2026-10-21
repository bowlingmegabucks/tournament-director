# Corrections to the old `rewrite/` docs

The `tournament-manager` repo's `rewrite/REWRITE_SPEC.md` and `rewrite/DATABASE.md` were a first pass. Checked against the legacy code, these statements were wrong. These docs replace both files.

| Old claim | What the code does | See |
| --- | --- | --- |
| SSN uses AES-256-**GCM** | AES-256-**CBC**, PBKDF2-SHA256 key (100,000 rounds), salt and IV stored with the ciphertext | `SEC-03` to `SEC-08` |
| Gender enum has `2 = Any` | Only `0 = Male`, `1 = Female`; NULL means any | [database.md](database.md#enum-values) |
| Display name is `First [M.] Last [Suffix]` | `First Last`, plus `, Suffix`; no middle initial | `BWL-13` |
| Eligibility is advisory only | Legacy blocks. (D-01 makes the new app warn, so the old intent stands for the new app) | `REG-04` |
| A bowler can register in several divisions of one tournament | One registration per tournament | `REG-01` |
| Scores are 0 to 300 | 1 to 300 when entered; 0 only for no-shows on completion | `SCR-01`, `SQD-15` |
| Sweeper handicap is +10 / +6 / 0 by bowler type | A number typed per division per sweeper; no categories in code | `SCR-09`, Q-11 |
| Sweeper results break down by division | One list for the whole sweeper | `RES-22` |
| Cashers = `floor(entries / cashRatio)`, advancers fill them first | Same idea, but: 0 advancers means exactly 1 casher; previous advancers above the cut take cash spots and can exceed the count | `RES-05`, `RES-08` |
| Tie-break: highest game, then 2nd, 3rd, ... | First: more games bowled. Then total, then high game **with handicap**, then 2nd, 3rd ... scratch | `SCR-11` |
| At-large uses the advancing ratio (squad or tournament) | Always the tournament finals ratio | `RES-12` |
| Seeding uses "total handicap pinfall" | Each finalist's best single squad, which may not be the squad they advanced from | `RES-19` |
| Squads have a cash ratio override | True for squads. For sweepers the same column is the sweeper's required cash ratio | [database.md](database.md#storage-quirks) |
| Delete squad, edit tournament, roles, 1099 report, PDF endpoints | Not in legacy | [proposed-features.md](proposed-features.md) |
| Delete registration warns if scores exist | Blocks if scores exist | `REG-19` |
| The Payments migration `.cs` file may be missing | It exists: `20250811162608_PaymentRegistrationInformation.cs` | [database.md](database.md#migration-history) |
| Payments have a user-entered confirmation code | Stored as `<ProcessingSystem>_<code>`; desk adds `$0 Manual_<uuid>` | `PAY-01a`, `PAY-02` |
| Third-party API: authenticated limit 50/min | Configured, but never applied (`API-14`) | [integration-api.md](integration-api.md) |
| Third-party API creates bowlers matched "by USBC ID or name" | USBC ID only | `REG-07` |
| Hosting is GreenGeeks | Legacy API runs on Azure App Service with Key Vault; the new app's plan is in `docs/deployment.md` | [README.md](README.md#the-legacy-system-at-a-glance) |
