# Database

MariaDB 11.4, managed by EF Core migrations. Charset `utf8mb4`. This is the production schema as of the last legacy migration (`20250811162608_PaymentRegistrationInformation`). Checked against `DataContextModelSnapshot.cs`.

Source: `business logic/Database/` (entities, `DataContext.cs`, `Migrations/`).

## Schema

```sql
CREATE TABLE `Tournaments` (
  `Id`                   char(36)     NOT NULL,  -- UUID string
  `Name`                 longtext     NOT NULL,
  `Start`                datetime(6)  NOT NULL,  -- date only; time is 00:00
  `End`                  datetime(6)  NOT NULL,  -- date only; time is 00:00
  `EntryFee`             decimal(5,2) NOT NULL,  -- max 999.99
  `Games`                smallint     NOT NULL,  -- games per qualifying squad
  `FinalsRatio`          decimal(3,1) NOT NULL,  -- 1 in N advance, max 99.9
  `CashRatio`            decimal(3,1) NOT NULL,  -- 1 in N cash
  `BowlingCenter`        longtext     NOT NULL,
  `Completed`            tinyint(1)   NOT NULL,  -- nothing in legacy sets this to 1
  `SuperSweperCashRatio` decimal(3,1) NOT NULL DEFAULT 0.0,  -- sic: "Sweper"
  PRIMARY KEY (`Id`)
);

CREATE TABLE `Divisions` (
  `Id`                     char(36)     NOT NULL,
  `Name`                   longtext     NOT NULL,
  `Number`                 smallint     NOT NULL,  -- display order
  `TournamentId`           char(36)     NOT NULL,
  `MinimumAge`             smallint     NULL,
  `MaximumAge`             smallint     NULL,
  `MinimumAverage`         int          NULL,
  `MaximumAverage`         int          NULL,
  `HandicapPercentage`     decimal(3,2) NULL,      -- fraction: 0.90 = 90%
  `HandicapBase`           int          NULL,
  `MaximumHandicapPerGame` int          NULL,
  `Gender`                 int          NULL,      -- see Gender; NULL = any
  PRIMARY KEY (`Id`),
  FOREIGN KEY (`TournamentId`) REFERENCES `Tournaments` (`Id`) ON DELETE CASCADE
);

-- Squads and sweepers in one table (EF "table per hierarchy")
CREATE TABLE `Squads` (
  `Id`              char(36)     NOT NULL,
  `TournamentId`    char(36)     NOT NULL,
  `SquadType`       int          NOT NULL,          -- 0 = squad, 1 = sweeper
  `Date`            datetime(6)  NOT NULL,          -- date and start time
  `CashRatio`       decimal(3,1) NULL,              -- squad: override, NULL = use tournament; sweeper: required
  `MaxPerPair`      smallint     NOT NULL,
  `StartingLane`    smallint     NOT NULL DEFAULT 0,
  `NumberOfLanes`   smallint     NOT NULL DEFAULT 0,
  `Complete`        tinyint(1)   NOT NULL,          -- "Complete", not "Completed"
  `FinalsRatio`     decimal(3,1) NULL,              -- squad only: override, NULL = use tournament
  `SquadEntryFee`   decimal(5,2) NULL,              -- squad only: override, NULL = use tournament
  `SweeperEntryFee` decimal(5,2) NULL,              -- sweeper only: required for sweepers
  `Games`           smallint     NULL,              -- sweeper only: required for sweepers
  PRIMARY KEY (`Id`),
  FOREIGN KEY (`TournamentId`) REFERENCES `Tournaments` (`Id`) ON DELETE CASCADE
);

CREATE TABLE `SweeperDivision` (
  `SweeperId`        char(36) NOT NULL,  -- Squads.Id where SquadType = 1
  `DivisionId`       char(36) NOT NULL,
  `BonusPinsPerGame` int      NULL,      -- NULL = 0
  PRIMARY KEY (`SweeperId`, `DivisionId`),
  FOREIGN KEY (`DivisionId`) REFERENCES `Divisions` (`Id`) ON DELETE CASCADE,
  FOREIGN KEY (`SweeperId`)  REFERENCES `Squads` (`Id`)    ON DELETE CASCADE
);

CREATE TABLE `Bowlers` (
  `Id`                   char(36)    NOT NULL,
  `FirstName`            longtext    NOT NULL,
  `MiddleInitial`        char(1)     NOT NULL,  -- '' when none
  `LastName`             longtext    NOT NULL,
  `Suffix`               longtext    NOT NULL,  -- '' when none
  `StreetAddress`        longtext    NOT NULL,  -- '' when none
  `CityAddress`          longtext    NOT NULL,  -- '' when none
  `StateAddress`         char(2)     NOT NULL,  -- '' when none
  `ZipCode`              char(9)     NOT NULL,  -- 5 or 9 digits, no dash; '' when none
  `EmailAddress`         longtext    NOT NULL,  -- '' when none
  `PhoneNumber`          char(10)    NOT NULL,  -- 10 digits; '' when none
  `USBCId`               longtext    NOT NULL,  -- '' when none
  `DateOfBirth`          datetime(6) NULL,      -- date only
  `Gender`               int         NULL,      -- see Gender; NULL = unknown
  `SocialSecurityNumber` longtext    NOT NULL,  -- encrypted (see security.md); '' when none
  PRIMARY KEY (`Id`)
);

CREATE TABLE `Registrations` (
  `Id`           char(36)   NOT NULL,
  `BowlerId`     char(36)   NOT NULL,
  `DivisionId`   char(36)   NOT NULL,
  `Average`      int        NULL,
  `SuperSweeper` tinyint(1) NOT NULL,
  PRIMARY KEY (`Id`),
  FOREIGN KEY (`BowlerId`)   REFERENCES `Bowlers` (`Id`),    -- no cascade
  FOREIGN KEY (`DivisionId`) REFERENCES `Divisions` (`Id`)   -- no cascade
);

CREATE TABLE `SquadRegistration` (
  `RegistrationId` char(36)   NOT NULL,
  `SquadId`        char(36)   NOT NULL,          -- squad or sweeper
  `LaneAssignment` varchar(3) NOT NULL DEFAULT '', -- position like '15A'; '' = not assigned
  PRIMARY KEY (`RegistrationId`, `SquadId`),
  FOREIGN KEY (`RegistrationId`) REFERENCES `Registrations` (`Id`),  -- no cascade
  FOREIGN KEY (`SquadId`)        REFERENCES `Squads` (`Id`)          -- no cascade
);

CREATE TABLE `SquadScores` (
  `BowlerId` char(36) NOT NULL,
  `SquadId`  char(36) NOT NULL,  -- squad or sweeper
  `Game`     smallint NOT NULL,  -- 1-based
  `Score`    int      NOT NULL,  -- scratch pins; 1-300 on entry, 0 for no-shows
  PRIMARY KEY (`BowlerId`, `SquadId`, `Game`),
  FOREIGN KEY (`BowlerId`) REFERENCES `Bowlers` (`Id`),  -- no cascade
  FOREIGN KEY (`SquadId`)  REFERENCES `Squads` (`Id`)    -- no cascade
);

CREATE TABLE `Payments` (
  `Id`               char(36)     NOT NULL,
  `CreatedAtUtc`     datetime(6)  NOT NULL,
  `RegistrationId`   char(36)     NOT NULL,
  `ConfirmationCode` varchar(43)  NOT NULL,  -- unique; '<ProcessingSystem>_<code>'
  `Amount`           decimal(5,2) NOT NULL,
  PRIMARY KEY (`Id`),
  FOREIGN KEY (`RegistrationId`) REFERENCES `Registrations` (`Id`) ON DELETE CASCADE
);

CREATE INDEX        `IX_Divisions_TournamentId`            ON `Divisions` (`TournamentId`);
CREATE INDEX        `IX_Squads_TournamentId`               ON `Squads` (`TournamentId`);
CREATE INDEX        `IX_SweeperDivision_DivisionId`        ON `SweeperDivision` (`DivisionId`);
CREATE INDEX        `IX_Registrations_DivisionId`          ON `Registrations` (`DivisionId`);
CREATE UNIQUE INDEX `IX_Registrations_BowlerId_DivisionId` ON `Registrations` (`BowlerId`, `DivisionId`);
CREATE INDEX        `IX_SquadRegistration_SquadId`         ON `SquadRegistration` (`SquadId`);
CREATE INDEX        `IX_SquadScores_SquadId`               ON `SquadScores` (`SquadId`);
CREATE UNIQUE INDEX `IX_Payments_ConfirmationCode`         ON `Payments` (`ConfirmationCode`);
CREATE INDEX        `IX_Payments_RegistrationId`           ON `Payments` (`RegistrationId`);
```

EF Core also keeps `__EFMigrationsHistory` (`MigrationId` varchar(150), `ProductVersion` varchar(32)).

## Enum values

### Gender (`Bowlers.Gender`, `Divisions.Gender`)

| Value | Meaning |
| --- | --- |
| `0` | Male |
| `1` | Female |
| `NULL` | Bowler: not known. Division: open to any gender. |

There is no "Any" value. The old `rewrite/DATABASE.md` listed `2 = Any`; the code has no such value.

### SquadType (`Squads.SquadType`)

| Value | Meaning |
| --- | --- |
| `0` | Qualifying squad |
| `1` | Sweeper |

## Storage quirks

Handle each of these in the new repository layer.

1. **Typo:** `Tournaments.SuperSweperCashRatio` (one "e"). Map it; do not rename without a migration.
2. **`Complete` vs `Completed`:** squads use `Complete`, tournaments use `Completed`.
3. **Empty string, not NULL.** Bowler text fields are `NOT NULL` and store `''` when absent. Read `''` as "none". Write `''`, never NULL.
4. **Dates stored as datetime.** `Tournaments.Start`, `End`, and `Bowlers.DateOfBirth` are dates saved at midnight. `Squads.Date` is a real date and time (local time of the center; no time zone stored).
5. **Ratios are decimals** with one decimal place (`7.5` is valid). Fees have two.
6. **One table, two shapes.** In `Squads`, the columns that do not apply to a row's type are NULL. That is normal.
7. **`Squads.CashRatio` means two things.** For squads it is an optional override. For sweepers it is the sweeper's own required cash ratio.
8. **IDs are UUID strings** in `char(36)`, generated by the app (`Guid.NewGuid()`), not by the database.
9. **No cascade** from `Bowlers` or `Divisions` to `Registrations`, or from `Registrations` and `Squads` to `SquadRegistration` and `SquadScores`. Delete children in code first. Legacy deletes a registration by clearing its `SquadRegistration` rows, then the registration; `Payments` cascade.
10. **The unique index is weaker than the rule.** `(BowlerId, DivisionId)` is unique, but the business rule is one registration per bowler per tournament (`REG-01`). D-03: the new app enforces the stronger rule in code. Whether to add a database constraint is decided with the Prisma work.
11. **Lane position and phone are fixed-width text.** `LaneAssignment` max 3 characters, `PhoneNumber` exactly 10 digits or empty.

## Migration history

| Migration | Change |
| --- | --- |
| `20220527183020_TournamentEntities` | Tournaments, Divisions, Squads, SweeperDivision |
| `20220615233907_BowlerEntity` | Bowlers |
| `20220622145345_StartingAndNumberOfLanes` | `Squads.StartingLane`, `NumberOfLanes` (default 0) |
| `20220816235947_AddRegistration` | Registrations, SquadRegistration |
| `20220831173955_SquadLaneAssignment` | `SquadRegistration.LaneAssignment` (default '') |
| `20221017125314_SquadScores` | SquadScores |
| `20221020195709_SuperSweeperCashRatio` | `Tournaments.SuperSweperCashRatio` (default 0) |
| `20230316131029_BowlerSSN` | `Bowlers.SocialSecurityNumber` |
| `20230802154109_TournamentSquadEntryFee` | `Squads.SquadEntryFee` |
| `20241128140948_RegistrationAltKeyToIndex` | `(BowlerId, DivisionId)` alternate key becomes a unique index |
| `20250811162608_PaymentRegistrationInformation` | Payments |

## Plan for the new app

- The live schema is the starting point. Prisma introspects it (see the earlier `plan/01-tournaments.md` in the `tournament-manager` repo).
- Rename in the mapping layer (`superSweeperCashRatio`), not in the database, until a planned migration.
- Forward-only migrations.
- The new app must keep reading SSNs written by legacy. See [security.md](security.md).
