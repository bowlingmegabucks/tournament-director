/**
 * The legacy tables the tests need, copied from docs/migration/database.md.
 * Add a table here when a feature starts reading it.
 */
export const legacySchemaSql = [
  `CREATE TABLE \`Tournaments\` (
    \`Id\`                   char(36)     NOT NULL,
    \`Name\`                 longtext     NOT NULL,
    \`Start\`                datetime(6)  NOT NULL,
    \`End\`                  datetime(6)  NOT NULL,
    \`EntryFee\`             decimal(5,2) NOT NULL,
    \`Games\`                smallint     NOT NULL,
    \`FinalsRatio\`          decimal(3,1) NOT NULL,
    \`CashRatio\`            decimal(3,1) NOT NULL,
    \`BowlingCenter\`        longtext     NOT NULL,
    \`Completed\`            tinyint(1)   NOT NULL,
    \`SuperSweperCashRatio\` decimal(3,1) NOT NULL DEFAULT 0.0,
    PRIMARY KEY (\`Id\`)
  )`,
  `CREATE TABLE \`Divisions\` (
    \`Id\`                     char(36)     NOT NULL,
    \`Name\`                   longtext     NOT NULL,
    \`Number\`                 smallint     NOT NULL,
    \`TournamentId\`           char(36)     NOT NULL,
    \`MinimumAge\`             smallint     NULL,
    \`MaximumAge\`             smallint     NULL,
    \`MinimumAverage\`         int          NULL,
    \`MaximumAverage\`         int          NULL,
    \`HandicapPercentage\`     decimal(3,2) NULL,
    \`HandicapBase\`           int          NULL,
    \`MaximumHandicapPerGame\` int          NULL,
    \`Gender\`                 int          NULL,
    PRIMARY KEY (\`Id\`),
    FOREIGN KEY (\`TournamentId\`) REFERENCES \`Tournaments\` (\`Id\`) ON DELETE CASCADE
  )`,
  `CREATE TABLE \`Squads\` (
    \`Id\`              char(36)     NOT NULL,
    \`TournamentId\`    char(36)     NOT NULL,
    \`SquadType\`       int          NOT NULL,
    \`Date\`            datetime(6)  NOT NULL,
    \`CashRatio\`       decimal(3,1) NULL,
    \`MaxPerPair\`      smallint     NOT NULL,
    \`StartingLane\`    smallint     NOT NULL DEFAULT 0,
    \`NumberOfLanes\`   smallint     NOT NULL DEFAULT 0,
    \`Complete\`        tinyint(1)   NOT NULL,
    \`FinalsRatio\`     decimal(3,1) NULL,
    \`SquadEntryFee\`   decimal(5,2) NULL,
    \`SweeperEntryFee\` decimal(5,2) NULL,
    \`Games\`           smallint     NULL,
    PRIMARY KEY (\`Id\`),
    FOREIGN KEY (\`TournamentId\`) REFERENCES \`Tournaments\` (\`Id\`) ON DELETE CASCADE
  )`,
  `CREATE TABLE \`SweeperDivision\` (
    \`SweeperId\`        char(36) NOT NULL,
    \`DivisionId\`       char(36) NOT NULL,
    \`BonusPinsPerGame\` int      NULL,
    PRIMARY KEY (\`SweeperId\`, \`DivisionId\`),
    FOREIGN KEY (\`DivisionId\`) REFERENCES \`Divisions\` (\`Id\`) ON DELETE CASCADE,
    FOREIGN KEY (\`SweeperId\`)  REFERENCES \`Squads\` (\`Id\`)    ON DELETE CASCADE
  )`,
]
